/**
 * Python render engine for CADQuery + build123d. We write a generic driver script
 * to a temp file that:
 *   1. loads a resolved `{name: value}` params object (clamped on the JS side),
 *   2. imports the user's model.py `build`,
 *   3. calls `build(**values)`,
 *   4. exports model.stl (+ model.step) using the engine's exporter.
 *
 * Runs with the venv python (`<venvDir>/bin/python`). Non-zero exit ⇒ RenderError
 * with a stderr tail. STL is written to `outStlPath` (so the queue can use a tmp file);
 * STEP is written next to it as `<base>.step` → reported as stepPath.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { ParamsFile } from '@shared/params'
import type { EngineId, RenderError, RenderResult } from '@shared/types'
import { toParamObject } from './paramEncoding'

const RENDER_TIMEOUT_MS = 180_000

export interface PyRunHandle {
  child: ChildProcess
  done: Promise<RenderResult | RenderError>
}

/** The generic driver. Reads argv: <engine> <modelPath> <paramsJson> <stlOut> <stepOut>. */
const DRIVER = `import sys, json, importlib.util, traceback

def fail(msg):
    sys.stderr.write(msg + "\\n")
    sys.exit(1)

def main():
    engine, model_path, params_path, stl_out, step_out = sys.argv[1:6]
    with open(params_path) as f:
        params = json.load(f)

    spec = importlib.util.spec_from_file_location("usermodel", model_path)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception:
        fail("Failed to import model.py:\\n" + traceback.format_exc())

    if not hasattr(mod, "build"):
        fail("model.py does not define build(**params)")

    try:
        obj = mod.build(**params)
    except Exception:
        fail("build(**params) raised:\\n" + traceback.format_exc())

    if obj is None:
        fail("build(**params) returned None")

    try:
        if engine == "cadquery":
            import cadquery
            cadquery.exporters.export(obj, stl_out)
            cadquery.exporters.export(obj, step_out)
        elif engine == "build123d":
            from build123d import export_stl, export_step
            export_stl(obj, stl_out)
            export_step(obj, step_out)
        else:
            fail("Unknown engine: " + engine)
    except Exception:
        fail("Export failed:\\n" + traceback.format_exc())

if __name__ == "__main__":
    main()
`

function tail(text: string, lines = 24): string {
  return text.split('\n').filter(Boolean).slice(-lines).join('\n')
}

/**
 * Render a Python model (cadquery|build123d) to `outStlPath` (+ a sibling `.step`).
 * Returns a handle whose child can be killed and whose `done` resolves to an outcome.
 */
export function runPyRender(opts: {
  engine: Extract<EngineId, 'cadquery' | 'build123d'>
  venvPython: string
  workspaceDir: string
  params: ParamsFile
  outStlPath: string
}): PyRunHandle {
  const { engine, venvPython, workspaceDir, params, outStlPath } = opts
  const started = Date.now()
  const modelPath = path.join(workspaceDir, 'model.py')
  const stepOut = outStlPath.replace(/\.stl(\.tmp)?$/i, '') + '.step'
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'protoloop-py-'))
  const driverPath = path.join(tmpDir, 'driver.py')
  const paramsPath = path.join(tmpDir, 'params.json')

  let child: ChildProcess
  const done = new Promise<RenderResult | RenderError>((resolve) => {
    const cleanup = (): void => {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }

    if (!existsSync(venvPython)) {
      cleanup()
      resolve({
        ok: false,
        code: 'ENGINE_UNAVAILABLE',
        engine,
        message: `Python venv not found at ${venvPython}`,
        installHint: 'Install the CADQuery/build123d engines from Settings.'
      })
      // Provide a placeholder child so the handle shape is satisfied; it is never used.
      child = execFile(process.execPath, ['-e', '0'])
      return
    }

    try {
      writeFileSync(driverPath, DRIVER)
      writeFileSync(paramsPath, JSON.stringify(toParamObject(params)))
    } catch (err) {
      cleanup()
      resolve({
        ok: false,
        code: 'UNKNOWN',
        engine,
        message: `Failed to stage Python driver: ${(err as Error).message}`
      })
      child = execFile(process.execPath, ['-e', '0'])
      return
    }

    child = execFile(
      venvPython,
      [driverPath, engine, modelPath, paramsPath, outStlPath, stepOut],
      { cwd: workspaceDir, maxBuffer: 64 * 1024 * 1024, timeout: RENDER_TIMEOUT_MS },
      () => {
        /* handled via events */
      }
    )

    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += d
    })
    child.on('error', (err: NodeJS.ErrnoException) => {
      cleanup()
      resolve({
        ok: false,
        code: err.code === 'ENOENT' ? 'ENGINE_UNAVAILABLE' : 'RENDER_FAILED',
        engine,
        message: `Python failed to start: ${err.message}`,
        stderrTail: tail(stderr)
      })
    })
    child.on('close', (codeNum, signal) => {
      cleanup()
      if (signal) {
        resolve({
          ok: false,
          code: 'RENDER_FAILED',
          engine,
          message: `Python render terminated by signal ${signal}`,
          stderrTail: tail(stderr)
        })
        return
      }
      if (codeNum !== 0) {
        resolve({
          ok: false,
          code: 'RENDER_FAILED',
          engine,
          message: `${engine} render failed (exit ${codeNum})`,
          stderrTail: tail(stderr)
        })
        return
      }
      resolve({
        ok: true,
        stlPath: outStlPath,
        stepPath: existsSync(stepOut) ? stepOut : undefined,
        durationMs: Date.now() - started,
        engine
      })
    })
  })

  // child is assigned synchronously above in all branches
  return { child: child!, done }
}
