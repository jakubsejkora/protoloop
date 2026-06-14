import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '@/store/store'
import { cn } from '@/lib/cn'
import { Spinner } from '@/components/Spinner'

interface ComposerProps {
  canSend: boolean
  running: boolean
}

export function Composer({ canSend, running }: ComposerProps): JSX.Element {
  const sendMessage = useStore((s) => s.sendMessage)
  const abortActive = useStore((s) => s.abortActive)
  const newProject = useStore((s) => s.newProject)
  const hasProject = useStore((s) => s.activeId != null)

  const [text, setText] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the textarea up to a cap.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = `${Math.min(ta.scrollHeight, 168)}px`
  }, [text])

  const submit = async (): Promise<void> => {
    const value = text.trim()
    if (!value || !canSend) return
    setText('')
    if (!hasProject) await newProject()
    await sendMessage(value)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-panel px-3 pb-3 pt-2.5">
      <div
        className={cn(
          'group relative rounded-lg border bg-elevated transition-colors',
          'border-line focus-within:border-ink-mute'
        )}
      >
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Describe what you want to design…"
          spellCheck={false}
          className="block max-h-[168px] w-full resize-none bg-transparent px-3 py-2.5 text-xs leading-relaxed text-ink outline-none placeholder:text-ink-mute"
        />

        <div className="flex items-center justify-between px-2.5 pb-2 pt-0.5">
          <span className="select-none font-mono text-2xs text-ink-mute/70">
            <kbd className="text-ink-mute">Enter</kbd> send ·{' '}
            <kbd className="text-ink-mute">Shift+Enter</kbd> newline
          </span>

          <div className="flex items-center gap-1.5">
            <AnimatePresence>
              {running && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => void abortActive()}
                  className="flex h-6 items-center gap-1.5 rounded-md border border-line bg-base px-2 text-2xs text-ink-dim transition-colors hover:border-bad/50 hover:text-bad"
                >
                  <span className="h-2 w-2 rounded-[2px] bg-current" />
                  Stop
                </motion.button>
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!text.trim() || !canSend}
              title={canSend ? 'Send' : 'Run in progress'}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
                text.trim() && canSend
                  ? 'bg-amber text-base hover:bg-amber-bright'
                  : 'cursor-not-allowed bg-hover text-ink-mute/60'
              )}
            >
              {running ? (
                <Spinner size={11} className="text-base" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 11.5v-9M3 6 7 2.5 11 6"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
