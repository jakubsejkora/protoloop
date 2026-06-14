import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@shared/types'
import type { ChatState, ToolTick } from '@/store/store'
import { cn } from '@/lib/cn'
import { formatCost } from '@/lib/format'
import { Spinner } from '@/components/Spinner'
import { PlanningCard } from './PlanningCard'

interface MessageListProps {
  chat: ChatState | null
  projectTitle: string
}

export function MessageList({ chat, projectTitle }: MessageListProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const messages = chat?.messages ?? []
  const streaming = chat?.streaming ?? ''
  const ticker = chat?.toolTicker ?? []
  const running = chat?.status === 'running'

  // Auto-scroll to bottom whenever content grows (only if already near bottom).
  const lastLen = useRef(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    const grew = messages.length + streaming.length + ticker.length !== lastLen.current
    lastLen.current = messages.length + streaming.length + ticker.length
    if (nearBottom && grew) bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, streaming, ticker.length])

  const empty = messages.length === 0 && !streaming && ticker.length === 0

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5">
      {empty ? (
        <EmptyChat projectTitle={projectTitle} />
      ) : (
        <div className="flex flex-col gap-3.5">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {streaming && <StreamingBubble text={streaming} />}

          {ticker.length > 0 && <ToolTicker ticks={ticker} running={running && !streaming} />}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

function EmptyChat({ projectTitle }: { projectTitle: string }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-elevated">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-amber/80">
          <path
            d="M12 3 21 7.5v9L12 21 3 16.5v-9L12 3Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M3 7.5 12 12l9-4.5M12 12v9" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink-dim">{projectTitle || 'New creation'}</p>
      <p className="mt-1.5 max-w-[230px] text-xs leading-relaxed text-ink-mute">
        Describe the part you want to design. Claude will plan it, write parametric source, and
        render a 3D model.
      </p>
    </div>
  )
}

function MessageBubble({ message: m }: { message: ChatMessage }): JSX.Element {
  if (m.kind === 'error') {
    return (
      <div className="rounded-md border border-bad/30 bg-bad/[0.07] px-3 py-2">
        <div className="mb-0.5 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-bad">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1.5 11 10.5H1L6 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M6 5v2.2M6 8.8v.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Error
        </div>
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-bad/90">{m.text}</p>
      </div>
    )
  }

  if (m.kind === 'questions') {
    return <PlanningCard message={m} />
  }

  if (m.role === 'user') {
    return (
      <div className="flex justify-end pl-7">
        <div className="rounded-lg rounded-br-sm bg-elevated px-3 py-2 text-xs leading-relaxed text-ink ring-1 ring-inset ring-line/60">
          <p className="whitespace-pre-wrap break-words">{m.text}</p>
        </div>
      </div>
    )
  }

  // assistant plain text
  const cost = formatCost(m.costUsd)
  return (
    <div className="pr-5">
      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-dim">{m.text}</p>
      {cost && <span className="mt-1 inline-block font-mono text-2xs text-ink-mute/70">{cost}</span>}
    </div>
  )
}

function StreamingBubble({ text }: { text: string }): JSX.Element {
  return (
    <div className="pr-5">
      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-dim">
        {text}
        <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse rounded-full bg-amber/80" />
      </p>
    </div>
  )
}

function ToolTicker({ ticks, running }: { ticks: ToolTick[]; running: boolean }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line/60 bg-elevated/50 px-2.5 py-2">
      {ticks.map((t) => (
        <div key={t.id} className="flex items-center gap-2 text-2xs">
          <span className="flex h-3 w-3 shrink-0 items-center justify-center">
            {t.error ? (
              <svg width="11" height="11" viewBox="0 0 12 12" className="text-bad">
                <path
                  d="M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            ) : t.done ? (
              <svg width="11" height="11" viewBox="0 0 12 12" className="text-good">
                <path
                  d="M2.5 6.2 5 8.7l4.5-5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            ) : (
              <Spinner size={10} className="text-amber" />
            )}
          </span>
          <span
            className={cn(
              'truncate font-mono',
              t.error ? 'text-bad/80' : t.done ? 'text-ink-mute' : 'text-ink-dim'
            )}
          >
            {t.label}
          </span>
        </div>
      ))}
      {running && ticks.every((t) => t.done) && (
        <div className="flex items-center gap-2 text-2xs">
          <Spinner size={10} className="text-amber" />
          <span className="font-mono text-ink-dim">Thinking…</span>
        </div>
      )}
    </div>
  )
}
