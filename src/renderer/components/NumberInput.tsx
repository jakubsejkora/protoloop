import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

export interface NumberInputProps {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  integer?: boolean
  className?: string
  align?: 'left' | 'right'
}

function clamp(v: number, min?: number, max?: number): number {
  if (typeof min === 'number') v = Math.max(min, v)
  if (typeof max === 'number') v = Math.min(max, v)
  return v
}

/** Editable numeric field that only commits on blur / Enter, with clamping. */
export function NumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  integer,
  className,
  align = 'right'
}: NumberInputProps): JSX.Element {
  const [draft, setDraft] = useState(String(value))

  // Keep in sync when the external value changes and we're not mid-edit.
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = (): void => {
    const parsed = Number(draft)
    if (Number.isNaN(parsed)) {
      setDraft(String(value))
      return
    }
    let next = clamp(parsed, min, max)
    if (integer) next = Math.round(next)
    next = Math.round(next * 1e6) / 1e6
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(String(value))
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={cn(
        'h-6 rounded border border-line/70 bg-base px-1.5 font-mono text-2xs text-ink outline-none transition-colors focus:border-amber/60',
        align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    />
  )
}
