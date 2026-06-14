/**
 * OpenSCAD render engine. Runs the CLI with discrete argv (no shell) via execFile.
 *
 * Verified working command:
 *   -o <out>.stl --export-format binstl --backend Manifold --summary geometry
 *   --summary-file - -D k=v ... <ws>/model.scad
 * stdout is `{"geometry":{"facets":N,"vertices":M,...}}`; stderr carries warnings/errors.
 * A non-zero exit OR any stderr line containing `ERROR:` ⇒ render failure (no STL written).
 */
import { execFile } from 'node:child_process'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { ParamsFile } from '@shared/params'
import type { RenderError, RenderResult } from '@shared/types'
import { toOpenscadArgs } from './paramEncoding'

const SOURCE_FILE = 'model.scad'
const RENDER_TIMEOUT_MS = 120_000

export interface OpenscadRunHandle {
  /** the spawned child, so a queue can SIGKILL a stale in-flight render */
  child: ChildProcess
  /** resolves with the render outcome (never rejects) */
  done: Promise<RenderResult | RenderError>
}

interface GeometrySummary {
  facets?: number
  vertices?: number
}

function parseSummary(stdout: string): GeometrySummary {
  try {
    const json = JSON.parse(stdout.trim())
    const g = json?.geometry ?? {}
    return {
      facets: typeof g.facets === 'number' ? g.facets : undefined,
      vertices: typeof g.vertices === 'number' ? g.vertices : undefined
    }
  } catch {
    return {}
  }
}

function tail(text: string, lines = 20): string {
  return text.split('\n').filter(Boolean).slice(-lines).join('\n')
}

/**
 * Render model.scad to `outStlPath`. Returns a handle whose `child` can be killed
 * and whose `done` promise resolves to a RenderResult or RenderError (never rejects).
 */
export function runOpenscadRender(opts: {
  bin: string
  workspaceDir: string
  params: ParamsFile
  outStlPath: string
}): OpenscadRunHandle {
  const { bin, workspaceDir, params, outStlPath } = opts
  const scadPath = path.join(workspaceDir, SOURCE_FILE)
  const started = Date.now()

  const args = [
    '-o',
    outStlPath,
    '--export-format',
    'binstl',
    '--backend',
    'Manifold',
    '--summary',
    'geometry',
    '--summary-file',
    '-',
    ...toOpenscadArgs(params),
    scadPath
  ]

  const child = execFile(
    bin,
    args,
    { cwd: workspaceDir, maxBuffer: 64 * 1024 * 1024, timeout: RENDER_TIMEOUT_MS },
    () => {
      // handled via the wrapper promise below
    }
  )

  const done = new Promise<RenderResult | RenderError>((resolve) => {
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d
    })
    child.stderr?.on('data', (d) => {
      stderr += d
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      resolve({
        ok: false,
        code: err.code === 'ENOENT' ? 'BINARY_NOT_FOUND' : 'RENDER_FAILED',
        engine: 'openscad',
        message: `OpenSCAD failed to start: ${err.message}`,
        stderrTail: tail(stderr)
      })
    })

    child.on('close', (codeNum, signal) => {
      if (signal) {
        // Killed (e.g. coalesced by the queue) — treat as a failed/aborted render.
        resolve({
          ok: false,
          code:
            signal === 'SIGTERM' && (child as ChildProcess & { killed?: boolean }).killed
              ? 'TIMEOUT'
              : 'RENDER_FAILED',
          engine: 'openscad',
          message: `OpenSCAD terminated by signal ${signal}`,
          stderrTail: tail(stderr)
        })
        return
      }
      const hadError = /ERROR:/.test(stderr)
      if (codeNum !== 0 || hadError) {
        resolve({
          ok: false,
          code: 'RENDER_FAILED',
          engine: 'openscad',
          message:
            codeNum !== 0 ? `OpenSCAD exited with code ${codeNum}` : 'OpenSCAD reported an error',
          stderrTail: tail(stderr)
        })
        return
      }
      const summary = parseSummary(stdout)
      resolve({
        ok: true,
        stlPath: outStlPath,
        facets: summary.facets,
        vertices: summary.vertices,
        durationMs: Date.now() - started,
        engine: 'openscad'
      })
    })
  })

  return { child, done }
}

/**
 * Render a 512x512 PNG thumbnail. Returns true on success. Best-effort: any failure
 * resolves false rather than throwing.
 */
export function renderThumbnailPng(opts: {
  bin: string
  workspaceDir: string
  params: ParamsFile
  outPath: string
}): Promise<boolean> {
  const { bin, workspaceDir, params, outPath } = opts
  const scadPath = path.join(workspaceDir, SOURCE_FILE)
  const args = [
    '-o',
    outPath,
    '--imgsize=512,512',
    '--colorscheme=Tomorrow Night',
    '--view=edges',
    '--autocenter',
    '--viewall',
    '--projection=o',
    ...toOpenscadArgs(params),
    scadPath
  ]
  return new Promise<boolean>((resolve) => {
    execFile(
      bin,
      args,
      { cwd: workspaceDir, maxBuffer: 16 * 1024 * 1024, timeout: RENDER_TIMEOUT_MS },
      (err, _stdout, stderr) => {
        if (err || /ERROR:/.test(stderr ?? '')) resolve(false)
        else resolve(true)
      }
    )
  })
}
