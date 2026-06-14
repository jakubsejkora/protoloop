import { useStore } from '@/store/store'
import { cn } from '@/lib/cn'
import { APP_VERSION } from '@/lib/format'
import { Spinner } from '@/components/Spinner'

const PHASE_TINT: Record<string, string> = {
  planning: 'text-amber',
  writing: 'text-amber',
  rendering: 'text-azure',
  done: 'text-good',
  error: 'text-bad'
}

export function StatusBar(): JSX.Element {
  const build = useStore((s) => (s.activeId ? s.chats[s.activeId]?.build ?? null : null))
  const running = useStore((s) => (s.activeId ? s.chats[s.activeId]?.status === 'running' : false))

  const active = build && build.phase !== 'idle' && build.label
  const tint = build ? PHASE_TINT[build.phase] ?? 'text-ink-dim' : 'text-ink-dim'
  const busy = !!build?.indeterminate && build.phase !== 'idle'

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-line bg-panel px-3 text-2xs">
      <div className="flex min-w-0 items-center gap-2">
        {busy && <Spinner size={9} className={tint} />}
        {!busy && active && (
          <span className={cn('h-1.5 w-1.5 rounded-full', build?.phase === 'error' ? 'bg-bad' : 'bg-good')} />
        )}
        <span className={cn('truncate', active ? tint : 'text-ink-mute')}>
          {active
            ? build?.label
            : running
              ? 'Working…'
              : 'Ready. Describe a part to start designing.'}
        </span>
        {build?.phase === 'error' && build.errorText && build.errorText !== build.label && (
          <span className="truncate text-ink-mute">— {build.errorText}</span>
        )}
      </div>
      <span className="shrink-0 font-mono text-2xs tracking-wide text-ink-mute">v{APP_VERSION}</span>
    </footer>
  )
}
