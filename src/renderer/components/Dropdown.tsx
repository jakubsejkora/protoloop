import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useClickOutside } from '@/lib/useClickOutside'

export interface DropdownOption<T extends string> {
  value: T
  label: string
  hint?: string
  disabled?: boolean
}

export interface DropdownProps<T extends string> {
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  /** Right-align the popover to the trigger's right edge. */
  align?: 'left' | 'right'
  /** Optional small caption shown before the selected label in the trigger. */
  caption?: string
  className?: string
  menuClassName?: string
  title?: string
}

const CHEVRON = (
  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-70">
    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

/** Dense, anchored select used across the chat control bar and params. */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  disabled,
  align = 'left',
  caption,
  className,
  menuClassName,
  title
}: DropdownProps<T>): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-6 w-full items-center gap-1.5 rounded-[5px] border px-2 text-2xs transition-colors',
          open ? 'border-line bg-hover text-ink' : 'border-line/70 bg-elevated text-ink-dim',
          disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-line hover:text-ink'
        )}
      >
        {caption && <span className="text-ink-mute">{caption}</span>}
        <span className="truncate font-medium">{selected?.label ?? value}</span>
        <span className="ml-auto flex">{CHEVRON}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute z-50 mt-1 min-w-[148px] overflow-hidden rounded-md border border-line bg-elevated p-1 shadow-xl shadow-black/40',
              align === 'right' ? 'right-0' : 'left-0',
              menuClassName
            )}
          >
            {options.map((opt) => {
              const active = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    if (opt.disabled) return
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors',
                    opt.disabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-hover',
                    active && 'bg-hover'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-xs',
                        active ? 'font-medium text-amber-bright' : 'text-ink'
                      )}
                    >
                      {opt.label}
                    </span>
                    {active && (
                      <svg width="11" height="11" viewBox="0 0 12 12" className="ml-auto text-amber">
                        <path
                          d="M2.5 6.5L5 9L9.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    )}
                  </span>
                  {opt.hint && <span className="text-2xs leading-snug text-ink-mute">{opt.hint}</span>}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A generic anchored popover wrapper used for custom menus (export, row actions). */
export function Popover({
  open,
  onClose,
  children,
  align = 'right',
  className
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose, open)
  return (
    <div ref={ref} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute z-50 mt-1 overflow-hidden rounded-md border border-line bg-elevated p-1 shadow-xl shadow-black/40',
              align === 'right' ? 'right-0' : 'left-0',
              className
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
