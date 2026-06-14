/**
 * Standalone engine smoke test (no electron).
 * Run with:  node --import tsx scripts/test-engines.mts
 *
 * For each available engine it writes a sample parametric box (with a hollow wall)
 * + matching params.json into a temp workspace, renders it, and asserts model.stl
 * exists, is non-empty, and reports facets > 0. Then it changes a param value,
 * re-renders, and asserts the STL bytes changed. cadquery/build123d are tested only
 * if the managed venv can import them; otherwise they are skipped gracefully.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  rmSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import type { ParamsFile } from '../src/shared/params'
import type { EngineId, RenderOutcome } from '../src/shared/types'

// The engine layer source files import via the `@shared/*` path alias, which
// electron-vite resolves in the real app. Under a bare `node --import tsx` run there
// is no bundler, so teach the CommonJS resolver to map `@shared/*` → src/shared/*
// before importing any engine module.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..')
const SHARED_DIR = path.join(REPO_ROOT, 'src', 'shared')
{
  const Module = createRequire(import.meta.url)('node:module') as {
    _resolveFilename: (request: string, ...rest: unknown[]) => string
  }
  const original = Module._resolveFilename
  Module._resolveFilename = function (request: string, ...rest: unknown[]): string {
    if (request === '@shared' || request.startsWith('@shared/')) {
      const rel = request === '@shared' ? '' : request.slice('@shared/'.length)
      return original.call(this, path.join(SHARED_DIR, rel), ...rest)
    }
    return original.call(this, request, ...rest)
  }
}

// Import AFTER the alias shim is installed.
const { createEngineLayer } = await import('../src/main/cad/engineLayer')
const { venvProbe, venvPythonPath } = await import('../src/main/cad/venvManager')

const root = mkdtempSync(path.join(os.tmpdir(), 'protoloop-engtest-'))
const venvDir = path.join(root, 'venv')
const engines = createEngineLayer({ venvDir })

let passes = 0
let failures = 0
const results: string[] = []

function record(engine: string, ok: boolean, detail: string): void {
  if (ok) {
    passes++
    results.push(`PASS  ${engine.padEnd(10)} ${detail}`)
  } else {
    failures++
    results.push(`FAIL  ${engine.padEnd(10)} ${detail}`)
  }
}

function describeOutcome(o: RenderOutcome): string {
  if (o.ok) {
    const f = o.facets != null ? `${o.facets} facets` : 'facets n/a'
    const step = o.stepPath ? ' +step' : ''
    return `${f}, ${o.durationMs}ms${step}`
  }
  return `${o.code}: ${o.message}${o.stderrTail ? ` | ${o.stderrTail.split('\n').slice(-3).join(' / ')}` : ''}`
}

// ---------- sample sources ----------
const SCAD = `// parametric hollow box
width = 40;
depth = 30;
height = 25;
wall = 2.5;
$fn = 48;
module part() {
  difference() {
    cube([width, depth, height], center = false);
    translate([wall, wall, wall])
      cube([width - 2 * wall, depth - 2 * wall, height], center = false);
  }
}
part();
`

const JS = `const { primitives, booleans, transforms } = require('@jscad/modeling')
function main(params) {
  const { width = 40, depth = 30, height = 25, wall = 2.5 } = params
  const outer = primitives.cuboid({ size: [width, depth, height] })
  const inner = transforms.translate(
    [0, 0, wall],
    primitives.cuboid({ size: [width - 2 * wall, depth - 2 * wall, height] })
  )
  return booleans.subtract(outer, inner)
}
module.exports = { main }
`

const PY_CADQUERY = `import cadquery as cq
def build(width=40, depth=30, height=25, wall=2.5):
    outer = cq.Workplane("XY").box(width, depth, height, centered=(True, True, False))
    inner = cq.Workplane("XY").workplane(offset=wall).box(
        width - 2 * wall, depth - 2 * wall, height, centered=(True, True, False))
    return outer.cut(inner)
`

const PY_BUILD123D = `from build123d import *
def build(width=40, depth=30, height=25, wall=2.5):
    with BuildPart() as part:
        Box(width, depth, height, align=(Align.CENTER, Align.CENTER, Align.MIN))
        with BuildPart(part.faces().sort_by(Axis.Z)[-1], mode=Mode.SUBTRACT):
            Box(width - 2 * wall, depth - 2 * wall, height,
                align=(Align.CENTER, Align.CENTER, Align.MAX))
    return part.part
`

function makeParams(engine: EngineId, sourceFile: string): ParamsFile {
  return {
    schemaVersion: 1,
    engine,
    sourceFile,
    units: 'mm',
    params: [
      {
        name: 'width',
        label: 'Width',
        type: 'number',
        value: 40,
        min: 20,
        max: 80,
        step: 1,
        unit: 'mm'
      },
      {
        name: 'depth',
        label: 'Depth',
        type: 'number',
        value: 30,
        min: 20,
        max: 80,
        step: 1,
        unit: 'mm'
      },
      {
        name: 'height',
        label: 'Height',
        type: 'number',
        value: 25,
        min: 10,
        max: 60,
        step: 1,
        unit: 'mm'
      },
      {
        name: 'wall',
        label: 'Wall',
        type: 'number',
        value: 2.5,
        min: 1,
        max: 5,
        step: 0.1,
        unit: 'mm'
      }
    ]
  }
}

async function testEngine(engine: EngineId, sourceFile: string, source: string): Promise<void> {
  const ws = path.join(root, engine)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  writeFileSync(path.join(ws, sourceFile), source)

  const params = makeParams(engine, sourceFile)
  writeFileSync(path.join(ws, 'params.json'), JSON.stringify(params, null, 2))

  // 1) initial render
  const first = await engines.render({ workspaceDir: ws, params })
  const stlPath = path.join(ws, 'model.stl')
  if (!first.ok) {
    record(engine, false, `initial render: ${describeOutcome(first)}`)
    return
  }
  if (!existsSync(stlPath)) {
    record(engine, false, 'initial render reported ok but model.stl missing')
    return
  }
  const size1 = statSync(stlPath).size
  if (size1 <= 0) {
    record(engine, false, 'model.stl is empty')
    return
  }
  if (first.facets != null && first.facets <= 0) {
    record(engine, false, `facets not > 0 (${first.facets})`)
    return
  }
  const bytes1 = readFileSync(stlPath)

  // For B-rep engines, confirm STEP too.
  if (
    (engine === 'cadquery' || engine === 'build123d') &&
    !existsSync(path.join(ws, 'model.step'))
  ) {
    record(engine, false, 'STEP not exported')
    return
  }

  // 2) change a param and re-render; expect different bytes
  const params2 = makeParams(engine, sourceFile)
  const widthParam = params2.params.find((p) => p.name === 'width')
  if (widthParam) widthParam.value = 60
  writeFileSync(path.join(ws, 'params.json'), JSON.stringify(params2, null, 2))

  const second = await engines.render({ workspaceDir: ws, params: params2 })
  if (!second.ok) {
    record(engine, false, `re-render: ${describeOutcome(second)}`)
    return
  }
  const bytes2 = readFileSync(stlPath)
  const changed = bytes2.length !== bytes1.length || !bytes2.equals(bytes1)
  if (!changed) {
    record(engine, false, 'STL did not change after param edit')
    return
  }

  record(
    engine,
    true,
    `${describeOutcome(first)} -> width=60 ${describeOutcome(second)} (bytes ${bytes1.length} -> ${bytes2.length})`
  )
}

async function main(): Promise<void> {
  console.log(`temp workspace root: ${root}\n`)

  // openscad + jscad are the must-pass engines
  await testEngine('openscad', 'model.scad', SCAD)
  await testEngine('jscad', 'model.js', JS)

  // cadquery + build123d only if the venv is healthy
  const haveVenv = existsSync(venvPythonPath(venvDir)) && (await venvProbe(venvDir))
  if (haveVenv) {
    await testEngine('cadquery', 'model.py', PY_CADQUERY)
    await testEngine('build123d', 'model.py', PY_BUILD123D)
  } else {
    results.push('SKIP  cadquery   no managed venv (run installVenv to enable)')
    results.push('SKIP  build123d  no managed venv (run installVenv to enable)')
  }

  console.log('---- engine test results ----')
  for (const line of results) console.log(line)
  console.log('-----------------------------')
  console.log(`${passes} passed, ${failures} failed`)

  // cleanup temp dir (best effort)
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* ignore */
  }

  // Must-pass gate: openscad + jscad.
  const mustPass = results.filter(
    (r) => r.startsWith('PASS') && (r.includes('openscad') || r.includes('jscad'))
  ).length
  if (mustPass < 2 || failures > 0) process.exit(1)
}

main().catch((err) => {
  console.error('test harness crashed:', err)
  process.exit(1)
})
