/**
 * Encode params.json `Param[]` + current values into engine inputs.
 *
 * - OpenSCAD: discrete `-D name=value` argv pairs (no shell quoting — execFile passes
 *   each arg verbatim, so values must be OpenSCAD literal syntax).
 * - jscad / python: a plain `{ name: value }` object of real JS values.
 *
 * Numeric params are clamped via `clampParam`; non-numeric values pass through.
 */
import type { Param, ParamsFile, ParamValue } from '@shared/params'
import { clampParam } from '@shared/params'

/** A param's effective value: clamp numbers, leave the rest as-authored. */
export function effectiveValue(p: Param): ParamValue {
  if ((p.type === 'number' || p.type === 'int') && typeof p.value === 'number') {
    return clampParam(p, p.value)
  }
  return p.value
}

function formatNumber(n: number): string {
  // OpenSCAD accepts plain decimal literals; avoid exponent / trailing-zero noise.
  if (!Number.isFinite(n)) return '0'
  return String(n)
}

/** Render a single param as the OpenSCAD literal that follows `name=`. */
function openscadLiteral(p: Param): string {
  const v = effectiveValue(p)
  switch (p.type) {
    case 'boolean':
      return v ? 'true' : 'false'
    case 'number':
    case 'int':
      return formatNumber(typeof v === 'number' ? v : Number(v))
    case 'vector': {
      const arr = Array.isArray(v) ? v : []
      return `[${arr.map((x) => formatNumber(x)).join(',')}]`
    }
    case 'string':
    case 'enum':
    default: {
      // Wrap in double quotes and escape any inner double quotes / backslashes.
      const s = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      return `"${s}"`
    }
  }
}

/**
 * Build the OpenSCAD `-D` argv pairs for every param, e.g.
 *   ['-D', 'width=40', '-D', 'label="box"', '-D', 'size=[1,2,3]']
 */
export function toOpenscadArgs(params: ParamsFile): string[] {
  const args: string[] = []
  for (const p of params.params) {
    args.push('-D', `${p.name}=${openscadLiteral(p)}`)
  }
  return args
}

/**
 * Build a `{ name: value }` object of real JS values for jscad / python engines.
 * Numbers are clamped; booleans, strings, enums and vectors pass through.
 */
export function toParamObject(params: ParamsFile): Record<string, ParamValue> {
  const obj: Record<string, ParamValue> = {}
  for (const p of params.params) {
    obj[p.name] = effectiveValue(p)
  }
  return obj
}
