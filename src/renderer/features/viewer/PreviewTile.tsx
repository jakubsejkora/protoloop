import { useStore } from '@/store/store'
import { cn } from '@/lib/cn'
import ModelViewer from './ModelViewer'
import type { BuildState } from '@shared/types'

const IDLE_BUILD: BuildState = { phase: 'idle', label: '', indeterminate: false }

/**
 * One closable preview pane bound to a project id. Reuses the props-only
 * <ModelViewer> (its own WebGL context). The focused pane drives the Parameters
 * panel + Measure; clicking a pane focuses it.
 */
export function PreviewTile({ id }: { id: string }): JSX.Element {
  const data = useStore((s) => s.previewData[id])
  const title = useStore(
    (s) => s.projects.find((p) => p.id === id)?.title || s.previewData[id]?.title || 'Untitled'
  )
  const focused = useStore((s) => s.activeId === id)
  const measureActive = useStore((s) => s.measureActive)
  const build = useStore((s) => s.chats[id]?.build ?? IDLE_BUILD)
  const focusPreview = useStore((s) => s.focusPreview)
  const closePreview = useStore((s) => s.closePreview)
  const registerSnapshot = useStore((s) => s.registerSnapshot)

  return (
    <div
      onPointerDownCapture={() => {
        if (!focused) void focusPreview(id)
      }}
      className={cn(
        'group relative h-full w-full overflow-hidden rounded-lg border transition-colors',
        focused ? 'border-amber/50 ring-1 ring-amber/20' : 'border-line'
      )}
    >
      {/* header overlay: title + close ✕ */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-black/50 to-transparent px-2.5 py-1.5">
        <span
          className={cn(
            'truncate font-mono text-2xs uppercase tracking-wider',
            focused ? 'text-amber/90' : 'text-ink-mute'
          )}
        >
          {title}
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            closePreview(id)
          }}
          className="pointer-events-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-mute opacity-0 transition-colors hover:bg-white/10 hover:text-ink group-hover:opacity-100"
          title="Close preview"
          aria-label="Close preview"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <ModelViewer
        stlBytes={data?.stlBytes ?? null}
        stlVersion={data?.stlVersion ?? 0}
        units={data?.units ?? 'mm'}
        measureActive={focused && measureActive}
        buildState={build}
        registerSnapshot={(fn) => registerSnapshot(id, fn)}
      />
    </div>
  )
}
