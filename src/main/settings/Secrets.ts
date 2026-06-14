/**
 * Secrets — stores the (optional) Anthropic API key encrypted at rest using
 * Electron's `safeStorage`, which is backed by the macOS Keychain. The ciphertext
 * lives at `<userData>/secret.bin`. If OS encryption is unavailable we refuse to
 * persist the key (return { stored: false }) rather than writing it in plaintext.
 */
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface Secrets {
  setApiKey(key: string): { stored: boolean }
  getApiKey(): string | null
  hasApiKey(): boolean
}

function secretPath(): string {
  return path.join(app.getPath('userData'), 'secret.bin')
}

export function createSecrets(): Secrets {
  return {
    setApiKey(key: string): { stored: boolean } {
      const file = secretPath()
      const trimmed = key.trim()
      if (!trimmed) {
        // Empty key clears any stored secret.
        if (existsSync(file)) rmSync(file, { force: true })
        return { stored: false }
      }
      if (!safeStorage.isEncryptionAvailable()) return { stored: false }
      const encrypted = safeStorage.encryptString(trimmed)
      writeFileSync(file, encrypted)
      return { stored: true }
    },

    getApiKey(): string | null {
      const file = secretPath()
      if (!existsSync(file)) return null
      if (!safeStorage.isEncryptionAvailable()) return null
      try {
        const buf = readFileSync(file)
        const decrypted = safeStorage.decryptString(buf)
        return decrypted.length > 0 ? decrypted : null
      } catch {
        return null
      }
    },

    hasApiKey(): boolean {
      return this.getApiKey() !== null
    }
  }
}
