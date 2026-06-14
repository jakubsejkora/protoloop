/**
 * Tool detection — locates the external binaries Protoloop drives (claude,
 * openscad, python3) and the managed CADQuery/build123d venv, reports versions,
 * and surfaces actionable install hints when something is missing.
 *
 * Binary resolution uses `which` plus a couple of well-known macOS locations for
 * OpenSCAD. Every probe is best-effort and never throws — a failure becomes
 * `{ ok: false, hint }`.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { AuthStatus, ToolStatus } from '@shared/types'
import type { ToolDetector } from '../core/contracts'

const SHORT_TIMEOUT_MS = 5_000
const VENV_IMPORT_TIMEOUT_MS = 15_000

const OPENSCAD_FALLBACKS = [
  '/opt/homebrew/bin/openscad',
  '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD'
]

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  failed: boolean
}

/** Run a binary with discrete argv (no shell). Never rejects. */
function run(
  bin: string,
  args: string[],
  timeout = SHORT_TIMEOUT_MS
): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof err.code === 'number' ? err.code : err ? null : 0
      resolve({
        code,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        failed: Boolean(err)
      })
    })
  })
}

/** Resolve a binary on PATH via `which`. Returns an existing absolute path or null. */
async function which(name: string): Promise<string | null> {
  const res = await run('which', [name])
  const found = res.stdout.trim().split('\n')[0]?.trim()
  return found && existsSync(found) ? found : null
}

/** Resolve openscad: PATH first, then known macOS install locations. */
async function resolveOpenscad(): Promise<string | null> {
  const onPath = await which('openscad')
  if (onPath) return onPath
  for (const candidate of OPENSCAD_FALLBACKS) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** First whitespace-trimmed line of combined version output. */
function firstLine(text: string): string | undefined {
  const line = text.trim().split('\n')[0]?.trim()
  return line ? line : undefined
}

/** `<venvDir>/bin/python` — the managed venv's interpreter. */
function venvPythonPath(venvDir: string): string {
  return path.join(venvDir, 'bin', 'python')
}

export function createToolDetector(venvDir: string): ToolDetector {
  return {
    async detectClaude(): Promise<ToolStatus> {
      const bin = await which('claude')
      if (!bin) {
        return {
          name: 'claude',
          ok: false,
          hint: 'Install the Claude CLI: npm i -g @anthropic-ai/claude-code'
        }
      }
      const ver = await run(bin, ['--version'])
      return {
        name: 'claude',
        path: bin,
        version: firstLine(ver.stdout) ?? firstLine(ver.stderr),
        ok: true
      }
    },

    async detectOpenscad(): Promise<ToolStatus> {
      const bin = await resolveOpenscad()
      if (!bin) {
        return {
          name: 'openscad',
          ok: false,
          hint: 'brew install --cask openscad'
        }
      }
      // OpenSCAD prints its version to stderr.
      const ver = await run(bin, ['--version'])
      return {
        name: 'openscad',
        path: bin,
        version: firstLine(ver.stderr) ?? firstLine(ver.stdout),
        ok: true
      }
    },

    async detectPython(): Promise<ToolStatus> {
      const bin = (await which('python3')) ?? (await which('python'))
      if (!bin) {
        return {
          name: 'python3',
          ok: false,
          hint: 'Install Python 3: brew install python'
        }
      }
      const ver = await run(bin, ['--version'])
      return {
        name: 'python3',
        path: bin,
        version: firstLine(ver.stdout) ?? firstLine(ver.stderr),
        ok: true
      }
    },

    async detectVenv(): Promise<ToolStatus> {
      const python = venvPythonPath(venvDir)
      if (!existsSync(python)) {
        return {
          name: 'venv',
          path: venvDir,
          ok: false,
          hint: 'Install CADQuery/build123d from Settings'
        }
      }
      const check = await run(
        python,
        ['-c', 'import cadquery, build123d'],
        VENV_IMPORT_TIMEOUT_MS
      )
      if (check.code !== 0) {
        return {
          name: 'venv',
          path: python,
          ok: false,
          hint: 'Install CADQuery/build123d from Settings'
        }
      }
      const ver = await run(python, ['--version'])
      return {
        name: 'venv',
        path: python,
        version: firstLine(ver.stdout) ?? firstLine(ver.stderr),
        ok: true
      }
    },

    async authStatus(): Promise<AuthStatus> {
      const bin = await which('claude')
      if (!bin) return { loggedIn: false }

      // Preferred path: structured JSON.
      const jsonRes = await run(bin, ['auth', 'status', '--json'])
      const parsed = parseAuthJson(jsonRes.stdout) ?? parseAuthJson(jsonRes.stderr)
      if (parsed) return parsed

      // Fallback: plain-text status. Exit 0 or recognisable "logged in" text ⇒ ok.
      const textRes = await run(bin, ['auth', 'status'])
      const combined = `${textRes.stdout}\n${textRes.stderr}`
      const loggedIn =
        (!textRes.failed && textRes.code === 0) || /logged in|account|subscription/i.test(combined)
      return { loggedIn }
    }
  }
}

interface RawAuthJson {
  loggedIn?: boolean
  authMethod?: string
  subscriptionType?: string
}

/** Parse `claude auth status --json` output into an AuthStatus, or null if not JSON. */
function parseAuthJson(text: string): AuthStatus | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  // Be lenient: extract the first {...} block in case banners are printed around it.
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    const raw = JSON.parse(trimmed.slice(start, end + 1)) as RawAuthJson
    if (typeof raw.loggedIn !== 'boolean') return null
    return {
      loggedIn: raw.loggedIn,
      method: raw.authMethod,
      subscription: raw.subscriptionType
    }
  } catch {
    return null
  }
}

/**
 * Resolve the binary/venv paths the engine + CLI layers need to build their
 * sublayers. Used by the IPC router to populate `AppContext.paths`.
 */
export async function resolveToolPaths(venvDir: string): Promise<{
  openscad?: string
  python3?: string
  venvPython?: string
  claude?: string
}> {
  const [openscad, python3, claude] = await Promise.all([
    resolveOpenscad(),
    which('python3').then((p) => p ?? which('python')),
    which('claude')
  ])
  const venvPy = venvPythonPath(venvDir)
  return {
    openscad: openscad ?? undefined,
    python3: python3 ?? undefined,
    venvPython: existsSync(venvPy) ? venvPy : undefined,
    claude: claude ?? undefined
  }
}
