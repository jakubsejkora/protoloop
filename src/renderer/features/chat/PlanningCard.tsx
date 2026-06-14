import { useMemo, useState } from 'react'
import type { ChatMessage, PlanningQuestion } from '@shared/types'
import { useStore } from '@/store/store'
import { cn } from '@/lib/cn'

/**
 * Interactive planning-questions card: each question shows tappable option chips
 * (multi-select) plus a custom write-in. Submitting composes a readable answer
 * and continues the same agent session, which then builds the model.
 */
export function PlanningCard({ message }: { message: ChatMessage }): JSX.Element {
  // Normalize defensively: tolerate either the structured shape or an older
  // string[] format that may exist in persisted chats.
  const questions: PlanningQuestion[] = (message.questions ?? []).map((q) =>
    typeof (q as unknown) === 'string'
      ? { question: q as unknown as string, options: [] }
      : { question: q.question ?? '', options: q.options ?? [] }
  )
  const answered = !!message.answered
  const activeId = useStore((s) => s.activeId)
  const submit = useStore((s) => s.submitPlanningAnswers)

  const [selected, setSelected] = useState<Record<number, Set<string>>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})

  const toggle = (qi: number, opt: string): void => {
    if (answered) return
    setSelected((prev) => {
      const set = new Set(prev[qi] ?? [])
      if (set.has(opt)) set.delete(opt)
      else set.add(opt)
      return { ...prev, [qi]: set }
    })
  }

  const anyAnswer = useMemo(
    () =>
      questions.some(
        (_, qi) => (selected[qi]?.size ?? 0) > 0 || (custom[qi]?.trim().length ?? 0) > 0
      ),
    [questions, selected, custom]
  )

  const onSubmit = (): void => {
    if (!activeId || answered) return
    const lines: string[] = []
    questions.forEach((q, qi) => {
      const picks = [...(selected[qi] ?? [])]
      const c = custom[qi]?.trim()
      if (c) picks.push(c)
      if (picks.length > 0) lines.push(`${qi + 1}. ${q.question} → ${picks.join(', ')}`)
    })
    const text = lines.length
      ? `Here are my answers:\n${lines.join('\n')}\n\nPlease build it now.`
      : 'Use sensible defaults and build it now.'
    void submit(activeId, text)
  }

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2.5',
        answered ? 'border-line bg-elevated/40' : 'border-amber/30 bg-amber/[0.06]'
      )}
    >
      <div
        className={cn(
          'mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider',
          answered ? 'text-ink-mute' : 'text-amber-bright'
        )}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.1" />
          <path
            d="M4.7 4.7a1.3 1.3 0 0 1 2.5.4c0 .9-1.2 1-1.2 1.8M6 8.5v.05"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
        Let&apos;s clarify
        {answered && (
          <span className="ml-auto normal-case tracking-normal text-good">Answered</span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {questions.map((q, qi) => (
          <QuestionRow
            key={qi}
            index={qi}
            q={q}
            selected={selected[qi]}
            custom={custom[qi] ?? ''}
            answered={answered}
            onToggle={(opt) => toggle(qi, opt)}
            onCustom={(v) => setCustom((p) => ({ ...p, [qi]: v }))}
          />
        ))}
      </div>

      {!answered && (
        <button
          type="button"
          onClick={onSubmit}
          className={cn(
            'mt-3 flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
            anyAnswer
              ? 'bg-amber text-base hover:bg-amber-bright'
              : 'border border-line bg-elevated text-ink-dim hover:bg-hover'
          )}
        >
          {anyAnswer ? 'Build it' : 'Build with defaults'}
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  )
}

function QuestionRow({
  index,
  q,
  selected,
  custom,
  answered,
  onToggle,
  onCustom
}: {
  index: number
  q: PlanningQuestion
  selected: Set<string> | undefined
  custom: string
  answered: boolean
  onToggle: (opt: string) => void
  onCustom: (v: string) => void
}): JSX.Element {
  return (
    <div>
      <div className="mb-1.5 flex gap-2 text-xs leading-relaxed text-ink">
        <span className="mt-px shrink-0 font-mono text-2xs text-amber/70">{index + 1}.</span>
        <span>{q.question}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-5">
        {q.options.map((opt) => {
          const on = selected?.has(opt) ?? false
          return (
            <button
              key={opt}
              type="button"
              disabled={answered}
              onClick={() => onToggle(opt)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-2xs transition-colors',
                on
                  ? 'border-amber/60 bg-amber/15 text-amber-bright'
                  : 'border-line bg-elevated text-ink-dim hover:border-line-soft hover:text-ink',
                answered && 'opacity-60'
              )}
            >
              {opt}
            </button>
          )
        })}
        {!answered && (
          <input
            value={custom}
            onChange={(e) => onCustom(e.target.value)}
            placeholder="Other…"
            className="h-[26px] w-24 rounded-full border border-line bg-elevated px-2.5 text-2xs text-ink placeholder:text-ink-mute focus:border-amber/40 focus:outline-none"
          />
        )}
      </div>
    </div>
  )
}
