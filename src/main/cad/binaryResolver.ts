/**
 * Resolve the OpenSCAD binary. Electron-free so the engine layer stays unit-testable.
 *
 * Resolution order:
 *   1. env OPENSCAD_BIN
 *   2. /opt/homebrew/bin/openscad
 *   3. /Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD
 *   4. `which openscad`
 *
 * The result is cached for the lifetime of the process.
 */
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const HOMEBREW_PATH = '/opt/homebrew/bin/openscad'
const APP_PATH = '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD'

let cached: string | null | undefined

function whichOpenscad(): string | null {
  try {
    const out = execFileSync('which', ['openscad'], { encoding: 'utf8' }).trim()
    return out.length > 0 && existsSync(out) ? out : null
  } catch {
    return null
  }
}

/** Resolve the OpenSCAD binary path, or null if none can be found. Cached. */
export function resolveOpenscad(override?: string): string | null {
  // An explicit override always wins and is never cached (callers pass a known path).
  if (override && existsSync(override)) return override

  if (cached !== undefined) return cached

  const envBin = process.env['OPENSCAD_BIN']
  if (envBin && existsSync(envBin)) {
    cached = envBin
    return cached
  }
  if (existsSync(HOMEBREW_PATH)) {
    cached = HOMEBREW_PATH
    return cached
  }
  if (existsSync(APP_PATH)) {
    cached = APP_PATH
    return cached
  }
  cached = whichOpenscad()
  return cached
}

/** Test-only: reset the memoized binary path. */
export function resetOpenscadCache(): void {
  cached = undefined
}
