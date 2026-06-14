import type { EffortLevel, EngineId, RunStatus } from '@shared/types'
import { ENGINES } from '@shared/types'

/** Fallback app version when settings doesn't carry one. */
export const APP_VERSION = '0.1.0'

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  max: 'Max'
}

export function effortLabel(e: EffortLevel): string {
  return EFFORT_LABELS[e] ?? e
}

export function engineLabel(id: EngineId): string {
  return ENGINES.find((e) => e.id === id)?.label ?? id
}

/** Status dot colour class + whether it pulses. `null` = no dot. */
export function statusDot(status: RunStatus): { className: string; pulse: boolean } | null {
  switch (status) {
    case 'running':
    case 'queued':
      return { className: 'bg-amber', pulse: true }
    case 'done':
      return { className: 'bg-good', pulse: false }
    case 'error':
      return { className: 'bg-bad', pulse: false }
    default:
      return null
  }
}

/** Format a USD cost compactly, e.g. $0.0123. */
export function formatCost(usd?: number): string | null {
  if (usd == null || usd <= 0) return null
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}
