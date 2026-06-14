import { cn } from '@/lib/cn'

/** Minimal 1px ring spinner that inherits currentColor. */
export function Spinner({ className, size = 12 }: { className?: string; size?: number }): JSX.Element {
  return (
    <span
      className={cn('inline-block animate-spin rounded-full border-current', className)}
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(1, Math.round(size / 8)),
        borderTopColor: 'transparent'
      }}
      aria-hidden="true"
    />
  )
}
