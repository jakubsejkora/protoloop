/**
 * API agent backend. Uses the Anthropic SDK with a manual streaming tool loop.
 *
 * The agent AUTHORS files; the app renders. So the only tools are file authoring:
 *   write_source({ filename, contents })  → writes the engine source into workspaceDir
 *   write_params({ params })              → writes params.json into workspaceDir
 * There is deliberately NO render tool — Protoloop renders model.stl itself.
 *
 * Emits the same normalized AgentEvents as the CLI backend. Conversation history is
 * maintained across send() turns (planning answers, edits, auto-fix). Cost is derived
 * from token usage × per-model pricing (the SDK Usage object has no dollar field).
 *
 * Note: the installed SDK version predates `thinking:{type:'adaptive'}`,
 * `output_config.effort`, and the 4.x model IDs in its TYPES, but the wire API accepts
 * them — so those fields are attached to the request body through a narrow cast.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import type {
  MessageParam,
  RawMessageStreamEvent,
  Tool,
  TextBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam
} from '@anthropic-ai/sdk/resources/messages'

/** The content-block params we assemble for an assistant turn (text + tool_use). */
type AssistantContentParam = TextBlockParam | ToolUseBlockParam
import type { AgentEvent, EffortLevel, ModelId } from '@shared/types'
import { modelById, modelSupportsEffort } from '@shared/types'
import type { AgentBackend } from '../core/contracts'
import { toolLabel } from './StreamParser'

export interface ApiBackendDeps {
  apiKey: string
  workspaceDir: string
  model: ModelId
  effort: EffortLevel
  /** the system prompt (buildSystemPrompt output) */
  systemPrompt: string
  /** the engine's source filename (model.scad | model.js | model.py) */
  sourceFile: string
  firstMessage: string
}

/** Map our ModelId → the exact wire model string the API expects. */
const API_MODEL_ID: Record<ModelId, string> = {
  'claude-opus-4-8': 'claude-opus-4-8',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-haiku-4-5': 'claude-haiku-4-5'
}

/** Per-million-token pricing (USD): [input, output]. Used to compute costUsd from usage. */
const PRICING: Record<ModelId, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 }
}

const MAX_TOKENS = 16000
const MAX_TOOL_ITERATIONS = 24

const TOOLS: Tool[] = [
  {
    name: 'write_source',
    description:
      'Write the engine SOURCE file into the working directory. Call this with the full ' +
      'file contents whenever you create or revise the model. The app renders it automatically.',
    input_schema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'The source filename (e.g. model.scad, model.js, model.py).'
        },
        contents: { type: 'string', description: 'The complete source file contents.' }
      },
      required: ['filename', 'contents']
    }
  },
  {
    name: 'write_params',
    description:
      'Write params.json into the working directory. `params` is the full ParamsFile object ' +
      '(schemaVersion, engine, sourceFile, units, params[]). Every param name must match a real ' +
      'input of the model so sliders re-render it.',
    input_schema: {
      type: 'object',
      properties: {
        params: {
          type: 'object',
          description: 'The full params.json object.'
        }
      },
      required: ['params']
    }
  }
]

interface ToolUseAccum {
  id: string
  name: string
  json: string
}

export class ApiBackend implements AgentBackend {
  private readonly deps: ApiBackendDeps
  private readonly client: Anthropic
  private listener: ((e: AgentEvent) => void) | null = null
  private history: MessageParam[] = []
  private aborted = false
  private running = false

  constructor(deps: ApiBackendDeps) {
    this.deps = deps
    this.client = new Anthropic({ apiKey: deps.apiKey })
  }

  onEvent(cb: (e: AgentEvent) => void): void {
    this.listener = cb
  }

  private emit(e: AgentEvent): void {
    this.listener?.(e)
  }

  async start(): Promise<{ sessionId?: string }> {
    this.history = [{ role: 'user', content: this.deps.firstMessage }]
    // Run the turn in the background; events stream out via onEvent.
    void this.runTurn()
    return {}
  }

  async send(text: string): Promise<void> {
    this.aborted = false
    this.history.push({ role: 'user', content: text })
    void this.runTurn()
  }

  abort(): void {
    this.aborted = true
  }

  /** Drive one user turn through the streaming tool loop until the model stops calling tools. */
  private async runTurn(): Promise<void> {
    if (this.running) return
    this.running = true
    let totalCost = 0
    let lastText = ''
    let isError = false
    try {
      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        if (this.aborted) break
        const result = await this.streamOnce()
        totalCost += result.costUsd
        if (result.assistantText) lastText = result.assistantText

        // Persist the assistant turn (text + tool_use blocks) into history.
        this.history.push({ role: 'assistant', content: result.assistantContent })

        if (result.toolUses.length === 0) {
          // No tools requested — the turn is complete.
          break
        }

        // Execute each tool and feed results back as one user message.
        const toolResults: ToolResultBlockParam[] = []
        for (const use of result.toolUses) {
          this.emit({
            kind: 'tool_start',
            id: use.id,
            name: use.name,
            label: toolLabel(use.name, safeParse(use.json))
          })
          const exec = await this.execTool(use)
          this.emit({ kind: 'tool_result', id: use.id, isError: exec.isError })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: exec.message,
            is_error: exec.isError
          })
        }
        this.history.push({ role: 'user', content: toolResults })
      }
    } catch (err) {
      isError = true
      this.emit({ kind: 'error', message: errorMessage(err) })
    } finally {
      this.running = false
      this.emit({
        kind: 'done',
        text: lastText,
        costUsd: totalCost > 0 ? totalCost : undefined,
        isError
      })
    }
  }

  /**
   * Stream a single assistant message. Emits turn_start / assistant_delta / thinking_delta /
   * assistant_message and returns the assembled content + any tool_use requests + this call's cost.
   */
  private async streamOnce(): Promise<{
    assistantContent: AssistantContentParam[]
    assistantText: string
    toolUses: ToolUseAccum[]
    costUsd: number
  }> {
    const body = this.buildRequestBody()
    const stream = await this.client.messages.create(body)

    let text = ''
    const toolAccum = new Map<number, ToolUseAccum>()
    let inputTokens = 0
    let outputTokens = 0

    for await (const event of stream as AsyncIterable<RawMessageStreamEvent>) {
      if (this.aborted) break
      switch (event.type) {
        case 'message_start':
          this.emit({ kind: 'turn_start' })
          inputTokens += event.message.usage?.input_tokens ?? 0
          outputTokens += event.message.usage?.output_tokens ?? 0
          break
        case 'content_block_start': {
          const block = event.content_block as { type?: string; id?: string; name?: string }
          if (block.type === 'tool_use') {
            toolAccum.set(event.index, {
              id: block.id ?? '',
              name: block.name ?? '',
              json: ''
            })
          }
          break
        }
        case 'content_block_delta': {
          const delta = event.delta as {
            type?: string
            text?: string
            thinking?: string
            partial_json?: string
          }
          if (delta.type === 'text_delta' && delta.text) {
            text += delta.text
            this.emit({ kind: 'assistant_delta', text: delta.text })
          } else if (delta.type === 'thinking_delta' && delta.thinking) {
            this.emit({ kind: 'thinking_delta', text: delta.thinking })
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            const acc = toolAccum.get(event.index)
            if (acc) acc.json += delta.partial_json
          }
          break
        }
        case 'message_delta':
          outputTokens += event.usage?.output_tokens ?? 0
          break
        default:
          break
      }
    }

    if (text) this.emit({ kind: 'assistant_message', text })

    // Reassemble the assistant content array (text first, then tool_use blocks) for history.
    const assistantContent: AssistantContentParam[] = []
    if (text) assistantContent.push({ type: 'text', text })
    const toolUses = [...toolAccum.values()]
    for (const use of toolUses) {
      assistantContent.push({
        type: 'tool_use',
        id: use.id,
        name: use.name,
        input: safeParse(use.json) ?? {}
      })
    }

    const price = PRICING[this.deps.model]
    const costUsd = (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output

    return { assistantContent, assistantText: text, toolUses, costUsd }
  }

  /** Build the streaming request body, attaching adaptive thinking + effort via a narrow cast. */
  private buildRequestBody(): Anthropic.MessageCreateParamsStreaming {
    const base: Anthropic.MessageCreateParamsStreaming = {
      model: API_MODEL_ID[this.deps.model],
      max_tokens: MAX_TOKENS,
      stream: true,
      system: this.deps.systemPrompt,
      tools: TOOLS,
      messages: this.history
    }
    // Newer wire fields not present in this SDK version's request types.
    const extra = base as Anthropic.MessageCreateParamsStreaming & {
      thinking?: { type: 'adaptive' }
      output_config?: { effort: EffortLevel }
    }
    extra.thinking = { type: 'adaptive' }
    if (modelSupportsEffort(this.deps.model)) {
      extra.output_config = { effort: this.deps.effort }
    }
    return extra
  }

  /** Execute one authoring tool by writing the requested file into the workspace. */
  private async execTool(use: ToolUseAccum): Promise<{ isError: boolean; message: string }> {
    const input = safeParse(use.json)
    if (!input || typeof input !== 'object') {
      return { isError: true, message: 'Invalid tool input (could not parse JSON).' }
    }
    const o = input as Record<string, unknown>
    try {
      if (use.name === 'write_source') {
        const filename = typeof o.filename === 'string' ? o.filename : this.deps.sourceFile
        const contents = typeof o.contents === 'string' ? o.contents : ''
        const safeName = path.basename(filename)
        await fs.writeFile(path.join(this.deps.workspaceDir, safeName), contents, 'utf8')
        return { isError: false, message: `Wrote ${safeName} (${contents.length} bytes).` }
      }
      if (use.name === 'write_params') {
        const json = JSON.stringify(o.params ?? {}, null, 2)
        await fs.writeFile(path.join(this.deps.workspaceDir, 'params.json'), json, 'utf8')
        return { isError: false, message: 'Wrote params.json.' }
      }
      return { isError: true, message: `Unknown tool: ${use.name}` }
    } catch (err) {
      return { isError: true, message: `Failed to write file: ${errorMessage(err)}` }
    }
  }
}

function safeParse(json: string): unknown {
  if (!json) return undefined
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.status ?? ''} ${err.message}`.trim()
  if (err instanceof Error) return err.message
  return String(err)
}
