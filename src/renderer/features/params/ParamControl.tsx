import type { Param, ParamValue } from '@shared/params'
import { useStore } from '@/store/store'
import { cn } from '@/lib/cn'
import { Slider } from '@/components/Slider'
import { NumberInput } from '@/components/NumberInput'
import { Toggle } from '@/components/Toggle'
import { Dropdown } from '@/components/Dropdown'

interface ParamControlProps {
  param: Param
}

const VEC_AXES = ['X', 'Y', 'Z', 'W']

export function ParamControl({ param: p }: ParamControlProps): JSX.Element {
  const setParam = useStore((s) => s.setParam)
  const set = (value: ParamValue): void => setParam(p.name, value)

  return (
    <div className="px-3 py-2">
      {(p.type === 'number' || p.type === 'int') && (
        <NumericControl param={p} onChange={set} />
      )}

      {p.type === 'boolean' && (
        <div className="flex items-center justify-between gap-3">
          <Label param={p} />
          <Toggle
            checked={typeof p.value === 'boolean' ? p.value : false}
            onChange={(v) => set(v)}
            label={p.label}
          />
        </div>
      )}

      {p.type === 'string' && (
        <div className="flex flex-col gap-1.5">
          <Label param={p} />
          <input
            type="text"
            value={typeof p.value === 'string' ? p.value : ''}
            onChange={(e) => set(e.target.value)}
            spellCheck={false}
            className="h-7 w-full rounded border border-line/70 bg-base px-2 text-2xs text-ink outline-none transition-colors focus:border-amber/60"
          />
        </div>
      )}

      {p.type === 'enum' && (
        <div className="flex items-center justify-between gap-3">
          <Label param={p} />
          <Dropdown
            value={typeof p.value === 'string' ? p.value : (p.options?.[0] ?? '')}
            onChange={(v) => set(v)}
            align="right"
            className="min-w-[110px] max-w-[150px]"
            menuClassName="min-w-[130px]"
            options={(p.options ?? []).map((o) => ({ value: o, label: o }))}
          />
        </div>
      )}

      {p.type === 'vector' && <VectorControl param={p} onChange={set} />}
    </div>
  )
}

function Label({ param: p, suffix }: { param: Param; suffix?: string }): JSX.Element {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5" title={p.description ?? undefined}>
      <span className="truncate text-xs text-ink-dim">{p.label}</span>
      {suffix && <span className="font-mono text-2xs text-ink-mute">{suffix}</span>}
    </span>
  )
}

function NumericControl({
  param: p,
  onChange
}: {
  param: Param
  onChange: (v: number) => void
}): JSX.Element {
  const value = typeof p.value === 'number' ? p.value : 0
  const hasRange = typeof p.min === 'number' && typeof p.max === 'number'
  const step = typeof p.step === 'number' ? p.step : p.type === 'int' ? 1 : 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label param={p} />
        <span className="flex shrink-0 items-baseline gap-1">
          <NumberInput
            value={value}
            onCommit={onChange}
            min={p.min ?? undefined}
            max={p.max ?? undefined}
            step={step || undefined}
            integer={p.type === 'int'}
            className="w-16"
          />
          {p.unit && <span className="w-5 font-mono text-2xs text-ink-mute">{p.unit}</span>}
        </span>
      </div>
      {hasRange ? (
        <Slider
          value={value}
          min={p.min as number}
          max={p.max as number}
          step={step}
          onChange={onChange}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          <Stepper label="−" onClick={() => onChange(value - (step || 1))} />
          <div className="h-px flex-1 bg-line/60" />
          <Stepper label="+" onClick={() => onChange(value + (step || 1))} />
        </div>
      )}
    </div>
  )
}

function Stepper({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-5 w-5 items-center justify-center rounded border border-line/70 bg-base text-ink-dim transition-colors hover:border-ink-mute hover:text-ink"
    >
      <span className="text-xs leading-none">{label}</span>
    </button>
  )
}

function VectorControl({
  param: p,
  onChange
}: {
  param: Param
  onChange: (v: number[]) => void
}): JSX.Element {
  const vec = Array.isArray(p.value) ? p.value : []
  const step = typeof p.step === 'number' ? p.step : p.type === 'int' ? 1 : 0

  const setIndex = (i: number, v: number): void => {
    const next = vec.slice()
    next[i] = v
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label param={p} suffix={p.unit ?? undefined} />
      <div
        className={cn(
          'grid gap-1.5',
          vec.length >= 4 ? 'grid-cols-4' : vec.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
        )}
      >
        {vec.map((component, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="text-center font-mono text-2xs text-ink-mute">
              {VEC_AXES[i] ?? i + 1}
            </span>
            <NumberInput
              value={typeof component === 'number' ? component : 0}
              onCommit={(v) => setIndex(i, v)}
              min={p.min ?? undefined}
              max={p.max ?? undefined}
              step={step || undefined}
              integer={p.type === 'int'}
              align="left"
              className="w-full px-1 text-center"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
