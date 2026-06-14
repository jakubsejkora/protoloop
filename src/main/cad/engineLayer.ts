/**
 * The four-engine render layer. Electron-free so it is unit-testable.
 *
 * `render({ workspaceDir, params })` dispatches on `params.engine`, goes through a
 * per-workspace render queue (cancel-in-flight + coalesce + atomic tmp→final), and
 * returns a RenderOutcome. Handles BOTH the initial build and the slider fast-path.
 */
import path from 'node:path'
import type { EngineLayer, EngineProbe } from '../core/contracts'
import type { ParamsFile } from '@shared/params'
import type { RenderOutcome, ToolStatus } from '@shared/types'
import type { InstallResult } from '@shared/ipc'
import { resolveOpenscad } from './binaryResolver'
import { runOpenscadRender, renderThumbnailPng } from './openscadEngine'
import { runJscadRender } from './jscadEngine'
import { runPyRender } from './pyEngine'
import { installVenv, venvProbe, venvPythonPath } from './venvManager'
import { RenderQueue } from './renderQueue'
import type { RunHandle } from './renderQueue'

export interface EngineLayerConfig {
  /** directory of the managed CADQuery/build123d venv */
  venvDir: string
  /** explicit OpenSCAD binary path; falls back to the resolver when omitted */
  openscadPath?: string
}

const STL = 'model.stl'
const STEP = 'model.step'

function unavailable(
  engine: ParamsFile['engine'],
  message: string,
  installHint?: string
): RenderOutcome {
  return { ok: false, code: 'ENGINE_UNAVAILABLE', engine, message, installHint }
}

export function createEngineLayer(config: EngineLayerConfig): EngineLayer {
  const queue = new RenderQueue()
  const venvPython = venvPythonPath(config.venvDir)

  function openscadBin(): string | null {
    return resolveOpenscad(config.openscadPath)
  }

  async function probe(): Promise<EngineProbe> {
    const bin = openscadBin()
    const openscad: ToolStatus = bin
      ? { name: 'openscad', path: bin, ok: true }
      : { name: 'openscad', ok: false, hint: 'Install OpenSCAD (brew install --cask openscad).' }

    const venvOk = await venvProbe(config.venvDir)
    const venv: ToolStatus = venvOk
      ? { name: 'venv', path: venvPython, ok: true }
      : { name: 'venv', ok: false, hint: 'Install CADQuery/build123d engines from Settings.' }

    // python3 presence is implied by venv usage; report based on the venv python.
    const python3: ToolStatus = venvOk
      ? { name: 'python3', path: venvPython, ok: true }
      : { name: 'python3', ok: false, hint: 'A Python 3 toolchain is required for B-rep engines.' }

    return { openscad, python3, venv, jscad: true }
  }

  function render(opts: { workspaceDir: string; params: ParamsFile }): Promise<RenderOutcome> {
    const { workspaceDir, params } = opts
    const engine = params.engine
    const finalStlPath = path.join(workspaceDir, STL)
    const tmpStlPath = `${finalStlPath}.tmp`
    const finalStepPath = path.join(workspaceDir, STEP)
    const tmpStepPath = `${finalStepPath}.tmp`

    if (engine === 'openscad') {
      const bin = openscadBin()
      if (!bin) {
        return Promise.resolve(
          unavailable(
            'openscad',
            'OpenSCAD binary not found.',
            'Install OpenSCAD (brew install --cask openscad).'
          )
        )
      }
      return queue.enqueue(workspaceDir, {
        engine,
        finalStlPath,
        tmpStlPath,
        start: (tmp): RunHandle => {
          const h = runOpenscadRender({ bin, workspaceDir, params, outStlPath: tmp })
          return { kill: () => h.child.kill('SIGKILL'), done: h.done }
        }
      })
    }

    if (engine === 'jscad') {
      return queue.enqueue(workspaceDir, {
        engine,
        finalStlPath,
        tmpStlPath,
        start: (tmp): RunHandle => {
          // In-process: no child to kill; the queue discards stale results by flag.
          const done = runJscadRender({ workspaceDir, params, outStlPath: tmp })
          return { kill: () => undefined, done }
        }
      })
    }

    if (engine === 'cadquery' || engine === 'build123d') {
      return queue.enqueue(workspaceDir, {
        engine,
        finalStlPath,
        tmpStlPath,
        finalStepPath,
        tmpStepPath,
        start: (tmp): RunHandle => {
          const h = runPyRender({ engine, venvPython, workspaceDir, params, outStlPath: tmp })
          return { kill: () => h.child.kill('SIGKILL'), done: h.done }
        }
      })
    }

    return Promise.resolve(unavailable(engine, `Unsupported engine: ${String(engine)}`))
  }

  async function renderThumbnail(opts: {
    workspaceDir: string
    params: ParamsFile
    outPath: string
  }): Promise<boolean> {
    // Only OpenSCAD has a native rasteriser here; other engines have no thumbnailer.
    if (opts.params.engine !== 'openscad') return false
    const bin = openscadBin()
    if (!bin) return false
    return renderThumbnailPng({
      bin,
      workspaceDir: opts.workspaceDir,
      params: opts.params,
      outPath: opts.outPath
    })
  }

  function doInstallVenv(onProgress: (line: string) => void): Promise<InstallResult> {
    return installVenv(config.venvDir, onProgress)
  }

  return { probe, render, renderThumbnail, installVenv: doInstallVenv }
}
