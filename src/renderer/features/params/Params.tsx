import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Param } from '@shared/params'
import { useActiveProject, useStore } from '@/store/store'
import { cn } from '@/lib/cn'
import { ParamControl } from './ParamControl'

interface Group {
  name: string | null
  params: Param[]
}

function groupParams(params: Param[]): Group[] {
  const order: (string | null)[] = []
  const buckets = new Map<string | null, Param[]>()
  for (const p of params) {
    const key = p.group ?? null
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(p)
  }
  return order.map((name) => ({ name, params: buckets.get(name)! }))
}

export function Params(): JSX.Element {
  const project = useActiveProject()
  const params = useStore((s) => s.params)
  const units = useStore((s) => s.units)

  const groups = useMemo(() => groupParams(params?.params ?? []), [params])
  const title = project?.title?.toUpperCase() || 'PARAMETERS'
  const count = params?.params.length ?? 0

  return (
    <aside className="flex w-[288px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line/70 px-3">
        <span className="truncate font-mono text-2xs font-medium tracking-[0.14em] text-ink-dim">
          {title}
        </span>
        {count > 0 && (
          <span className="shrink-0 rounded-full bg-elevated px-1.5 py-0.5 font-mono text-2xs text-ink-mute">
            {count} · {units}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {count === 0 ? (
          <EmptyParams />
        ) : (
          <div className="py-1">
            {groups.map((g, i) => (
              <ParamGroup key={g.name ?? `__ungrouped_${i}`} group={g} defaultOpen />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function ParamGroup({ group, defaultOpen }: { group: Group; defaultOpen: boolean }): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const labelled = group.name != null

  return (
    <div className="border-b border-line/40 last:border-b-0">
      {labelled && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 px-3 pb-1 pt-2.5 text-left"
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 12 12"
            className={cn('shrink-0 text-ink-mute transition-transform', open ? 'rotate-90' : '')}
          >
            <path d="M4.5 3 8 6 4.5 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-2xs font-medium uppercase tracking-[0.16em] text-ink-mute">
            {group.name}
          </span>
          <span className="ml-auto font-mono text-2xs text-ink-mute/60">{group.params.length}</span>
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className={cn('divide-y divide-line/30', labelled ? 'pb-1' : 'pt-0.5')}>
              {group.params.map((p) => (
                <ParamControl key={p.name} param={p} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EmptyParams(): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-elevated">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-ink-mute">
          <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="7" cy="6" r="1.6" fill="currentColor" />
          <circle cx="13" cy="10" r="1.6" fill="currentColor" />
          <circle cx="6" cy="14" r="1.6" fill="currentColor" />
        </svg>
      </div>
      <p className="max-w-[200px] text-2xs leading-relaxed text-ink-mute">
        Parameters appear here once a model is built.
      </p>
    </div>
  )
}
