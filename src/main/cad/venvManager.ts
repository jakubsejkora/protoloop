/**
 * Manage the CADQuery/build123d Python venv.
 *
 * installVenv: `python3 -m venv <dir>` → `<dir>/bin/python -m pip install --upgrade pip`
 *   → `<dir>/bin/pip install cadquery==2.7.0 build123d`, streaming every stdout/stderr
 *   line to onProgress.
 * venvProbe: check `<dir>/bin/python` exists and `import cadquery, build123d` succeeds.
 *
 * Electron-free.
 */
import { spawn, execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { InstallResult } from '@shared/ipc'

const CADQUERY_PIN = 'cadquery==2.7.0'
const BUILD123D_PKG = 'build123d'

/**
 * CADQuery 2.7.0 pins cadquery-ocp <7.9, and the only OCP wheel built for
 * Python 3.14 is 7.9.3 — so the venv must use a 3.10–3.13 interpreter. Probe the
 * usual candidates (PATH names + common Homebrew / pyenv / ~/.local locations)
 * and return the first compatible one. Falls back to `python3`.
 */
export async function findCompatiblePython(): Promise<string> {
  const home = process.env.HOME ?? ''
  const candidates = [
    'python3.13',
    'python3.12',
    'python3.11',
    'python3.10',
    '/opt/homebrew/bin/python3.13',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.11',
    '/usr/local/bin/python3.12',
    `${home}/.local/bin/python3.12`,
    `${home}/.local/bin/python3.11`
  ]
  for (const cand of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      execFile(
        cand,
        ['-c', 'import sys; print(sys.version_info.major, sys.version_info.minor)'],
        { timeout: 5000 },
        (err, stdout) => {
          if (err) return resolve(false)
          const [maj, min] = stdout.trim().split(/\s+/).map(Number)
          resolve(maj === 3 && min >= 10 && min <= 13)
        }
      )
    })
    if (ok) return cand
  }
  return 'python3'
}

export function venvPythonPath(venvDir: string): string {
  return path.join(venvDir, 'bin', 'python')
}

export function venvPipPath(venvDir: string): string {
  return path.join(venvDir, 'bin', 'pip')
}

/** Run a command, streaming each stdout/stderr line to onProgress. Resolves exit code. */
function runStreaming(
  cmd: string,
  args: string[],
  onProgress: (line: string) => void
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    onProgress(`$ ${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderrTail = ''
    let outBuf = ''
    let errBuf = ''

    const flush = (buf: string, isErr: boolean): string => {
      const parts = buf.split('\n')
      const rest = parts.pop() ?? ''
      for (const line of parts) {
        if (line.length === 0) continue
        onProgress(line)
        if (isErr) stderrTail = `${stderrTail}\n${line}`.split('\n').slice(-40).join('\n')
      }
      return rest
    }

    child.stdout.on('data', (d) => {
      outBuf = flush(outBuf + d, false)
    })
    child.stderr.on('data', (d) => {
      errBuf = flush(errBuf + d, true)
    })
    child.on('error', (err) => {
      onProgress(`error: ${err.message}`)
      resolve({ code: 1, stderr: err.message })
    })
    child.on('close', (code) => {
      if (outBuf) onProgress(outBuf)
      if (errBuf) {
        onProgress(errBuf)
        stderrTail = `${stderrTail}\n${errBuf}`.split('\n').slice(-40).join('\n')
      }
      resolve({ code: code ?? 0, stderr: stderrTail.trim() })
    })
  })
}

/**
 * Create/upgrade the managed venv and pip-install cadquery + build123d.
 * Streams progress lines; returns InstallResult.
 */
export async function installVenv(
  venvDir: string,
  onProgress: (line: string) => void
): Promise<InstallResult> {
  const python = venvPythonPath(venvDir)
  const pip = venvPipPath(venvDir)

  // 0) pick a CADQuery-compatible interpreter (system python3 may be too new)
  const basePython = await findCompatiblePython()
  onProgress(`Using base interpreter: ${basePython}`)
  if (basePython === 'python3') {
    onProgress(
      'Warning: no Python 3.10–3.13 found. CADQuery/build123d need one (e.g. `brew install python@3.12`).'
    )
  }

  // 1) create the venv (idempotent — venv tolerates an existing dir)
  const create = await runStreaming(basePython, ['-m', 'venv', venvDir], onProgress)
  if (create.code !== 0 || !existsSync(python)) {
    return { ok: false, message: `Failed to create venv: ${create.stderr || 'see log'}` }
  }

  // 2) upgrade pip
  const pipUp = await runStreaming(python, ['-m', 'pip', 'install', '--upgrade', 'pip'], onProgress)
  if (pipUp.code !== 0) {
    return { ok: false, message: `pip upgrade failed: ${pipUp.stderr || 'see log'}` }
  }

  // 3) install the CAD packages
  const install = await runStreaming(pip, ['install', CADQUERY_PIN, BUILD123D_PKG], onProgress)
  if (install.code !== 0) {
    return { ok: false, message: `Package install failed: ${install.stderr || 'see log'}` }
  }

  onProgress('Engines installed.')
  return { ok: true, message: 'CADQuery + build123d installed.' }
}

/**
 * Quick health check: the venv python exists and can import both packages.
 * Uses a short timeout so it never hangs the UI.
 */
export function venvProbe(venvDir: string, timeoutMs = 15_000): Promise<boolean> {
  const python = venvPythonPath(venvDir)
  if (!existsSync(python)) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    execFile(python, ['-c', 'import cadquery, build123d'], { timeout: timeoutMs }, (err) =>
      resolve(!err)
    )
  })
}
