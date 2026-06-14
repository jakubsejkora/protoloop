import { ipcMain, type BrowserWindow } from 'electron'
import type { AppContext, Emit } from '../core/contracts'
import { createProjectStore, registerProjectsIpc } from '../persistence'
import { venvDir } from '../persistence/paths'
import {
  createSecrets,
  createSettingsService,
  createToolDetector,
  resolveToolPaths,
  registerSettingsIpc
} from '../settings'
import { createEngineLayer, registerCadIpc } from '../cad'
import { createSessionManager, registerAgentIpc } from '../agent'

/**
 * Assemble the AppContext from every slice and register all IPC handlers.
 * Wiring order respects the dependency graph: settings/store → engines → sessions.
 */
export async function buildContextAndRegister(
  getWindow: () => BrowserWindow | null
): Promise<AppContext> {
  const emit: Emit = (channel, payload) => {
    getWindow()?.webContents.send(channel, payload)
  }

  const secrets = createSecrets()
  const settings = createSettingsService(secrets)
  const store = createProjectStore()
  const tools = createToolDetector(venvDir())
  const paths = await resolveToolPaths(venvDir())

  const engines = createEngineLayer({ venvDir: venvDir(), openscadPath: paths.openscad })
  const sessions = createSessionManager({ store, engines, settings, paths })

  const ctx: AppContext = { emit, store, engines, sessions, settings, tools, paths }
  sessions.setEmit(emit)

  registerProjectsIpc(ipcMain, ctx)
  registerSettingsIpc(ipcMain, ctx)
  registerCadIpc(ipcMain, ctx)
  registerAgentIpc(ipcMain, ctx)

  return ctx
}
