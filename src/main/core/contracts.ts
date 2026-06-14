/**
 * Main-process module contracts (dependency inversion). Each feature slice
 * implements/consumes these interfaces so the slices can be built in parallel
 * and wired together by the IPC router (src/main/ipc/router.ts).
 *
 * Dependency graph:  EngineLayer → ProjectStore ;  SessionManager → EngineLayer, ProjectStore.
 */
import type {
  ProjectMeta,
  ChatMessage,
  AgentEvent,
  RenderOutcome,
  ToolStatus,
  AuthStatus,
  Settings,
  EngineId
} from '@shared/types'
import type { ParamsFile } from '@shared/params'
import type { StartChatInput, InstallResult } from '@shared/ipc'

// ---------- Emitter (main → renderer push) ----------
export type Emit = (channel: string, payload: unknown) => void

// ---------- Persistence ----------
export interface ProjectStore {
  list(): Promise<ProjectMeta[]>
  create(input: { title?: string } | undefined, defaults: Pick<Settings, 'backend' | 'defaultModel' | 'defaultEffort' | 'defaultEngine' | 'defaultMode'>): Promise<ProjectMeta>
  get(id: string): Promise<{ meta: ProjectMeta; messages: ChatMessage[] } | null>
  getMeta(id: string): Promise<ProjectMeta | null>
  updateMeta(id: string, patch: Partial<ProjectMeta>): Promise<ProjectMeta>
  rename(id: string, title: string): Promise<ProjectMeta>
  remove(id: string): Promise<void>
  appendMessage(id: string, msg: ChatMessage): Promise<void>
  /** absolute path to the project root dir */
  projectDir(id: string): string
  /** absolute path to the agent working dir (where model.* + params.json live) */
  workspaceDir(id: string): string
}

// ---------- Engine layer ----------
export interface EngineProbe {
  openscad: ToolStatus
  python3: ToolStatus
  venv: ToolStatus
  jscad: boolean
}

export interface EngineLayer {
  probe(): Promise<EngineProbe>
  /**
   * Render model.stl (+ model.step for B-rep engines) into workspaceDir from the
   * given source + current param values. Used for BOTH the initial build and the
   * slider fast-path (cancel-in-flight + coalesce per workspace).
   */
  render(opts: { workspaceDir: string; params: ParamsFile }): Promise<RenderOutcome>
  renderThumbnail(opts: { workspaceDir: string; params: ParamsFile; outPath: string }): Promise<boolean>
  /** create/upgrade the managed venv and pip install cadquery + build123d */
  installVenv(onProgress: (line: string) => void): Promise<InstallResult>
}

// ---------- Agent backends ----------
export interface AgentBackend {
  /** begin a run; the first user turn text is included */
  start(): Promise<{ sessionId?: string }>
  /** push a follow-up user turn (planning answers, edits, auto-fix) */
  send(text: string): Promise<void>
  abort(): void
  onEvent(cb: (e: AgentEvent) => void): void
}

export interface SessionManager {
  setEmit(emit: Emit): void
  start(input: StartChatInput): Promise<{ sessionId?: string }>
  send(chatId: string, text: string): Promise<void>
  abort(chatId: string): Promise<void>
  /** buffered events for replay-then-tail when a background chat is re-opened */
  subscribe(chatId: string): AgentEvent[]
}

// ---------- Settings / secrets / tool detect ----------
export interface SettingsService {
  get(): Settings
  set(patch: Partial<Settings>): Settings
  setApiKey(key: string): { stored: boolean }
  getApiKey(): string | null
  hasApiKey(): boolean
}

export interface ToolDetector {
  detectClaude(): Promise<ToolStatus>
  detectOpenscad(): Promise<ToolStatus>
  detectPython(): Promise<ToolStatus>
  detectVenv(): Promise<ToolStatus>
  authStatus(): Promise<AuthStatus>
}

// ---------- App context handed to each register*Ipc() ----------
export interface AppContext {
  emit: Emit
  store: ProjectStore
  engines: EngineLayer
  sessions: SessionManager
  settings: SettingsService
  tools: ToolDetector
  /** resolve the binary/venv paths the engine + agent layers need */
  paths: {
    openscad?: string
    python3?: string
    venvPython?: string
    claude?: string
  }
}

export type { EngineId }
