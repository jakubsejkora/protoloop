import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '@/store/store'
import { ProjectRow } from './ProjectRow'

function PlusIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function Sidebar(): JSX.Element {
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeId)
  const newProject = useStore((s) => s.newProject)

  return (
    <aside className="flex w-[212px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line/70 pl-3 pr-2">
        <span className="font-mono text-2xs font-medium tracking-[0.18em] text-ink-mute">
          CREATIONS
        </span>
        <button
          type="button"
          onClick={() => void newProject()}
          title="New creation"
          className="flex h-6 items-center gap-1 rounded px-1.5 text-2xs text-ink-dim transition-colors hover:bg-hover hover:text-amber-bright"
        >
          <PlusIcon />
          <span className="font-medium">New</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {projects.length === 0 ? (
          <div className="px-3 pt-8 text-center">
            <p className="text-2xs leading-relaxed text-ink-mute">
              No creations yet.
              <br />
              Start one to begin designing.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {projects.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <ProjectRow project={p} active={p.id === activeId} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </aside>
  )
}
