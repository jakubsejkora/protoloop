/**
 * Line-buffered NDJSON framer for the Claude CLI's `--output-format stream-json`.
 *
 * The CLI emits one JSON object per line. We buffer partial lines across chunks,
 * parse each complete line, and map the (many) CLI event shapes onto the small
 * normalized `AgentEvent` union the rest of the app consumes. Unknown event types
 * are ignored — never thrown — so the parser tolerates new/unrecognized frames.
 *
 * Mapping (CLI shape → AgentEvent):
 *   {type:"system",subtype:"init"}                      → session
 *   stream_event message_start                          → turn_start
 *   stream_event content_block_delta text_delta         → assistant_delta
 *   stream_event content_block_delta thinking_delta     → thinking_delta
 *   stream_event content_block_start tool_use           → tool_start (human label)
 *   user-role event with tool_result                    → tool_result
 *   top-level assistant snapshot                        → assistant_message
 *   {type:"result"}                                     → done
 */
import type { AgentEvent } from '@shared/types'

/* Loose shapes for the JSON frames — everything is optional and defensively read. */
interface AnyBlock {
  type?: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  content?: unknown
  tool_use_id?: string
  is_error?: boolean
}

interface AnyFrame {
  type?: string
  subtype?: string
  session_id?: string
  model?: string
  // result frame
  result?: string
  total_cost_usd?: number
  is_error?: boolean
  // assistant/user snapshot frames
  message?: { role?: string; content?: AnyBlock[] | string; model?: string }
  // stream_event (partial-message) frames
  event?: {
    type?: string
    index?: number
    message?: { role?: string; model?: string }
    content_block?: AnyBlock
    delta?: AnyBlock
  }
}

/** Derive a short human label ("Writing model.scad", "Reading…", "Running…") from a tool_use block. */
export function toolLabel(name: string | undefined, input: unknown): string {
  const n = (name ?? '').toLowerCase()
  const path = filePathFromInput(input)
  const base = path ? basename(path) : undefined
  switch (n) {
    case 'write':
      return base ? `Writing ${base}` : 'Writing…'
    case 'edit':
    case 'multiedit':
      return base ? `Editing ${base}` : 'Editing…'
    case 'read':
      return base ? `Reading ${base}` : 'Reading…'
    case 'bash':
      return 'Running…'
    case 'glob':
    case 'grep':
      return 'Searching…'
    default:
      return name ? `${name}…` : 'Working…'
  }
}

function filePathFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const o = input as Record<string, unknown>
  const candidate = o.file_path ?? o.path ?? o.filename ?? o.notebook_path
  return typeof candidate === 'string' ? candidate : undefined
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** Concatenate the text blocks of an assistant content array into one string. */
function concatText(content: AnyBlock[] | string | undefined): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('')
}

export class StreamParser {
  private buffer = ''
  private readonly onEvent: (e: AgentEvent) => void

  constructor(onEvent: (e: AgentEvent) => void) {
    this.onEvent = onEvent
  }

  /** Feed a stdout chunk. Complete lines are parsed and emitted; the tail is buffered. */
  push(chunk: string | Buffer): void {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    let nl = this.buffer.indexOf('\n')
    while (nl !== -1) {
      const line = this.buffer.slice(0, nl)
      this.buffer = this.buffer.slice(nl + 1)
      this.handleLine(line)
      nl = this.buffer.indexOf('\n')
    }
  }

  /** Flush any buffered (unterminated) final line. Call on process exit. */
  end(): void {
    if (this.buffer.trim()) {
      this.handleLine(this.buffer)
    }
    this.buffer = ''
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let frame: AnyFrame
    try {
      frame = JSON.parse(trimmed) as AnyFrame
    } catch {
      // Not JSON (e.g. a stray log line) — ignore.
      return
    }
    try {
      this.route(frame)
    } catch {
      // Never let a malformed frame crash the stream.
    }
  }

  private route(frame: AnyFrame): void {
    switch (frame.type) {
      case 'system':
        if (frame.subtype === 'init') {
          this.onEvent({
            kind: 'session',
            sessionId: frame.session_id ?? '',
            model: frame.model ?? ''
          })
        }
        return

      case 'stream_event':
        this.routeStreamEvent(frame.event)
        return

      case 'assistant': {
        // Top-level assistant snapshot — concatenate its text blocks.
        const text = concatText(frame.message?.content)
        if (text) this.onEvent({ kind: 'assistant_message', text })
        return
      }

      case 'user': {
        // A user-role frame that carries tool_result blocks (the CLI echoes results here).
        const blocks = Array.isArray(frame.message?.content) ? frame.message?.content : []
        for (const b of blocks ?? []) {
          if (b && b.type === 'tool_result') {
            this.onEvent({
              kind: 'tool_result',
              id: b.tool_use_id ?? '',
              isError: b.is_error === true
            })
          }
        }
        return
      }

      case 'result':
        this.onEvent({
          kind: 'done',
          text: typeof frame.result === 'string' ? frame.result : '',
          costUsd: typeof frame.total_cost_usd === 'number' ? frame.total_cost_usd : undefined,
          isError: frame.is_error === true
        })
        return

      default:
        // Unknown top-level type — ignore.
        return
    }
  }

  private routeStreamEvent(event: AnyFrame['event']): void {
    if (!event) return
    switch (event.type) {
      case 'message_start':
        this.onEvent({ kind: 'turn_start' })
        return

      case 'content_block_start': {
        const block = event.content_block
        if (block && block.type === 'tool_use') {
          this.onEvent({
            kind: 'tool_start',
            id: block.id ?? '',
            name: block.name ?? '',
            label: toolLabel(block.name, block.input)
          })
        }
        return
      }

      case 'content_block_delta': {
        const delta = event.delta
        if (!delta) return
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          this.onEvent({ kind: 'assistant_delta', text: delta.text })
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          this.onEvent({ kind: 'thinking_delta', text: delta.thinking })
        }
        return
      }

      default:
        // message_delta / content_block_stop / message_stop / ping etc. — ignored.
        return
    }
  }
}
