import type {
  ProjectMeta,
  ChatMessage,
  AgentEvent,
  ChatEventEnvelope,
  ChatStatusEnvelope,
  ArtifactsUpdated,
  RenderOutcome,
  Settings,
  ToolDetectResult,
  BackendId,
  ModelId,
  EffortLevel,
  EngineId,
  GenMode
} from './types'
import type { ParamsFile, ParamValue } from './params'

/** Invoke (renderer → main, request/response) channel names. */
export const CH = {
  projectsList: 'projects:list',
  projectsCreate: 'projects:create',
  projectsGet: 'projects:get',
  projectsRename: 'projects:rename',
  projectsDelete: 'projects:delete',
  projectsUpdateConfig: 'projects:updateConfig',

  chatStart: 'chat:start',
  chatSend: 'chat:send',
  chatAbort: 'chat:abort',
  chatSubscribe: 'chat:subscribe',

  artifactsRead: 'artifacts:read',
  artifactsReadStl: 'artifacts:readStl',
  artifactsUpdateParam: 'artifacts:updateParam',
  artifactsExport: 'artifacts:export',
  artifactsSaveThumb: 'artifacts:saveThumb',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsSetApiKey: 'settings:setApiKey',
  settingsDetectTools: 'settings:detectTools',
  settingsInstallEngines: 'settings:installEngines'
} as const

/** Event (main → renderer, push) channel names. */
export const EV = {
  agentEvent: 'ev:agentEvent',
  chatStatus: 'ev:chatStatus',
  artifacts: 'ev:artifacts',
  installProgress: 'ev:installProgress',
  error: 'ev:error'
} as const

// ---------- request/response payload shapes ----------
export interface ProjectConfigPatch {
  title?: string
  backend?: BackendId
  model?: ModelId
  effort?: EffortLevel
  engine?: EngineId
  mode?: GenMode
}

export interface StartChatInput {
  chatId: string
  firstMessage: string
  backend: BackendId
  model: ModelId
  effort: EffortLevel
  engine: EngineId
  mode: GenMode
}

export interface ArtifactsReadResult {
  hasStl: boolean
  hasStep: boolean
  params: ParamsFile | null
  stlVersion: number
  units: string
}

export interface ExportInput {
  id: string
  format: 'stl' | 'step'
}

export interface InstallResult {
  ok: boolean
  message?: string
}

/**
 * The full preload bridge surface exposed on `window.protoloop`.
 * Implemented in src/preload/index.ts; consumed everywhere in the renderer.
 */
export interface ProtoloopApi {
  // projects
  listProjects(): Promise<ProjectMeta[]>
  createProject(input?: { title?: string }): Promise<ProjectMeta>
  getProject(id: string): Promise<{ meta: ProjectMeta; messages: ChatMessage[] } | null>
  renameProject(id: string, title: string): Promise<ProjectMeta>
  deleteProject(id: string): Promise<void>
  updateProjectConfig(id: string, patch: ProjectConfigPatch): Promise<ProjectMeta>

  // chat / agent
  startChat(input: StartChatInput): Promise<{ sessionId?: string }>
  sendChat(input: { chatId: string; text: string }): Promise<void>
  abortChat(chatId: string): Promise<void>
  /** returns buffered events so a re-opened chat can replay-then-tail */
  subscribeChat(chatId: string): Promise<AgentEvent[]>

  // artifacts
  readArtifacts(id: string): Promise<ArtifactsReadResult>
  readStl(id: string): Promise<ArrayBuffer | null>
  updateParam(input: { id: string; name: string; value: ParamValue }): Promise<RenderOutcome>
  exportModel(input: ExportInput): Promise<{ savedTo?: string }>
  saveThumbnail(input: { id: string; pngDataUrl: string }): Promise<void>

  // settings
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  setApiKey(key: string): Promise<{ stored: boolean }>
  detectTools(): Promise<ToolDetectResult>
  installEngines(): Promise<InstallResult>

  // events (return an unsubscribe fn)
  onAgentEvent(cb: (e: ChatEventEnvelope) => void): () => void
  onChatStatus(cb: (e: ChatStatusEnvelope) => void): () => void
  onArtifacts(cb: (e: ArtifactsUpdated) => void): () => void
  onInstallProgress(cb: (line: string) => void): () => void
  onError(cb: (e: { chatId?: string; message: string }) => void): () => void
}
