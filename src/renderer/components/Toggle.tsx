import { cn } from '@/lib/cn'

export interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
}

/** Compact switch used for boolean params and on/off settings. */
export function Toggle({ checked, onChange, disabled, label }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors duration-150',
        checked ? 'border-amber/60 bg-amber/30' : 'border-line bg-elevated',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-ink-mute'
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute h-3 w-3 rounded-full shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[15px] bg-amber-bright' : 'translate-x-[2px] bg-ink-mute'
        )}
      />
    </button>
  )
}
