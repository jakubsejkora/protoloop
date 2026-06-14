/**
 * JSCAD render engine. Runs in-process: (re)require the user's model.js, call
 * `main(paramsObj)`, serialize the returned geometry to binary STL, write the file.
 *
 * `@jscad/stl-serializer.serialize({ binary: true }, geom)` returns an array of
 * ArrayBuffers (binary STL is header + per-triangle records); we concat them into
 * one Buffer. Geometry may be a single solid or an array of solids.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Module, createRequire } from 'node:module'
import type { ParamsFile } from '@shared/params'
import type { RenderError, RenderResult } from '@shared/types'
import { toParamObject } from './paramEncoding'

const SOURCE_FILE = 'model.js'

type JscadModule = { main?: (params: Record<string, unknown>) => unknown }

// A require rooted at THIS file so jscad libs (@jscad/modeling, @jscad/stl-serializer)
// always resolve from the app's node_modules, even when the workspace is a temp dir
// outside the app tree.
const appRequire = createRequire(__filename)

/**
 * Load the user's model.js fresh (no require cache) and return its exports.
 * The model's own `require` first tries the workspace, then falls back to the app's
 * node_modules so `require('@jscad/modeling')` works regardless of workspace location.
 */
function loadModelFresh(modelPath: string): JscadModule {
  const src = readFileSync(modelPath, 'utf8')
  const workspaceRequire = createRequire(modelPath)
  const customRequire = ((request: string): unknown => {
    try {
      return workspaceRequire(request)
    } catch {
      return appRequire(request)
    }
  }) as NodeJS.Require

  const mod = new Module(modelPath, undefined) as Module & {
    _compile: (content: string, filename: string) => unknown
  }
  mod.filename = modelPath
  // include both the workspace and the app module search paths
  mod.paths = [
    ...((Module as unknown as { _nodeModulePaths: (from: string) => string[] })._nodeModulePaths(
      path.dirname(modelPath)
    ) ?? []),
    ...((Module as unknown as { _nodeModulePaths: (from: string) => string[] })._nodeModulePaths(
      __dirname
    ) ?? [])
  ]
  mod.require = customRequire
  mod._compile(src, modelPath)
  return mod.exports as JscadModule
}

/** Count triangles in a binary-STL buffer (header[80] + uint32 count + records). */
function facetsFromBinaryStl(buf: Buffer): number | undefined {
  if (buf.length < 84) return undefined
  return buf.readUInt32LE(80)
}

/**
 * Render model.js to `outStlPath` in-process. Resolves to a RenderResult or
 * RenderError; never throws.
 */
export async function runJscadRender(opts: {
  workspaceDir: string
  params: ParamsFile
  outStlPath: string
}): Promise<RenderResult | RenderError> {
  const { workspaceDir, params, outStlPath } = opts
  const started = Date.now()
  const modelPath = path.join(workspaceDir, SOURCE_FILE)

  let geometry: unknown
  try {
    const mod = loadModelFresh(modelPath)
    const main = mod?.main
    if (typeof main !== 'function') {
      return {
        ok: false,
        code: 'BAD_SOURCE',
        engine: 'jscad',
        message: `${SOURCE_FILE} does not export a main(params) function`
      }
    }
    geometry = main(toParamObject(params) as Record<string, unknown>)
  } catch (err) {
    return {
      ok: false,
      code: 'RENDER_FAILED',
      engine: 'jscad',
      message: `JSCAD model threw: ${(err as Error).message}`,
      stderrTail: (err as Error).stack?.split('\n').slice(0, 12).join('\n')
    }
  }

  try {
    const stlSerializer = appRequire('@jscad/stl-serializer') as {
      serialize: (opts: { binary: boolean }, ...geoms: unknown[]) => ArrayBuffer[]
    }
    const geoms = Array.isArray(geometry) ? geometry : [geometry]
    const data = stlSerializer.serialize({ binary: true }, ...geoms)
    const buffers = data.map((ab) => Buffer.from(ab))
    const out = Buffer.concat(buffers)
    if (out.length === 0) {
      return {
        ok: false,
        code: 'RENDER_FAILED',
        engine: 'jscad',
        message: 'JSCAD serializer produced an empty STL'
      }
    }
    writeFileSync(outStlPath, out)
    return {
      ok: true,
      stlPath: outStlPath,
      facets: facetsFromBinaryStl(out),
      durationMs: Date.now() - started,
      engine: 'jscad'
    }
  } catch (err) {
    return {
      ok: false,
      code: 'RENDER_FAILED',
      engine: 'jscad',
      message: `JSCAD serialization failed: ${(err as Error).message}`,
      stderrTail: (err as Error).stack?.split('\n').slice(0, 12).join('\n')
    }
  }
}
