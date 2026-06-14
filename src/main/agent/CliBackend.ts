/**
 * CLI agent backend. Drives the installed `claude` CLI headlessly with
 * `--output-format stream-json --input-format stream-json`, piping stdout through
 * StreamParser to emit normalized AgentEvents. The CLI is authed via the user's
 * Max subscription, so NO API key is needed.
 *
 * The first user turn is written to stdin as one stream-json line; stdin is kept
 * open so `send()` can push follow-up turns (planning answers, edits, auto-fix).
 */
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { AgentEvent, EffortLevel, ModelId } from '@shared/types'
import { modelById, modelSupportsEffort } from '@shared/types'
import type { AgentBackend } from '../core/contracts'
import { StreamParser } from './StreamParser'

export interface CliBackendDeps {
  /** path to the `claude` binary (falls back to 'claude' on PATH) */
  claudePath?: string
  /** the agent working directory (cwd for the spawned process) */
  workspaceDir: string
  model: ModelId
  effort: EffortLevel
  /** the system prompt (buildSystemPrompt output) appended via --append-system-prompt */
  systemPrompt: string
  /** stable per-run session id (crypto.randomUUID()) */
  sessionId: string
  /** the first user turn text */
  firstMessage: string
  env?: NodeJS.ProcessEnv
}

/** Build the verified CLI argv. Exported so the SessionManager / tests can inspect it. */
export function buildCliArgs(deps: CliBackendDeps): string[] {
  const alias = modelById(deps.model).alias
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--model',
    alias
  ]
  if (modelSupportsEffort(deps.model)) {
    args.push('--effort', deps.effort)
  }
  args.push(
    '--permission-mode',
    'bypassPermissions',
    '--allowedTools',
    'Read',
    'Edit',
    'Write',
    'Bash',
    'Glob',
    'Grep',
    '--strict-mcp-config',
    '--setting-sources',
    'project',
    '--session-id',
    deps.sessionId,
    '--append-system-prompt',
    deps.systemPrompt
  )
  return args
}

/** Encode a single user turn as one line of stream-json. */
function userTurnLine(text: string): string {
  return (
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] }
    }) + '\n'
  )
}

export class CliBackend implements AgentBackend {
  private readonly deps: CliBackendDeps
  private listener: ((e: AgentEvent) => void) | null = null
  private child: ChildProcessWithoutNullStreams | null = null
  private parser: StreamParser | null = null
  private doneEmitted = false
  private stderrTail = ''

  constructor(deps: CliBackendDeps) {
    this.deps = deps
  }

  onEvent(cb: (e: AgentEvent) => void): void {
    this.listener = cb
  }

  private emit(e: AgentEvent): void {
    if (e.kind === 'done') {
      if (this.doneEmitted) return
      this.doneEmitted = true
    }
    this.listener?.(e)
  }

  async start(): Promise<{ sessionId?: string }> {
    const claudePath = this.deps.claudePath ?? 'claude'
    const args = buildCliArgs(this.deps)
    const child = spawn(claudePath, args, {
      cwd: this.deps.workspaceDir,
      env: this.deps.env ?? process.env
    }) as ChildProcessWithoutNullStreams
    this.child = child

    const parser = new StreamParser((e) => this.emit(e))
    this.parser = parser

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => parser.push(chunk))

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-4000)
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      this.emit({
        kind: 'error',
        message:
          err.code === 'ENOENT'
            ? `Claude CLI not found at "${claudePath}". Is it installed?`
            : `Claude CLI failed to start: ${err.message}`
      })
      this.emit({ kind: 'done', text: '', isError: true })
    })

    child.on('close', (code) => {
      parser.end()
      if (!this.doneEmitted) {
        const failed = typeof code === 'number' && code !== 0
        if (failed && this.stderrTail.trim()) {
          this.emit({ kind: 'error', message: this.stderrTail.trim() })
        }
        this.emit({ kind: 'done', text: '', isError: failed })
      }
    })

    // Write the first user turn; keep stdin open for follow-ups.
    child.stdin.write(userTurnLine(this.deps.firstMessage))

    return { sessionId: this.deps.sessionId }
  }

  async send(text: string): Promise<void> {
    const child = this.child
    if (!child || !child.stdin.writable) return
    // A new turn means the previous `done` is no longer the final one.
    this.doneEmitted = false
    child.stdin.write(userTurnLine(text))
  }

  abort(): void {
    const child = this.child
    if (!child) return
    try {
      child.stdin.end()
    } catch {
      // stdin may already be closed.
    }
    try {
      child.kill('SIGTERM')
    } catch {
      // process may already be gone.
    }
  }
}
