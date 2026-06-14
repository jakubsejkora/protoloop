/**
 * IPC handlers for the artifacts/CAD surface. This is the ONE file in src/main/cad
 * allowed to import electron.
 *
 * Channels (see src/shared/ipc.ts):
 *   artifacts:read        → ArtifactsReadResult
 *   artifacts:readStl     → ArrayBuffer | null
 *   artifacts:updateParam → RenderOutcome (+ emits ev:artifacts on success)
 *   artifacts:export      → { savedTo? }
 *   artifacts:saveThumb   → void
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import type { AppContext } from '../core/contracts'
import type { ParamsFile, ParamValue } from '@shared/params'
import { clampParam, parseParamsFile } from '@shared/params'
import type { ArtifactsReadResult, ExportInput } from '@shared/ipc'
import { CH, EV } from '@shared/ipc'
import type { ArtifactsUpdated, RenderOutcome } from '@shared/types'

const PARAMS_FILE = 'params.json'
const STL = 'model.stl'
const STEP = 'model.step'
const THUMB = 'thumbnail.png'

/** Register the artifacts IPC handlers against `ipcMain` using `ctx`. */
export function registerCadIpc(ipcMain: IpcMain, ctx: AppContext): void {
  /** Monotonic STL version per chat id, so the viewer knows when to reload. */
  const stlVersions = new Map<string, number>()
  const bumpVersion = (id: string): number => {
    const next = (stlVersions.get(id) ?? 0) + 1
    stlVersions.set(id, next)
    return next
  }
  const currentVersion = (id: string): number => stlVersions.get(id) ?? 0

  const paramsPathOf = (id: string): string => path.join(ctx.store.workspaceDir(id), PARAMS_FILE)
  const stlPathOf = (id: string): string => path.join(ctx.store.workspaceDir(id), STL)
  const stepPathOf = (id: string): string => path.join(ctx.store.workspaceDir(id), STEP)

  async function loadParams(id: string): Promise<ParamsFile | null> {
    const p = paramsPathOf(id)
    if (!existsSync(p)) return null
    try {
      return parseParamsFile(await readFile(p, 'utf8'))
    } catch {
      return null
    }
  }

  // ---------- artifacts:read ----------
  ipcMain.handle(CH.artifactsRead, async (_e, id: string): Promise<ArtifactsReadResult> => {
    const params = await loadParams(id)
    return {
      hasStl: existsSync(stlPathOf(id)),
      hasStep: existsSync(stepPathOf(id)),
      params,
      stlVersion: currentVersion(id),
      units: params?.units ?? 'mm'
    }
  })

  // ---------- artifacts:readStl ----------
  ipcMain.handle(CH.artifactsReadStl, async (_e, id: string): Promise<ArrayBuffer | null> => {
    const p = stlPathOf(id)
    if (!existsSync(p)) return null
    const buf = await readFile(p)
    // Return the exact bytes as a standalone ArrayBuffer (Buffer may be a pool slice).
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    return ab as ArrayBuffer
  })

  // ---------- artifacts:updateParam ----------
  ipcMain.handle(
    CH.artifactsUpdateParam,
    async (_e, input: { id: string; name: string; value: ParamValue }): Promise<RenderOutcome> => {
      const { id, name, value } = input
      const params = await loadParams(id)
      if (!params) {
        return {
          ok: false,
          code: 'BAD_SOURCE',
          engine: 'openscad',
          message: 'params.json is missing or invalid'
        }
      }
      const param = params.params.find((p) => p.name === name)
      if (!param) {
        return {
          ok: false,
          code: 'BAD_SOURCE',
          engine: params.engine,
          message: `Unknown parameter: ${name}`
        }
      }

      // Clamp numeric values; pass other types through unchanged.
      if ((param.type === 'number' || param.type === 'int') && typeof value === 'number') {
        param.value = clampParam(param, value)
      } else {
        param.value = value
      }

      await writeFile(paramsPathOf(id), `${JSON.stringify(params, null, 2)}\n`)

      const outcome = await ctx.engines.render({
        workspaceDir: ctx.store.workspaceDir(id),
        params
      })

      if (outcome.ok) {
        const stlVersion = bumpVersion(id)
        const files: ArtifactsUpdated['files'] = { stl: STL, params: PARAMS_FILE }
        if (outcome.stepPath) files.step = STEP
        const payload: ArtifactsUpdated = { chatId: id, files, stlVersion }
        ctx.emit(EV.artifacts, payload)
      }

      return outcome
    }
  )

  // ---------- artifacts:export ----------
  ipcMain.handle(
    CH.artifactsExport,
    async (_e, input: ExportInput): Promise<{ savedTo?: string }> => {
      const { id, format } = input
      const srcPath = format === 'step' ? stepPathOf(id) : stlPathOf(id)
      if (!existsSync(srcPath)) return {}

      const result = await dialog.showSaveDialog({
        title: `Export ${format.toUpperCase()}`,
        defaultPath: `model.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }]
      })
      if (result.canceled || !result.filePath) return {}

      await copyFile(srcPath, result.filePath)
      return { savedTo: result.filePath }
    }
  )

  // ---------- artifacts:saveThumb ----------
  ipcMain.handle(
    CH.artifactsSaveThumb,
    async (_e, input: { id: string; pngDataUrl: string }): Promise<void> => {
      const { id, pngDataUrl } = input
      const comma = pngDataUrl.indexOf(',')
      const b64 = comma >= 0 ? pngDataUrl.slice(comma + 1) : pngDataUrl
      const bytes = Buffer.from(b64, 'base64')
      const projectDir = ctx.store.projectDir(id)
      await mkdir(projectDir, { recursive: true })
      await writeFile(path.join(projectDir, THUMB), bytes)
    }
  )
}
