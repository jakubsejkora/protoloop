import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { BuildPhase, BuildState } from '@shared/types'

interface BuildProgressBarProps {
  buildState: BuildState
}

const PHASE_DOT: Record<BuildPhase, string> = {
  idle: '#5b616b',
  planning: '#7aa2ff',
  writing: '#7aa2ff',
  rendering: '#4a9eff',
  done: '#54d18c',
  error: '#ff5d5d'
}

const TRACK = '#1c1f25'
const SWEEP = 'linear-gradient(90deg, transparent 0%, #4a9eff 45%, #6fb4ff 55%, transparent 100%)'
// Barber-pole stripes for indeterminate "thinking" phases.
const BARBER =
  'repeating-linear-gradient(115deg, #3b6fd0 0 10px, #2e58a8 10px 20px)'

/**
 * Bottom-anchored build status: a 3px progress track plus a small status row
 * (phase dot + label). Indeterminate phases animate a barber-pole; `rendering`
 * can show a real `pct`; `done` fills to 100% then fades; `error` goes red.
 *
 * Hidden entirely when idle (nothing is building).
 */
export default function BuildProgressBar({ buildState }: BuildProgressBarProps) {
  const { phase, label, indeterminate, pct, errorText } = buildState

  // After `done`, keep the bar up ~1s (full), then fade it out.
  const [showDone, setShowDone] = useState(false)
  useEffect(() => {
    if (phase === 'done') {
      setShowDone(true)
      const id = setTimeout(() => setShowDone(false), 1000)
      return () => clearTimeout(id)
    }
    setShowDone(false)
  }, [phase])

  const visible = phase !== 'idle' && (phase !== 'done' || showDone)

  const isIndeterminate = (phase === 'planning' || phase === 'writing' || phase === 'rendering') && (indeterminate || pct == null)
  const determinatePct = phase === 'done' ? 100 : Math.max(0, Math.min(100, pct ?? 0))
  const isError = phase === 'error'

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 select-none">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="flex flex-col gap-1.5 px-4 pb-3 pt-6"
          >
            {/* Status row */}
            <div className="flex items-center gap-2 text-[11px] text-[#9aa0aa]">
              <motion.span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: isError ? PHASE_DOT.error : PHASE_DOT[phase] }}
                animate={
                  isIndeterminate
                    ? { opacity: [0.4, 1, 0.4], scale: [0.85, 1, 0.85] }
                    : { opacity: 1, scale: 1 }
                }
                transition={
                  isIndeterminate
                    ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.2 }
                }
              />
              <span className={isError ? 'text-[#ff8d8d]' : undefined}>
                {isError ? errorText || label || 'Build failed' : label || phase}
              </span>
              {!isIndeterminate && !isError && pct != null && (
                <span className="ml-auto tabular-nums text-[#6c727c]">{Math.round(determinatePct)}%</span>
              )}
            </div>

            {/* 3px track */}
            <div
              className="relative h-[3px] w-full overflow-hidden rounded-full"
              style={{ backgroundColor: TRACK }}
            >
              {isError ? (
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: PHASE_DOT.error }}
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              ) : isIndeterminate ? (
                <>
                  {/* Barber-pole base that drifts */}
                  <motion.div
                    className="absolute inset-y-0 -left-1/2 w-[200%] opacity-40"
                    style={{ backgroundImage: BARBER, backgroundSize: '28px 28px' }}
                    animate={{ backgroundPositionX: ['0px', '28px'] }}
                    transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
                  />
                  {/* Brighter sweep highlight */}
                  <motion.div
                    className="absolute inset-y-0 w-1/2 rounded-full"
                    style={{ backgroundImage: SWEEP }}
                    animate={{ x: ['-60%', '220%'] }}
                    transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </>
              ) : (
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: PHASE_DOT[phase] === PHASE_DOT.idle ? '#4a9eff' : PHASE_DOT[phase] }}
                  initial={false}
                  animate={{ width: `${determinatePct}%` }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
