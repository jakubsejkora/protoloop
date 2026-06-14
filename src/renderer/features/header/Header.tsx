import { useState } from 'react'
import { useStore } from '@/store/store'
import { cn } from '@/lib/cn'
import { Popover } from '@/components/Dropdown'

function GearIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M8 1.4v1.7M8 12.9v1.7M3.34 3.34l1.2 1.2M11.46 11.46l1.2 1.2M1.4 8h1.7M12.9 8h1.7M3.34 12.66l1.2-1.2M11.46 4.54l1.2-1.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MeasureIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 10.5 10.5 2l3.5 3.5L5.5 14 2 10.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 8 6 9.5M6.5 6 8 7.5M8.5 4 10 5.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ExportIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.8v8.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M5 5 8 1.8 11 5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.8 9.5v3.2c0 .55.45 1 1 1h8.4c.55 0 1-.45 1-1V9.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Header(): JSX.Element {
  const measureActive = useStore((s) => s.measureActive)
  const toggleMeasure = useStore((s) => s.toggleMeasure)
  const openSettings = useStore((s) => s.openSettings)
  const exportModel = useStore((s) => s.exportModel)
  const hasModel = useStore((s) => {
    const id = s.activeId
    return !!id && !!s.previewData[id]?.stlBytes
  })

  const [exportOpen, setExportOpen] = useState(false)

  return (
    <header className="drag-region relative z-30 flex h-11 shrink-0 items-center justify-between border-b border-line bg-panel pl-20 pr-2.5">
      <div className="flex items-center gap-2.5">
        <span className="select-none font-mono text-[11px] font-medium tracking-[0.24em] text-ink-dim">
          PROTOLOOP
        </span>
        <span className="h-3.5 w-px bg-line" />
        <span className="font-mono text-2xs tracking-[0.18em] text-ink-mute">CAD STUDIO</span>
      </div>

      <div className="no-drag flex items-center gap-1">
        <button
          type="button"
          onClick={toggleMeasure}
          title="Toggle measurement mode"
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
            measureActive
              ? 'bg-azure/15 text-azure ring-1 ring-inset ring-azure/40'
              : 'text-ink-dim hover:bg-hover hover:text-ink'
          )}
        >
          <MeasureIcon />
          <span>Measure</span>
        </button>

        <div className="relative">
          <button
            type="button"
            disabled={!hasModel}
            onClick={() => setExportOpen((o) => !o)}
            title={hasModel ? 'Export model' : 'No model to export yet'}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
              hasModel
                ? 'text-ink-dim hover:bg-hover hover:text-ink'
                : 'cursor-not-allowed text-ink-mute/60'
            )}
          >
            <ExportIcon />
            <span>Export</span>
          </button>
          <Popover open={exportOpen} onClose={() => setExportOpen(false)} className="min-w-[150px]">
            <MenuItem
              label="Export as STL"
              sub="Triangle mesh"
              onClick={() => {
                setExportOpen(false)
                void exportModel('stl')
              }}
            />
            <MenuItem
              label="Export as STEP"
              sub="B-rep · CAD"
              onClick={() => {
                setExportOpen(false)
                void exportModel('step')
              }}
            />
          </Popover>
        </div>

        <span className="mx-0.5 h-4 w-px bg-line" />

        <button
          type="button"
          onClick={openSettings}
          title="Settings"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-dim transition-colors hover:bg-hover hover:text-ink"
        >
          <GearIcon />
        </button>
      </div>
    </header>
  )
}

function MenuItem({
  label,
  sub,
  onClick
}: {
  label: string
  sub?: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-0.5 rounded px-2.5 py-1.5 text-left transition-colors hover:bg-hover"
    >
      <span className="text-xs text-ink">{label}</span>
      {sub && <span className="text-2xs text-ink-mute">{sub}</span>}
    </button>
  )
}
