/**
 * IPC handlers for the projects CRUD surface (renderer → main, request/response).
 * Channel names live in `@shared/ipc` (CH.projects*).
 */
import type { IpcMain } from 'electron'
import type { ProjectMeta } from '@shared/types'
import { CH, type ProjectConfigPatch } from '@shared/ipc'
import type { AppContext } from '../core/contracts'

/** Fields a renderer is allowed to patch onto a project's meta via updateConfig. */
const CONFIG_KEYS = ['title', 'backend', 'model', 'effort', 'engine', 'mode'] as const

function pickConfigPatch(patch: ProjectConfigPatch): Partial<ProjectMeta> {
  const out: Partial<ProjectMeta> = {}
  for (const key of CONFIG_KEYS) {
    const value = patch[key]
    if (value !== undefined) (out as Record<string, unknown>)[key] = value
  }
  return out
}

export function registerProjectsIpc(ipcMain: IpcMain, ctx: AppContext): void {
  ipcMain.handle(CH.projectsList, () => ctx.store.list())

  ipcMain.handle(CH.projectsCreate, (_e, input?: { title?: string }) => {
    const { backend, defaultModel, defaultEffort, defaultEngine, defaultMode } = ctx.settings.get()
    return ctx.store.create(input, {
      backend,
      defaultModel,
      defaultEffort,
      defaultEngine,
      defaultMode
    })
  })

  ipcMain.handle(CH.projectsGet, (_e, id: string) => ctx.store.get(id))

  ipcMain.handle(CH.projectsRename, (_e, id: string, title: string) =>
    ctx.store.rename(id, title)
  )

  ipcMain.handle(CH.projectsDelete, (_e, id: string) => ctx.store.remove(id))

  ipcMain.handle(CH.projectsUpdateConfig, (_e, id: string, patch: ProjectConfigPatch) =>
    ctx.store.updateMeta(id, pickConfigPatch(patch))
  )
}
