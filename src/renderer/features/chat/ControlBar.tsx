import type { ProjectMeta } from '@shared/types'
import { ENGINES, MODELS, modelById, modelSupportsEffort } from '@shared/types'
import { useStore } from '@/store/store'
import { cn } from '@/lib/cn'
import { effortLabel } from '@/lib/format'
import { Dropdown } from '@/components/Dropdown'

interface ControlBarProps {
  project: ProjectMeta
}

/**
 * Compact picker row that edits the active project's generation config. Once the
 * project's first prompt has been sent it LOCKS (model/effort/engine/mode can no
 * longer change), so the configuration can't drift mid-build.
 */
export function ControlBar({ project: p }: ControlBarProps): JSX.Element {
  const updateConfig = useStore((s) => s.updateConfig)
  const started = useStore((s) => s.chats[p.id]?.started ?? false)
  const locked = started || !!p.sessionId

  const efforts = modelById(p.model).efforts
  const showEffort = modelSupportsEffort(p.model)
  const lockTip = locked ? 'Locked — settings are fixed once the first prompt is sent' : undefined

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Model */}
      <Dropdown
        value={p.model}
        disabled={locked}
        onChange={(model) => void updateConfig(p.id, { model })}
        align="left"
        title={lockTip ?? 'Model'}
        className="min-w-[104px]"
        options={MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.blurb }))}
      />

      {/* Effort */}
      {showEffort && (
        <Dropdown
          value={p.effort}
          disabled={locked}
          onChange={(effort) => void updateConfig(p.id, { effort })}
          align="left"
          caption="Effort"
          title={lockTip ?? 'Reasoning effort'}
          className="min-w-[96px]"
          menuClassName="min-w-[120px]"
          options={efforts.map((e) => ({ value: e, label: effortLabel(e) }))}
        />
      )}

      <span className="mx-0.5 h-4 w-px bg-line/70" />

      {/* Mode toggle: CAD engine <-> Direct */}
      <div
        className={cn(
          'flex h-6 items-center rounded-[5px] border border-line/70 bg-elevated p-0.5',
          locked && 'opacity-60'
        )}
        title={lockTip}
      >
        <ModeButton
          active={p.mode === 'cad'}
          disabled={locked}
          label="CAD"
          title="Agent writes parametric CAD source and renders it"
          onClick={() => p.mode !== 'cad' && void updateConfig(p.id, { mode: 'cad' })}
        />
        <ModeButton
          active={p.mode === 'direct'}
          disabled={locked}
          label="Direct"
          title="Agent emits a mesh script directly"
          onClick={() => p.mode !== 'direct' && void updateConfig(p.id, { mode: 'direct' })}
        />
      </div>

      {/* Engine (only in CAD mode) */}
      {p.mode === 'cad' && (
        <Dropdown
          value={p.engine}
          disabled={locked}
          onChange={(engine) => void updateConfig(p.id, { engine })}
          align="left"
          title={lockTip ?? 'CAD engine'}
          className="min-w-[104px]"
          menuClassName="min-w-[230px]"
          options={ENGINES.map((e) => ({ value: e.id, label: e.label, hint: e.blurb }))}
        />
      )}

      {locked && (
        <span
          className="ml-auto flex items-center gap-1 text-ink-mute"
          title={lockTip}
          aria-label="Configuration locked"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <rect x="2.5" y="5.5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" />
            <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </span>
      )}
    </div>
  )
}

function ModeButton({
  active,
  disabled,
  label,
  title,
  onClick
}: {
  active: boolean
  disabled?: boolean
  label: string
  title: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-5 rounded-[3px] px-2 text-2xs font-medium transition-colors',
        active ? 'bg-hover text-ink shadow-sm' : 'text-ink-mute',
        !disabled && !active && 'hover:text-ink-dim',
        disabled && 'cursor-not-allowed'
      )}
    >
      {label}
    </button>
  )
}
