/**
 * SessionManager — owns every chat run and bridges the backends to the renderer.
 *
 * Per run it:
 *   - writes CLAUDE.md into the workspace and constructs the right AgentBackend
 *   - pushes each AgentEvent into a bounded ring buffer (for replay-then-tail),
 *     forwards it on EV.agentEvent, updates status (EV.chatStatus), and persists
 *     assistant/user messages via the ProjectStore
 *   - derives build_phase events from tool activity (writing / rendering / done / error)
 *   - on `done`, renders model.stl from the authored source + params.json (the app
 *     renders, not the agent) and, on a render error, auto-sends a concise fix message
 *     up to 2 retries; emits EV.artifacts on success
 *   - respects maxConcurrentRuns, queueing extra starts; background runs keep going
 *     regardless of which chat the UI is showing
 *
 * `createSessionManager` takes only { store, engines, settings, paths } + a settable
 * emit so it can be constructed before the AppContext (which holds `sessions`) exists,
 * avoiding a dependency cycle.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type {
  AgentEvent,
  BuildPhase,
  ChatMessage,
  PlanningQuestion,
  RenderError,
  RunStatus
} from '@shared/types'
import { engineById } from '@shared/types'
import type { ParamsFile } from '@shared/params'
import { parseParamsFile } from '@shared/params'
import { parseQuestionsBlock } from '@shared/planning'
import { EV } from '@shared/ipc'
import type { StartChatInput } from '@shared/ipc'
import type {
  AgentBackend,
  Emit,
  EngineLayer,
  ProjectStore,
  SessionManager,
  SettingsService
} from '../core/contracts'
import { buildSystemPrompt, buildClaudeMd } from './promptContract'
import { CliBackend } from './CliBackend'
import { ApiBackend } from './ApiBackend'

const RING_CAP = 500
const MAX_RENDER_RETRIES = 2

/** Subset of AppContext this manager needs (avoids a cycle through `sessions`). */
export interface SessionManagerDeps {
  store: ProjectStore
  engines: EngineLayer
  settings: SettingsService
  paths: { claude?: string }
}

interface RunHandle {
  chatId: string
  backend: AgentBackend
  status: RunStatus
  ring: AgentEvent[]
  engine: StartChatInput['engine']
  mode: StartChatInput['mode']
  workspaceDir: string
  /** how many render→fix retries remain for the current build */
  renderRetriesLeft: number
  /** the last assistant_message text seen this turn (persisted on done) */
  lastAssistantText: string
  /** stlVersion counter, bumped on each successful render */
  stlVersion: number
  /** true during the first (planning) turn until the agent asks questions or starts building */
  planning: boolean
}

/** A queued start that is waiting for a concurrency slot. */
interface QueuedStart {
  input: StartChatInput
  resolve: (v: { sessionId?: string }) => void
}

class SessionManagerImpl implements SessionManager {
  private readonly store: ProjectStore
  private readonly engines: EngineLayer
  private readonly settings: SettingsService
  private readonly paths: { claude?: string }
  private emitFn: Emit = () => {}
  private readonly runs = new Map<string, RunHandle>()
  private readonly queue: QueuedStart[] = []

  constructor(deps: SessionManagerDeps) {
    this.store = deps.store
    this.engines = deps.engines
    this.settings = deps.settings
    this.paths = deps.paths
  }

  setEmit(emit: Emit): void {
    this.emitFn = emit
  }

  subscribe(chatId: string): AgentEvent[] {
    return this.runs.get(chatId)?.ring.slice() ?? []
  }

  /** How many runs are currently occupying a concurrency slot. */
  private activeCount(): number {
    let n = 0
    for (const r of this.runs.values()) {
      if (r.status === 'running') n++
    }
    return n
  }

  async start(input: StartChatInput): Promise<{ sessionId?: string }> {
    const max = Math.max(1, this.settings.get().maxConcurrentRuns)
    if (this.activeCount() >= max) {
      // No slot — register a placeholder run in 'queued' state and wait.
      this.markQueued(input.chatId)
      return new Promise<{ sessionId?: string }>((resolve) => {
        this.queue.push({ input, resolve })
      })
    }
    return this.startNow(input)
  }

  /** Emit a queued status (and a placeholder ring) for a chat awaiting a slot. */
  private markQueued(chatId: string): void {
    const existing = this.runs.get(chatId)
    if (existing) {
      existing.status = 'queued'
    }
    this.emitFn(EV.chatStatus, { chatId, status: 'queued' satisfies RunStatus })
  }

  private async startNow(input: StartChatInput): Promise<{ sessionId?: string }> {
    const ws = this.store.workspaceDir(input.chatId)
    await fs.mkdir(ws, { recursive: true })

    // Direct ("LLM only") mode renders in-process via JSCAD — no external CAD
    // engine (OpenSCAD/CADQuery). CAD mode uses the chosen engine.
    const effectiveEngine = input.mode === 'direct' ? 'jscad' : input.engine

    // Drop the project CLAUDE.md into the workspace (used by the CLI backend's project settings).
    const eng = engineById(effectiveEngine)
    const claudeMd = buildClaudeMd({ engine: effectiveEngine, mode: input.mode })
    await fs.writeFile(path.join(ws, 'CLAUDE.md'), claudeMd, 'utf8').catch(() => {})

    const systemPrompt = buildSystemPrompt({ engine: effectiveEngine, mode: input.mode })

    // Persist the user's first message.
    await this.persistMessage(input.chatId, makeUserMessage(input.firstMessage))

    const backend = this.buildBackend(input, ws, systemPrompt, eng.sourceFile)

    const handle: RunHandle = {
      chatId: input.chatId,
      backend,
      status: 'running',
      ring: [],
      engine: effectiveEngine,
      mode: input.mode,
      workspaceDir: ws,
      renderRetriesLeft: MAX_RENDER_RETRIES,
      lastAssistantText: '',
      stlVersion: 0,
      planning: true
    }
    this.runs.set(input.chatId, handle)

    backend.onEvent((e) => this.onBackendEvent(handle, e))

    this.setStatus(handle, 'running')
    // Show a "Planning" state while the agent generates clarifying questions.
    this.emitPhase(handle, 'planning')
    await this.store
      .updateMeta(input.chatId, { status: 'running', phase: 'planning' })
      .catch(() => {})

    const res = await backend.start()
    if (res.sessionId) {
      await this.store.updateMeta(input.chatId, { sessionId: res.sessionId }).catch(() => {})
    }
    return res
  }

  private buildBackend(
    input: StartChatInput,
    ws: string,
    systemPrompt: string,
    sourceFile: string
  ): AgentBackend {
    const sessionId = crypto.randomUUID()
    if (input.backend === 'api') {
      const apiKey = this.settings.getApiKey()
      return new ApiBackend({
        apiKey: apiKey ?? '',
        workspaceDir: ws,
        model: input.model,
        effort: input.effort,
        systemPrompt,
        sourceFile,
        firstMessage: input.firstMessage
      })
    }
    return new CliBackend({
      claudePath: this.paths.claude,
      workspaceDir: ws,
      model: input.model,
      effort: input.effort,
      systemPrompt,
      sessionId,
      firstMessage: input.firstMessage
    })
  }

  async send(chatId: string, text: string): Promise<void> {
    const handle = this.runs.get(chatId)
    if (!handle) return
    await this.persistMessage(chatId, makeUserMessage(text))
    // First follow-up flips the project from planning → building.
    await this.store.updateMeta(chatId, { phase: 'building', status: 'running' }).catch(() => {})
    this.setStatus(handle, 'running')
    handle.renderRetriesLeft = MAX_RENDER_RETRIES
    handle.lastAssistantText = ''
    // The follow-up (the user's answers) is a normal build turn — stream normally.
    handle.planning = false
    await handle.backend.send(text)
  }

  async abort(chatId: string): Promise<void> {
    const handle = this.runs.get(chatId)
    if (!handle) return
    handle.backend.abort()
    this.setStatus(handle, 'aborted')
    await this.store.updateMeta(chatId, { status: 'aborted' }).catch(() => {})
    this.releaseSlot()
  }

  // ---------- event handling ----------

  private onBackendEvent(handle: RunHandle, event: AgentEvent): void {
    // Planning turn: hide the raw question-generation text — we decide at `done`
    // whether it was a structured questions block or a direct build.
    if (handle.planning) {
      if (event.kind === 'assistant_delta' || event.kind === 'thinking_delta') return
      if (event.kind === 'assistant_message') {
        handle.lastAssistantText = event.text
        return
      }
      // A tool call means the agent is building directly, not asking — resume normally.
      if (event.kind === 'tool_start') handle.planning = false
    }

    this.emitEvent(handle, event)
    this.deriveBuildPhase(handle, event)

    switch (event.kind) {
      case 'session':
        if (event.sessionId) {
          void this.store.updateMeta(handle.chatId, { sessionId: event.sessionId }).catch(() => {})
        }
        break
      case 'assistant_message':
        handle.lastAssistantText = event.text
        void this.persistMessage(handle.chatId, makeAssistantMessage(event.text))
        break
      case 'error':
        void this.persistMessage(handle.chatId, makeErrorMessage(event.message))
        break
      case 'done':
        void this.onDone(handle, event)
        break
      default:
        break
    }
  }

  /** Translate tool/render activity into coarse build_phase events for the progress bar. */
  private deriveBuildPhase(handle: RunHandle, event: AgentEvent): void {
    if (event.kind === 'tool_start') {
      const n = event.name.toLowerCase()
      if (n === 'write' || n === 'edit' || n === 'multiedit' || n === 'write_params' || n === 'write_source') {
        this.emitPhase(handle, 'writing', event.label)
      }
    }
  }

  private emitEvent(handle: RunHandle, event: AgentEvent): void {
    this.pushRing(handle, event)
    this.emitFn(EV.agentEvent, { chatId: handle.chatId, event })
  }

  private emitPhase(handle: RunHandle, phase: BuildPhase, label?: string): void {
    this.emitEvent(handle, { kind: 'build_phase', phase, label })
  }

  /** On a completed agent turn: render the model and auto-fix render errors. */
  private async onDone(handle: RunHandle, event: AgentEvent & { kind: 'done' }): Promise<void> {
    const costUsd = event.costUsd
    if (typeof costUsd === 'number') {
      await this.store.updateMeta(handle.chatId, { lastCostUsd: costUsd }).catch(() => {})
    }

    // Planning turn that produced only text → structured questions or plain prose.
    if (handle.planning) {
      handle.planning = false
      const text = handle.lastAssistantText || event.text
      const questions = parseQuestionsBlock(text)
      if (questions && questions.length > 0) {
        this.emitEvent(handle, { kind: 'questions', questions })
        await this.persistMessage(handle.chatId, makeQuestionsMessage(questions))
        this.emitPhase(handle, 'done')
        this.finish(handle, 'done')
        return
      }
      if (text) {
        this.emitEvent(handle, { kind: 'assistant_message', text })
        await this.persistMessage(handle.chatId, makeAssistantMessage(text))
        handle.lastAssistantText = text
      }
    } else if (event.text && event.text !== handle.lastAssistantText) {
      // Persist the assistant's closing text if it arrived only as `done` text.
      await this.persistMessage(handle.chatId, makeAssistantMessage(event.text))
      handle.lastAssistantText = event.text
    }

    if (event.isError) {
      this.emitPhase(handle, 'error')
      this.finish(handle, 'error')
      return
    }

    const params = await this.readParams(handle.workspaceDir)
    const hasSource = await this.sourceExists(handle)
    if (!params || !hasSource) {
      // Nothing to render yet (e.g. still in the planning Q&A phase).
      this.emitPhase(handle, 'done')
      this.finish(handle, 'done')
      return
    }

    await this.renderAndMaybeFix(handle, params)
  }

  private async renderAndMaybeFix(handle: RunHandle, params: ParamsFile): Promise<void> {
    this.emitPhase(handle, 'rendering')
    const outcome = await this.engines.render({ workspaceDir: handle.workspaceDir, params })

    if (outcome.ok) {
      handle.stlVersion += 1
      const files = await this.collectArtifacts(handle, outcome.stepPath)
      this.emitFn(EV.artifacts, {
        chatId: handle.chatId,
        files,
        stlVersion: handle.stlVersion
      })
      this.emitPhase(handle, 'done')
      await this.store
        .updateMeta(handle.chatId, { hasModel: true, status: 'done', phase: 'building' })
        .catch(() => {})
      this.finish(handle, 'done')
      return
    }

    // Render failed — feed the error back to the agent for an auto-fix, up to N times.
    const renderErr = outcome as RenderError
    if (handle.renderRetriesLeft > 0) {
      handle.renderRetriesLeft -= 1
      this.emitPhase(handle, 'error', 'Render failed — asking the agent to fix it')
      const detail = renderErr.stderrTail || renderErr.message
      const fixMessage = `Your model failed to render: ${detail}. Please fix the source.`
      await this.persistMessage(handle.chatId, makeErrorMessage(`Render failed: ${detail}`))
      this.setStatus(handle, 'running')
      handle.lastAssistantText = ''
      await handle.backend.send(fixMessage)
      return
    }

    // Retries exhausted.
    this.emitPhase(handle, 'error')
    await this.persistMessage(
      handle.chatId,
      makeErrorMessage(`Render still failing after ${MAX_RENDER_RETRIES} attempts: ${renderErr.message}`)
    )
    await this.store.updateMeta(handle.chatId, { status: 'error' }).catch(() => {})
    this.finish(handle, 'error')
  }

  /** Build the EV.artifacts files map from what's on disk in the workspace. */
  private async collectArtifacts(
    handle: RunHandle,
    stepPath?: string
  ): Promise<{ source?: string; stl?: string; step?: string; params?: string }> {
    const eng = engineById(handle.engine)
    const ws = handle.workspaceDir
    const files: { source?: string; stl?: string; step?: string; params?: string } = {}
    if (await exists(path.join(ws, eng.sourceFile))) files.source = path.join(ws, eng.sourceFile)
    if (await exists(path.join(ws, 'model.stl'))) files.stl = path.join(ws, 'model.stl')
    if (await exists(path.join(ws, 'params.json'))) files.params = path.join(ws, 'params.json')
    if (stepPath && (await exists(stepPath))) files.step = stepPath
    return files
  }

  private async readParams(ws: string): Promise<ParamsFile | null> {
    try {
      const raw = await fs.readFile(path.join(ws, 'params.json'), 'utf8')
      return parseParamsFile(raw)
    } catch {
      return null
    }
  }

  private async sourceExists(handle: RunHandle): Promise<boolean> {
    const eng = engineById(handle.engine)
    return exists(path.join(handle.workspaceDir, eng.sourceFile))
  }

  // ---------- status / queue / persistence ----------

  private finish(handle: RunHandle, status: RunStatus): void {
    this.setStatus(handle, status)
    this.releaseSlot()
  }

  private setStatus(handle: RunHandle, status: RunStatus): void {
    if (handle.status === status) return
    handle.status = status
    this.emitFn(EV.chatStatus, { chatId: handle.chatId, status })
  }

  /** A slot freed up — promote the next queued start, if any. */
  private releaseSlot(): void {
    const max = Math.max(1, this.settings.get().maxConcurrentRuns)
    while (this.queue.length > 0 && this.activeCount() < max) {
      const next = this.queue.shift()
      if (!next) break
      void this.startNow(next.input).then((res) => next.resolve(res))
    }
  }

  private pushRing(handle: RunHandle, event: AgentEvent): void {
    handle.ring.push(event)
    if (handle.ring.length > RING_CAP) {
      handle.ring.splice(0, handle.ring.length - RING_CAP)
    }
  }

  private async persistMessage(chatId: string, msg: ChatMessage): Promise<void> {
    await this.store.appendMessage(chatId, msg).catch(() => {})
  }
}

// ---------- message factories ----------

function makeMessage(
  role: ChatMessage['role'],
  text: string,
  kind: ChatMessage['kind']
): ChatMessage {
  return { id: crypto.randomUUID(), role, text, ts: Date.now(), kind }
}

function makeUserMessage(text: string): ChatMessage {
  return makeMessage('user', text, 'message')
}

function makeAssistantMessage(text: string): ChatMessage {
  return makeMessage('assistant', text, 'message')
}

function makeQuestionsMessage(questions: PlanningQuestion[]): ChatMessage {
  const text = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')
  return { id: crypto.randomUUID(), role: 'assistant', text, ts: Date.now(), kind: 'questions', questions }
}

function makeErrorMessage(text: string): ChatMessage {
  return makeMessage('assistant', text, 'error')
}

// ---------- fs helper ----------

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Construct a SessionManager. Takes a settable emit so the IPC router can inject the
 * real emitter and assign the manager onto the AppContext without a construction cycle.
 */
export function createSessionManager(deps: SessionManagerDeps): SessionManager {
  return new SessionManagerImpl(deps)
}
