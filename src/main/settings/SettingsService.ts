/**
 * SettingsService — app-wide settings persisted as plain JSON at
 * `<userData>/settings.json`. The `hasApiKey` flag is NOT persisted; it is
 * derived from the Secrets store on every read so it can never drift from the
 * Keychain. API-key operations delegate to the injected Secrets store.
 */
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_EFFORT,
  DEFAULT_ENGINE,
  DEFAULT_MODEL,
  type Settings
} from '@shared/types'
import type { SettingsService } from '../core/contracts'
import type { Secrets } from './Secrets'

/** Settings minus the derived `hasApiKey` flag — i.e. what we actually persist. */
type StoredSettings = Omit<Settings, 'hasApiKey'>

const DEFAULTS: StoredSettings = {
  backend: 'cli',
  defaultModel: DEFAULT_MODEL,
  defaultEffort: DEFAULT_EFFORT,
  defaultEngine: DEFAULT_ENGINE,
  defaultMode: 'cad',
  maxConcurrentRuns: 4
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readStored(): StoredSettings {
  const file = settingsPath()
  if (!existsSync(file)) return { ...DEFAULTS }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<StoredSettings>
    // Merge over defaults so a partial/older file still yields a complete object.
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeStored(value: StoredSettings): void {
  const file = settingsPath()
  const dir = path.dirname(file)
  mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.settings.json.${randomUUID()}.tmp`)
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, file)
}

export function createSettingsService(secrets: Secrets): SettingsService {
  // In-memory cache so get() is synchronous and cheap; seeded from disk.
  let stored = readStored()

  function compose(): Settings {
    return { ...stored, hasApiKey: secrets.hasApiKey() }
  }

  return {
    get(): Settings {
      return compose()
    },

    set(patch: Partial<Settings>): Settings {
      // `hasApiKey` is derived, never persisted — drop it from the patch.
      const { hasApiKey: _ignored, ...rest } = patch
      stored = { ...stored, ...rest }
      writeStored(stored)
      return compose()
    },

    setApiKey(key: string): { stored: boolean } {
      return secrets.setApiKey(key)
    },

    getApiKey(): string | null {
      return secrets.getApiKey()
    },

    hasApiKey(): boolean {
      return secrets.hasApiKey()
    }
  }
}
