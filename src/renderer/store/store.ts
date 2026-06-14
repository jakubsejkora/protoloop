import { create } from 'zustand'
import { api } from '@/ipc/bridge'
import type {
  ProjectMeta,
  ChatMessage,
  AgentEvent,
  BuildState,
  RunStatus,
  Settings,
  ToolDetectResult,
  BackendId,
  ModelId,
  EffortLevel,
  EngineId,
  GenMode
} from '@shared/types'
import type { ParamsFile, ParamValue } from '@shared/params'

export interface ToolTick {
  id: string
  label: string
  done: boolean
  error?: boolean
}

export interface ChatState {
  messages: ChatMessage[]
  streaming: string
  toolTicker: ToolTick[]
  build: BuildState
  status: RunStatus
  started: boolean
  loaded: boolean
}

/** Per-pane viewer data (one model per open preview). */
export interface PreviewData {
  stlBytes: ArrayBuffer | null
  stlVersion: number
  units: string
  title: string
}

const IDLE_BUILD: BuildState = { phase: 'idle', label: '', indeterminate: false }
const PREVIEW_CAP = 8

function emptyChat(): ChatState {
  return {
    messages: [],
    streaming: '',
    toolTicker: [],
    build: { ...IDLE_BUILD },
    status: 'idle',
    started: false,
    loaded: false
  }
}

interface StoreState {
  ready: boolean
  projects: ProjectMeta[]
  /** the focused pane — drives the Chat, Parameters panel and Measure */
  activeId: string | null
  chats: Record<string, ChatState>

  // multi-preview
  openPreviews: string[]
  previewData: Record<string, PreviewData>

  // focused-model state (Parameters panel + measure)
  params: ParamsFile | null
  units: string
  measureActive: boolean

  // global
  settings: Settings | null
  tools: ToolDetectResult | null
  settingsOpen: boolean
  installing: boolean
  installLog: string[]

  /** live-canvas snapshot fns, keyed per preview id (for sidebar thumbnails) */
  snapshotFns: Record<string, () => string | null>

  // lifecycle
  init: () => Promise<void>
  loadProjects: () => Promise<void>
  selectProject: (id: string) => Promise<void>
  newProject: () => Promise<void>
  renameProject: (id: string, title: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  updateConfig: (
    id: string,
    patch: Partial<{
      backend: BackendId
      model: ModelId
      effort: EffortLevel
      engine: EngineId
      mode: GenMode
      title: string
    }>
  ) => Promise<void>

  // preview panes
  openPreview: (id: string) => Promise<void>
  closePreview: (id: string) => void
  focusPreview: (id: string) => Promise<void>

  // chat
  sendMessage: (text: string) => Promise<void>
  submitPlanningAnswers: (chatId: string, answerText: string) => Promise<void>
  abortActive: () => Promise<void>

  // params
  setParam: (name: string, value: ParamValue) => void

  // viewer / measure
  setMeasureActive: (v: boolean) => void
  toggleMeasure: () => void
  registerSnapshot: (id: string, fn: () => string | null) => void

  // settings
  openSettings: () => void
  closeSettings: () => void
  refreshTools: () => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  setApiKey: (key: string) => Promise<boolean>
  installEngines: () => Promise<void>
  exportModel: (format: 'stl' | 'step') => Promise<void>

  // event application (internal)
  _applyEvent: (chatId: string, ev: AgentEvent) => void
  _setStatus: (chatId: string, status: RunStatus) => void
  _reloadArtifacts: (chatId: string, stlVersion?: number) => Promise<void>
}

function patchChat(
  set: (fn: (s: StoreState) => Partial<StoreState>) => void,
  chatId: string,
  fn: (c: ChatState) => ChatState
): void {
  set((s) => {
    const cur = s.chats[chatId] ?? emptyChat()
    return { chats: { ...s.chats, [chatId]: fn(cur) } }
  })
}

const paramTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  projects: [],
  activeId: null,
  chats: {},
  openPreviews: [],
  previewData: {},
  params: null,
  units: 'mm',
  measureActive: false,
  settings: null,
  tools: null,
  settingsOpen: false,
  installing: false,
  installLog: [],
  snapshotFns: {},

  init: async () => {
    api.onAgentEvent(({ chatId, event }) => get()._applyEvent(chatId, event))
    api.onChatStatus(({ chatId, status }) => get()._setStatus(chatId, status))
    api.onArtifacts(({ chatId, stlVersion }) => {
      set((s) => ({
        projects: s.projects.map((p) => (p.id === chatId ? { ...p, hasModel: true } : p))
      }))
      // reload any OPEN pane for that project, not only the focused one
      if (get().openPreviews.includes(chatId)) void get()._reloadArtifacts(chatId, stlVersion)
    })
    api.onInstallProgress((line) =>
      set((s) => ({ installLog: [...s.installLog, line].slice(-400) }))
    )
    api.onError(({ message }) => set((s) => ({ installLog: [...s.installLog, `! ${message}`] })))

    const settings = await api.getSettings()
    set({ settings })
    await get().loadProjects()
    const first = get().projects[0]
    if (first) await get().openPreview(first.id)
    set({ ready: true })
  },

  loadProjects: async () => {
    const projects = await api.listProjects()
    set({ projects })
  },

  // clicking a sidebar creation opens it as a pane (and focuses it)
  selectProject: async (id) => {
    await get().openPreview(id)
  },

  openPreview: async (id) => {
    set((s) => {
      if (s.openPreviews.includes(id)) return {}
      let open = [...s.openPreviews, id]
      if (open.length > PREVIEW_CAP) {
        // drop the oldest pane that isn't the one we're adding or currently focused
        const drop = open.find((x) => x !== id && x !== s.activeId)
        if (drop) open = open.filter((x) => x !== drop)
      }
      return { openPreviews: open }
    })
    await get().focusPreview(id)
  },

  focusPreview: async (id) => {
    set({ activeId: id, measureActive: false })
    const detail = await api.getProject(id)
    const meta = detail?.meta
    const started =
      !!meta?.sessionId || (detail?.messages.some((m) => m.role === 'assistant') ?? false)
    patchChat(set, id, (c) => ({
      ...c,
      messages: detail?.messages ?? [],
      loaded: true,
      started,
      status: meta?.status ?? c.status
    }))
    const buffered = await api.subscribeChat(id)
    for (const ev of buffered) {
      if (ev.kind === 'build_phase' || ev.kind === 'tool_start' || ev.kind === 'tool_result')
        get()._applyEvent(id, ev)
    }
    await get()._reloadArtifacts(id)
  },

  closePreview: (id) => {
    set((s) => {
      const openPreviews = s.openPreviews.filter((x) => x !== id)
      const previewData = { ...s.previewData }
      delete previewData[id]
      const snapshotFns = { ...s.snapshotFns }
      delete snapshotFns[id]
      const activeId = s.activeId === id ? (openPreviews[openPreviews.length - 1] ?? null) : s.activeId
      return { openPreviews, previewData, snapshotFns, activeId }
    })
    const next = get().activeId
    if (next) void get().focusPreview(next)
    else set({ params: null })
  },

  newProject: async () => {
    const meta = await api.createProject()
    set((s) => ({ projects: [meta, ...s.projects] }))
    await get().openPreview(meta.id)
  },

  renameProject: async (id, title) => {
    const meta = await api.renameProject(id, title)
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? meta : p)) }))
  },

  deleteProject: async (id) => {
    await api.deleteProject(id)
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id)
      const chats = { ...s.chats }
      delete chats[id]
      const openPreviews = s.openPreviews.filter((x) => x !== id)
      const previewData = { ...s.previewData }
      delete previewData[id]
      const snapshotFns = { ...s.snapshotFns }
      delete snapshotFns[id]
      const activeId =
        s.activeId === id ? (openPreviews[openPreviews.length - 1] ?? null) : s.activeId
      return { projects, chats, openPreviews, previewData, snapshotFns, activeId }
    })
    const next = get().activeId
    if (next) await get().focusPreview(next)
    else set({ params: null })
  },

  updateConfig: async (id, patch) => {
    const meta = await api.updateProjectConfig(id, patch)
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? meta : p)) }))
  },

  sendMessage: async (text) => {
    const id = get().activeId
    if (!id) return
    const meta = get().projects.find((p) => p.id === id)
    if (!meta) return
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      ts: Date.now(),
      kind: 'message'
    }
    patchChat(set, id, (c) => ({ ...c, messages: [...c.messages, userMsg], streaming: '' }))
    const chat = get().chats[id]
    if (!chat?.started) {
      patchChat(set, id, (c) => ({ ...c, started: true, status: 'running' }))
      await api.startChat({
        chatId: id,
        firstMessage: text,
        backend: meta.backend,
        model: meta.model,
        effort: meta.effort,
        engine: meta.engine,
        mode: meta.mode
      })
    } else {
      patchChat(set, id, (c) => ({ ...c, status: 'running' }))
      await api.sendChat({ chatId: id, text })
    }
  },

  submitPlanningAnswers: async (chatId, answerText) => {
    // mark the questions card(s) for this chat as answered so it locks
    patchChat(set, chatId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.kind === 'questions' ? { ...m, answered: true } : m))
    }))
    await get().sendMessage(answerText)
  },

  abortActive: async () => {
    const id = get().activeId
    if (id) await api.abortChat(id)
  },

  setParam: (name, value) => {
    set((s) => {
      if (!s.params) return {}
      const params = {
        ...s.params,
        params: s.params.params.map((p) => (p.name === name ? { ...p, value } : p))
      }
      return { params }
    })
    const id = get().activeId
    if (!id) return
    const key = `${id}:${name}`
    const prev = paramTimers.get(key)
    if (prev) clearTimeout(prev)
    paramTimers.set(
      key,
      setTimeout(() => {
        paramTimers.delete(key)
        void api.updateParam({ id, name, value })
      }, 130)
    )
  },

  setMeasureActive: (v) => set({ measureActive: v }),
  toggleMeasure: () => set((s) => ({ measureActive: !s.measureActive })),
  registerSnapshot: (id, fn) =>
    set((s) => ({ snapshotFns: { ...s.snapshotFns, [id]: fn } })),

  openSettings: () => {
    set({ settingsOpen: true })
    void get().refreshTools()
  },
  closeSettings: () => set({ settingsOpen: false }),

  refreshTools: async () => {
    const tools = await api.detectTools()
    set({ tools })
  },

  saveSettings: async (patch) => {
    const settings = await api.setSettings(patch)
    set({ settings })
  },

  setApiKey: async (key) => {
    const res = await api.setApiKey(key)
    if (res.stored) {
      const settings = await api.getSettings()
      set({ settings })
    }
    return res.stored
  },

  installEngines: async () => {
    set({ installing: true, installLog: [] })
    try {
      await api.installEngines()
    } finally {
      set({ installing: false })
      await get().refreshTools()
    }
  },

  exportModel: async (format) => {
    const id = get().activeId
    if (id) await api.exportModel({ id, format })
  },

  _setStatus: (chatId, status) => {
    patchChat(set, chatId, (c) => ({ ...c, status }))
    set((s) => ({ projects: s.projects.map((p) => (p.id === chatId ? { ...p, status } : p)) }))
  },

  _applyEvent: (chatId, ev) => {
    switch (ev.kind) {
      case 'turn_start':
        patchChat(set, chatId, (c) => ({ ...c, streaming: '', status: 'running' }))
        break
      case 'assistant_delta':
        patchChat(set, chatId, (c) => ({ ...c, streaming: c.streaming + ev.text }))
        break
      case 'thinking_delta':
        break
      case 'tool_start':
        patchChat(set, chatId, (c) => ({
          ...c,
          toolTicker: [...c.toolTicker.slice(-12), { id: ev.id, label: ev.label, done: false }]
        }))
        break
      case 'tool_result':
        patchChat(set, chatId, (c) => ({
          ...c,
          toolTicker: c.toolTicker.map((t) =>
            t.id === ev.id ? { ...t, done: true, error: ev.isError } : t
          )
        }))
        break
      case 'assistant_message':
        patchChat(set, chatId, (c) => ({
          ...c,
          streaming: '',
          messages: [
            ...c.messages,
            {
              id: `a-${Date.now()}-${c.messages.length}`,
              role: 'assistant',
              text: ev.text,
              ts: Date.now(),
              kind: 'message'
            }
          ]
        }))
        break
      case 'questions':
        patchChat(set, chatId, (c) => ({
          ...c,
          streaming: '',
          messages: [
            ...c.messages,
            {
              id: `q-${Date.now()}`,
              role: 'assistant',
              text: ev.questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n'),
              ts: Date.now(),
              kind: 'questions',
              questions: ev.questions,
              answered: false
            }
          ]
        }))
        break
      case 'build_phase':
        patchChat(set, chatId, (c) => ({ ...c, build: buildStateFor(ev.phase, ev.label) }))
        break
      case 'done':
        patchChat(set, chatId, (c) => {
          const leftover = c.streaming.trim()
          const messages =
            leftover &&
            (c.messages.length === 0 || c.messages[c.messages.length - 1].role !== 'assistant')
              ? [
                  ...c.messages,
                  {
                    id: `a-${Date.now()}`,
                    role: 'assistant' as const,
                    text: leftover,
                    ts: Date.now(),
                    kind: 'message' as const,
                    costUsd: ev.costUsd
                  }
                ]
              : c.messages
          return {
            ...c,
            streaming: '',
            status: ev.isError ? 'error' : 'done',
            build: ev.isError ? buildStateFor('error') : buildStateFor('done'),
            messages
          }
        })
        break
      case 'error':
        patchChat(set, chatId, (c) => ({
          ...c,
          status: 'error',
          build: buildStateFor('error', ev.message),
          messages: [
            ...c.messages,
            { id: `e-${Date.now()}`, role: 'system', text: ev.message, ts: Date.now(), kind: 'error' }
          ]
        }))
        break
      case 'session':
        break
    }
  },

  _reloadArtifacts: async (chatId, stlVersion) => {
    const info = await api.readArtifacts(chatId)
    const bytes = info.hasStl ? await api.readStl(chatId) : null
    const title = get().projects.find((p) => p.id === chatId)?.title ?? ''
    set((s) => {
      const previewData = {
        ...s.previewData,
        [chatId]: {
          stlBytes: bytes,
          stlVersion: stlVersion ?? info.stlVersion,
          units: info.units || 'mm',
          title
        }
      }
      const patch: Partial<StoreState> = { previewData }
      if (s.activeId === chatId) {
        patch.params = info.params
        patch.units = info.units || 'mm'
      }
      return patch
    })
    // save a sidebar thumbnail from that pane's live canvas shortly after a fresh render
    const snap = get().snapshotFns[chatId]
    if (bytes && snap) {
      setTimeout(() => {
        const data = snap()
        if (data) {
          void api.saveThumbnail({ id: chatId, pngDataUrl: data })
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === chatId ? { ...p, hasModel: true, thumbnail: 'thumbnail.png' } : p
            )
          }))
        }
      }, 650)
    }
  }
}))

function buildStateFor(phase: BuildState['phase'], label?: string): BuildState {
  switch (phase) {
    case 'planning':
      return { phase, label: label || 'Planning', indeterminate: true }
    case 'writing':
      return { phase, label: label || 'Writing model', indeterminate: true }
    case 'rendering':
      return { phase, label: label || 'Rendering', indeterminate: true }
    case 'done':
      return { phase, label: label || 'Done', indeterminate: false, pct: 100 }
    case 'error':
      return { phase, label: label || 'Error', indeterminate: false, errorText: label }
    default:
      return { ...IDLE_BUILD }
  }
}

// convenience selectors
export const useActiveProject = (): ProjectMeta | null =>
  useStore((s) => s.projects.find((p) => p.id === s.activeId) ?? null)

export const useActiveChat = (): ChatState | null =>
  useStore((s) => (s.activeId ? s.chats[s.activeId] ?? null : null))
