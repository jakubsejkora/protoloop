/**
 * End-to-end agent → render → slider test (NO electron, but a REAL `claude` call).
 * Run with:  node --import tsx scripts/e2e-agent.mts
 *
 * 1. Spins up CliBackend in a temp workspace and asks it to build a parametric box.
 * 2. Waits for the agent to author model.scad + params.json.
 * 3. Renders via the engine layer and asserts a non-empty STL with facets > 0.
 * 4. Changes a parameter value and re-renders, asserting the STL changed
 *    (the no-LLM slider fast-path).
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'

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

const { CliBackend } = await import('../src/main/agent/CliBackend')
const { buildSystemPrompt, buildClaudeMd } = await import('../src/main/agent/promptContract')
const { createEngineLayer } = await import('../src/main/cad/engineLayer')
const { parseParamsFile } = await import('../src/shared/params')
import type { AgentEvent } from '../src/shared/types'

const ws = mkdtempSync(path.join(os.tmpdir(), 'protoloop-e2e-'))
const venvDir = path.join(os.homedir(), 'Library', 'Application Support', 'protoloop', 'venvs', 'cad')
const engines = createEngineLayer({ venvDir })

writeFileSync(path.join(ws, 'CLAUDE.md'), buildClaudeMd({ engine: 'openscad', mode: 'cad' }))

console.log('workspace:', ws)

const backend = new CliBackend({
  workspaceDir: ws,
  model: 'claude-sonnet-4-6',
  effort: 'high',
  systemPrompt: buildSystemPrompt({ engine: 'openscad', mode: 'cad' }),
  sessionId: randomUUID(),
  firstMessage:
    'Build a parametric rounded rectangular box: length 40mm, width 30mm, height 20mm, ' +
    'wall thickness 2mm, corner radius 3mm. Skip the clarifying questions and build it right now. ' +
    'Expose length, width, height, wall, corner_radius as parameters.'
})

let assistantText = ''
const tools: string[] = []

function waitForDone(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for agent')), timeoutMs)
    backend.onEvent((e: AgentEvent) => {
      if (e.kind === 'tool_start') tools.push(e.label)
      if (e.kind === 'assistant_message') assistantText = e.text
      if (e.kind === 'assistant_delta') process.stdout.write('.')
      if (e.kind === 'error') console.log('\n[agent error]', e.message)
      if (e.kind === 'done') {
        clearTimeout(t)
        resolve()
      }
    })
  })
}

const hasArtifacts = (): boolean =>
  existsSync(path.join(ws, 'model.scad')) && existsSync(path.join(ws, 'params.json'))

let failed = false
function check(label: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${extra}`)
  if (!ok) failed = true
}

try {
  await backend.start()
  await waitForDone(180_000)
  console.log('\n--- agent turn 1 done ---')
  console.log('tools:', tools.join(' | ') || '(none)')

  // If it asked questions instead of building, nudge it once.
  if (!hasArtifacts()) {
    console.log('No artifacts yet; sending a build nudge…')
    await backend.send('Use sensible defaults and build it now. Skip any further questions.')
    await waitForDone(180_000)
  }

  check('agent wrote model.scad', existsSync(path.join(ws, 'model.scad')))
  check('agent wrote params.json', existsSync(path.join(ws, 'params.json')))

  const params = parseParamsFile(readFileSync(path.join(ws, 'params.json'), 'utf8'))
  check('params.json is valid', !!params, params ? `(${params.params.length} params)` : '')

  if (params) {
    const r1 = await engines.render({ workspaceDir: ws, params })
    check('render #1 ok', r1.ok, r1.ok ? `${r1.facets} facets, ${r1.durationMs}ms` : JSON.stringify(r1))
    const stlPath = path.join(ws, 'model.stl')
    const size1 = existsSync(stlPath) ? statSync(stlPath).size : 0
    check('model.stl non-empty', size1 > 100, `${size1} bytes`)

    // slider fast-path: bump the first numeric param ~1.4x and re-render
    const num = params.params.find((p) => p.type === 'number' || p.type === 'int')
    if (num && typeof num.value === 'number') {
      const before = readFileSync(stlPath)
      const bumped = {
        ...params,
        params: params.params.map((p) =>
          p.name === num.name ? { ...p, value: Math.round((num.value as number) * 1.4) } : p
        )
      }
      const r2 = await engines.render({ workspaceDir: ws, params: bumped })
      check('render #2 (slider) ok', r2.ok)
      const after = readFileSync(stlPath)
      check(
        `slider changed geometry (${num.name})`,
        before.length !== after.length || !before.equals(after),
        `${before.length} → ${after.length} bytes`
      )
    } else {
      check('has a numeric param to drive', false)
    }
  }
} catch (err) {
  console.log('\n[exception]', (err as Error).message)
  failed = true
} finally {
  backend.abort()
}

console.log('\nassistant said:', assistantText.slice(0, 240).replace(/\n/g, ' '))
console.log(failed ? '\n❌ E2E FAILED' : '\n✅ E2E PASSED')
process.exit(failed ? 1 : 0)
