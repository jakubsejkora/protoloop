/**
 * ProjectStore — on-disk project persistence.
 *
 * Layout per project at `<userData>/projects/<id>/`:
 *   meta.json    ProjectMeta (atomic tmp+rename writes)
 *   chat.jsonl   one ChatMessage JSON per line, append-only
 *   workspace/   engine source + params.json + renders
 *
 * Corruption-tolerant: a bad meta.json is skipped by list(); bad chat.jsonl
 * lines are skipped on read.
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ChatMessage, ProjectMeta, Settings } from '@shared/types'
import type { ProjectStore } from '../core/contracts'
import { projectDir, projectsRoot, workspaceDir } from './paths'

type CreateDefaults = Pick<
  Settings,
  'backend' | 'defaultModel' | 'defaultEffort' | 'defaultEngine' | 'defaultMode'
>

const META_FILE = 'meta.json'
const CHAT_FILE = 'chat.jsonl'

function metaPath(id: string): string {
  return path.join(projectDir(id), META_FILE)
}

function chatPath(id: string): string {
  return path.join(projectDir(id), CHAT_FILE)
}

/** Write JSON atomically: write a sibling tmp file then rename over the target. */
async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(filePath)}.${randomUUID()}.tmp`)
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

async function readMeta(id: string): Promise<ProjectMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(id), 'utf8')
    return JSON.parse(raw) as ProjectMeta
  } catch {
    return null
  }
}

async function readMessages(id: string): Promise<ChatMessage[]> {
  let raw: string
  try {
    raw = await fs.readFile(chatPath(id), 'utf8')
  } catch {
    return []
  }
  const messages: ChatMessage[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      messages.push(JSON.parse(trimmed) as ChatMessage)
    } catch {
      // skip a corrupt line, keep the rest
    }
  }
  return messages
}

export function createProjectStore(): ProjectStore {
  async function getMeta(id: string): Promise<ProjectMeta | null> {
    return readMeta(id)
  }

  async function updateMeta(id: string, patch: Partial<ProjectMeta>): Promise<ProjectMeta> {
    const current = await readMeta(id)
    if (!current) throw new Error(`Project not found: ${id}`)
    const next: ProjectMeta = { ...current, ...patch, id: current.id, updatedAt: Date.now() }
    await writeJsonAtomic(metaPath(id), next)
    return next
  }

  return {
    async list(): Promise<ProjectMeta[]> {
      let entries: string[]
      try {
        const dir = await fs.readdir(projectsRoot(), { withFileTypes: true })
        entries = dir.filter((d) => d.isDirectory()).map((d) => d.name)
      } catch {
        return []
      }
      const metas = await Promise.all(entries.map((id) => readMeta(id)))
      return metas
        .filter((m): m is ProjectMeta => m !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },

    async create(
      input: { title?: string } | undefined,
      defaults: CreateDefaults
    ): Promise<ProjectMeta> {
      const id = randomUUID()
      const now = Date.now()
      await fs.mkdir(workspaceDir(id), { recursive: true })
      const meta: ProjectMeta = {
        id,
        title: input?.title || 'Untitled',
        createdAt: now,
        updatedAt: now,
        phase: 'planning',
        status: 'idle',
        backend: defaults.backend,
        model: defaults.defaultModel,
        effort: defaults.defaultEffort,
        engine: defaults.defaultEngine,
        mode: defaults.defaultMode,
        hasModel: false
      }
      await writeJsonAtomic(metaPath(id), meta)
      return meta
    },

    async get(id: string): Promise<{ meta: ProjectMeta; messages: ChatMessage[] } | null> {
      const meta = await readMeta(id)
      if (!meta) return null
      const messages = await readMessages(id)
      return { meta, messages }
    },

    getMeta,

    updateMeta,

    async rename(id: string, title: string): Promise<ProjectMeta> {
      return updateMeta(id, { title })
    },

    async remove(id: string): Promise<void> {
      await fs.rm(projectDir(id), { recursive: true, force: true })
    },

    async appendMessage(id: string, msg: ChatMessage): Promise<void> {
      const file = chatPath(id)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.appendFile(file, JSON.stringify(msg) + '\n', 'utf8')
    },

    projectDir(id: string): string {
      return projectDir(id)
    },

    workspaceDir(id: string): string {
      return workspaceDir(id)
    }
  }
}
