/**
 * IPC handlers for settings, API-key storage, tool detection, and engine
 * installation. Channel names live in `@shared/ipc` (CH.settings*).
 */
import type { IpcMain } from 'electron'
import type { Settings, ToolDetectResult } from '@shared/types'
import { CH, EV, type InstallResult } from '@shared/ipc'
import type { AppContext } from '../core/contracts'

export function registerSettingsIpc(ipcMain: IpcMain, ctx: AppContext): void {
  ipcMain.handle(CH.settingsGet, (): Settings => ctx.settings.get())

  ipcMain.handle(CH.settingsSet, (_e, patch: Partial<Settings>): Settings =>
    ctx.settings.set(patch)
  )

  ipcMain.handle(CH.settingsSetApiKey, (_e, key: string): { stored: boolean } =>
    ctx.settings.setApiKey(key)
  )

  ipcMain.handle(CH.settingsDetectTools, async (): Promise<ToolDetectResult> => {
    const [claude, openscad, python3, venv, auth] = await Promise.all([
      ctx.tools.detectClaude(),
      ctx.tools.detectOpenscad(),
      ctx.tools.detectPython(),
      ctx.tools.detectVenv(),
      ctx.tools.authStatus()
    ])
    return { claude, openscad, python3, venv, auth }
  })

  ipcMain.handle(CH.settingsInstallEngines, (): Promise<InstallResult> =>
    ctx.engines.installVenv((line) => ctx.emit(EV.installProgress, line))
  )
}
