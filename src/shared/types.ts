/**
 * Shared types — the contract between main, preload, and renderer.
 * Keep this free of any Node or DOM imports so it can be used in every process.
 */

// ---------- Engines ----------
export type EngineId = 'openscad' | 'jscad' | 'cadquery' | 'build123d'

/** "cad" = agent writes parametric CAD source + renders; "direct" = agent emits a simple mesh script directly. */
export type GenMode = 'cad' | 'direct'

export interface EngineOption {
  id: EngineId
  label: string
  sourceFile: string
  lang: string
  exportsStep: boolean
  requiresVenv: boolean
  blurb: string
}

export const ENGINES: EngineOption[] = [
  {
    id: 'openscad',
    label: 'OpenSCAD',
    sourceFile: 'model.scad',
    lang: 'openscad',
    exportsStep: false,
    requiresVenv: false,
    blurb: 'Script-based solid modelling. Installed, fast, great for parametric parts.'
  },
  {
    id: 'jscad',
    label: 'JSCAD',
    sourceFile: 'model.js',
    lang: 'javascript',
    exportsStep: false,
    requiresVenv: false,
    blurb: 'JavaScript CSG that runs in-process — zero external dependencies.'
  },
  {
    id: 'cadquery',
    label: 'CADQuery',
    sourceFile: 'model.py',
    lang: 'python',
    exportsStep: true,
    requiresVenv: true,
    blurb: 'Python B-rep modelling on OpenCASCADE. Exports STEP for manufacturing.'
  },
  {
    id: 'build123d',
    label: 'build123d',
    sourceFile: 'model.py',
    lang: 'python',
    exportsStep: true,
    requiresVenv: true,
    blurb: 'Modern Pythonic B-rep modelling on OpenCASCADE. Exports STEP.'
  }
]

export function engineById(id: EngineId): EngineOption {
  const e = ENGINES.find((x) => x.id === id)
  if (!e) throw new Error(`Unknown engine: ${id}`)
  return e
}

// ---------- Models / effort ----------
export type ModelId = 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-haiku-4-5'
export type ModelAlias = 'opus' | 'sonnet' | 'haiku'
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ModelOption {
  id: ModelId
  alias: ModelAlias
  label: string
  /** Effort levels supported in the picker. Empty = no effort parameter (Haiku). */
  efforts: EffortLevel[]
  blurb: string
}

export const MODELS: ModelOption[] = [
  {
    id: 'claude-opus-4-8',
    alias: 'opus',
    label: 'Opus 4.8',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    blurb: 'Most capable. Best geometric reasoning.'
  },
  {
    id: 'claude-sonnet-4-6',
    alias: 'sonnet',
    label: 'Sonnet 4.6',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    blurb: 'Fast and strong. Great for iteration.'
  },
  {
    id: 'claude-haiku-4-5',
    alias: 'haiku',
    label: 'Haiku 4.5',
    efforts: [],
    blurb: 'Fastest and cheapest. Simple parts.'
  }
]

export const DEFAULT_MODEL: ModelId = 'claude-opus-4-8'
export const DEFAULT_EFFORT: EffortLevel = 'high'
export const DEFAULT_ENGINE: EngineId = 'openscad'

export function modelById(id: ModelId): ModelOption {
  const m = MODELS.find((x) => x.id === id)
  if (!m) throw new Error(`Unknown model: ${id}`)
  return m
}

export function modelSupportsEffort(id: ModelId): boolean {
  return modelById(id).efforts.length > 0
}

// ---------- Backend ----------
export type BackendId = 'cli' | 'api'

// ---------- Project / chat ----------
export type ChatPhase = 'planning' | 'building'
export type RunStatus = 'idle' | 'queued' | 'running' | 'done' | 'error' | 'aborted'
export type BuildPhase = 'idle' | 'planning' | 'writing' | 'rendering' | 'done' | 'error'

export interface ProjectMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  phase: ChatPhase
  status: RunStatus
  backend: BackendId
  model: ModelId
  effort: EffortLevel
  engine: EngineId
  mode: GenMode
  sessionId?: string
  lastCostUsd?: number
  /** true once a model.stl exists */
  hasModel: boolean
  /** relative path of thumbnail.png within the project dir, if generated */
  thumbnail?: string
}

export type ChatRole = 'user' | 'assistant' | 'system'
export type ChatMessageKind = 'message' | 'questions' | 'tool' | 'error' | 'status'

/** A clarifying question with selectable options (the user may pick several or write their own). */
export interface PlanningQuestion {
  question: string
  options: string[]
}

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  ts: number
  kind: ChatMessageKind
  /** present when kind === 'questions' — structured questions with options */
  questions?: PlanningQuestion[]
  /** true once the user has submitted answers to this questions card */
  answered?: boolean
  costUsd?: number
}

// ---------- Normalized agent events (both backends emit these) ----------
export type AgentEvent =
  | { kind: 'session'; sessionId: string; model: string }
  | { kind: 'turn_start' }
  | { kind: 'assistant_delta'; text: string }
  | { kind: 'thinking_delta'; text: string }
  | { kind: 'tool_start'; id: string; name: string; label: string }
  | { kind: 'tool_result'; id: string; isError: boolean }
  | { kind: 'assistant_message'; text: string }
  | { kind: 'questions'; questions: PlanningQuestion[] }
  | { kind: 'build_phase'; phase: BuildPhase; label?: string }
  | { kind: 'done'; text: string; costUsd?: number; isError: boolean }
  | { kind: 'error'; message: string }

export interface ChatEventEnvelope {
  chatId: string
  event: AgentEvent
}

export interface ChatStatusEnvelope {
  chatId: string
  status: RunStatus
}

export interface ArtifactsUpdated {
  chatId: string
  files: {
    source?: string
    stl?: string
    step?: string
    params?: string
    thumbnail?: string
  }
  /** monotonically increasing per project so the viewer knows to reload */
  stlVersion: number
}

// ---------- Engine render results ----------
export interface RenderResult {
  ok: true
  stlPath: string
  stepPath?: string
  facets?: number
  vertices?: number
  durationMs: number
  engine: EngineId
}

export interface RenderError {
  ok: false
  code: 'ENGINE_UNAVAILABLE' | 'RENDER_FAILED' | 'BINARY_NOT_FOUND' | 'TIMEOUT' | 'BAD_SOURCE' | 'UNKNOWN'
  engine: EngineId
  message: string
  stderrTail?: string
  installHint?: string
}

export type RenderOutcome = RenderResult | RenderError

// ---------- Settings + tool detection ----------
export interface Settings {
  backend: BackendId
  defaultModel: ModelId
  defaultEffort: EffortLevel
  defaultEngine: EngineId
  defaultMode: GenMode
  hasApiKey: boolean
  maxConcurrentRuns: number
}

export interface ToolStatus {
  name: string
  path?: string
  version?: string
  ok: boolean
  hint?: string
}

export interface AuthStatus {
  loggedIn: boolean
  method?: string
  subscription?: string
}

export interface ToolDetectResult {
  claude: ToolStatus
  openscad: ToolStatus
  python3: ToolStatus
  /** the managed CADQuery/build123d venv */
  venv: ToolStatus
  auth: AuthStatus
}

// ---------- Build state (for the progress bar) ----------
export interface BuildState {
  phase: BuildPhase
  label: string
  indeterminate: boolean
  pct?: number
  errorText?: string
}
