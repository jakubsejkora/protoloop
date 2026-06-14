/**
 * Registers the chat/agent IPC handlers, delegating to ctx.sessions (the SessionManager).
 * Channel ↔ method mapping mirrors the ProtoloopApi bridge surface in src/shared/ipc.ts.
 */
import type { IpcMain } from 'electron'
import { CH } from '@shared/ipc'
import type { StartChatInput } from '@shared/ipc'
import type { AppContext } from '../core/contracts'

export function registerAgentIpc(ipcMain: IpcMain, ctx: AppContext): void {
  ipcMain.handle(CH.chatStart, (_e, input: StartChatInput) => ctx.sessions.start(input))

  ipcMain.handle(CH.chatSend, (_e, input: { chatId: string; text: string }) =>
    ctx.sessions.send(input.chatId, input.text)
  )

  ipcMain.handle(CH.chatAbort, (_e, chatId: string) => ctx.sessions.abort(chatId))

  ipcMain.handle(CH.chatSubscribe, (_e, chatId: string) => ctx.sessions.subscribe(chatId))
}
