import { z } from 'zod'

/**
 * params.json — the contract that drives the parametric sliders AND the
 * no-LLM fast-path re-render. Every entry's `name` MUST equal a top-level
 * variable in the engine source so it can be overridden directly.
 */

export const paramTypeSchema = z.enum(['number', 'int', 'boolean', 'string', 'enum', 'vector'])
export type ParamType = z.infer<typeof paramTypeSchema>

export const paramValueSchema = z.union([
  z.number(),
  z.boolean(),
  z.string(),
  z.array(z.number())
])
export type ParamValue = z.infer<typeof paramValueSchema>

export const paramSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: paramTypeSchema,
  value: paramValueSchema,
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  unit: z.string().nullish(),
  group: z.string().nullish(),
  options: z.array(z.string()).nullish(),
  description: z.string().nullish()
})
export type Param = z.infer<typeof paramSchema>

export const paramsFileSchema = z.object({
  schemaVersion: z.literal(1),
  engine: z.enum(['openscad', 'jscad', 'cadquery', 'build123d']),
  sourceFile: z.string(),
  units: z.string().default('mm'),
  params: z.array(paramSchema)
})
export type ParamsFile = z.infer<typeof paramsFileSchema>

/** Parse + validate raw params.json text. Returns null on failure. */
export function parseParamsFile(raw: string): ParamsFile | null {
  try {
    const json = JSON.parse(raw)
    const result = paramsFileSchema.safeParse(json)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** Clamp a numeric value to a param's min/max/step. */
export function clampParam(p: Param, value: number): number {
  let v = value
  if (typeof p.min === 'number') v = Math.max(p.min, v)
  if (typeof p.max === 'number') v = Math.min(p.max, v)
  if (typeof p.step === 'number' && p.step > 0 && typeof p.min === 'number') {
    v = p.min + Math.round((v - p.min) / p.step) * p.step
  }
  if (p.type === 'int') v = Math.round(v)
  // avoid floating point noise like 2.5000000004
  return Math.round(v * 1e6) / 1e6
}
