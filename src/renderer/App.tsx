import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '@/store/store'
import { Header } from '@/features/header/Header'
import { StatusBar } from '@/features/header/StatusBar'
import { Sidebar } from '@/features/sidebar/Sidebar'
import { Chat } from '@/features/chat/Chat'
import { Params } from '@/features/params/Params'
import { PreviewGrid } from '@/features/viewer/PreviewGrid'
import { SettingsModal } from '@/features/settings/SettingsModal'

export default function App(): JSX.Element {
  const init = useStore((s) => s.init)

  // Boot the store exactly once.
  useEffect(() => {
    void useStore.getState().init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init])

  const ready = useStore((s) => s.ready)
  const hasProjects = useStore((s) => s.projects.length > 0)

  return (
    <div className="flex h-full w-full flex-col bg-base text-ink">
      <Header />

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        {ready && !hasProjects ? <FirstRun /> : <Workspace />}
      </div>

      <StatusBar />
      <SettingsModal />
    </div>
  )
}

/** The four working columns once at least one project exists. */
function Workspace(): JSX.Element {
  return (
    <>
      <Chat />
      <main className="relative min-w-0 flex-1 bg-base">
        <PreviewGrid />
      </main>
      <Params />
    </>
  )
}

/** Centered call-to-action shown when there are no creations yet. */
function FirstRun(): JSX.Element {
  const newProject = useStore((s) => s.newProject)

  return (
    <main className="flex min-w-0 flex-1 items-center justify-center bg-base">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex max-w-[360px] flex-col items-center text-center"
      >
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-panel">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-amber/80">
            <path
              d="M12 2.5 20.5 7.2v9.6L12 21.5 3.5 16.8V7.2L12 2.5Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path d="M3.5 7.2 12 12m0 9.5V12m8.5-4.8L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-base font-medium text-ink">Design parametric parts by chatting</h1>
        <p className="mt-2 text-xs leading-relaxed text-ink-dim">
          Describe a part in plain language. Claude plans it, writes parametric CAD source, and
          renders a live 3D model you can measure, tune and export.
        </p>
        <button
          type="button"
          onClick={() => void newProject()}
          className="mt-6 flex h-9 items-center gap-2 rounded-lg bg-amber px-4 text-xs font-medium text-base transition-colors hover:bg-amber-bright"
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          New creation
        </button>
        <p className="mt-3 font-mono text-2xs text-ink-mute">or press the + in the sidebar</p>
      </motion.div>
    </main>
  )
}
