import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CH, EV } from '@shared/ipc'
import type {
  ProtoloopApi,
  StartChatInput,
  ProjectConfigPatch,
  ExportInput
} from '@shared/ipc'
import type { ChatEventEnvelope, ChatStatusEnvelope, ArtifactsUpdated } from '@shared/types'
import type { ParamValue } from '@shared/params'

function sub<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ProtoloopApi = {
  // projects
  listProjects: () => ipcRenderer.invoke(CH.projectsList),
  createProject: (input) => ipcRenderer.invoke(CH.projectsCreate, input),
  getProject: (id) => ipcRenderer.invoke(CH.projectsGet, id),
  renameProject: (id, title) => ipcRenderer.invoke(CH.projectsRename, id, title),
  deleteProject: (id) => ipcRenderer.invoke(CH.projectsDelete, id),
  updateProjectConfig: (id: string, patch: ProjectConfigPatch) =>
    ipcRenderer.invoke(CH.projectsUpdateConfig, id, patch),

  // chat / agent
  startChat: (input: StartChatInput) => ipcRenderer.invoke(CH.chatStart, input),
  sendChat: (input) => ipcRenderer.invoke(CH.chatSend, input),
  abortChat: (chatId) => ipcRenderer.invoke(CH.chatAbort, chatId),
  subscribeChat: (chatId) => ipcRenderer.invoke(CH.chatSubscribe, chatId),

  // artifacts
  readArtifacts: (id) => ipcRenderer.invoke(CH.artifactsRead, id),
  readStl: (id) => ipcRenderer.invoke(CH.artifactsReadStl, id),
  updateParam: (input: { id: string; name: string; value: ParamValue }) =>
    ipcRenderer.invoke(CH.artifactsUpdateParam, input),
  exportModel: (input: ExportInput) => ipcRenderer.invoke(CH.artifactsExport, input),
  saveThumbnail: (input) => ipcRenderer.invoke(CH.artifactsSaveThumb, input),

  // settings
  getSettings: () => ipcRenderer.invoke(CH.settingsGet),
  setSettings: (patch) => ipcRenderer.invoke(CH.settingsSet, patch),
  setApiKey: (key) => ipcRenderer.invoke(CH.settingsSetApiKey, key),
  detectTools: () => ipcRenderer.invoke(CH.settingsDetectTools),
  installEngines: () => ipcRenderer.invoke(CH.settingsInstallEngines),

  // events
  onAgentEvent: (cb) => sub<ChatEventEnvelope>(EV.agentEvent, cb),
  onChatStatus: (cb) => sub<ChatStatusEnvelope>(EV.chatStatus, cb),
  onArtifacts: (cb) => sub<ArtifactsUpdated>(EV.artifacts, cb),
  onInstallProgress: (cb) => sub<string>(EV.installProgress, cb),
  onError: (cb) => sub<{ chatId?: string; message: string }>(EV.error, cb)
}

contextBridge.exposeInMainWorld('protoloop', api)
