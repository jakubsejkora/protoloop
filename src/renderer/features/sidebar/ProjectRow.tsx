import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { ProjectMeta } from '@shared/types'
import { modelById } from '@shared/types'
import { useStore } from '@/store/store'
import { cn } from '@/lib/cn'
import { engineLabel, statusDot } from '@/lib/format'
import { SeededThumb } from '@/lib/seededThumb'
import { Popover } from '@/components/Dropdown'

interface ProjectRowProps {
  project: ProjectMeta
  active: boolean
}

export function ProjectRow({ project: p, active }: ProjectRowProps): JSX.Element {
  const selectProject = useStore((s) => s.selectProject)
  const renameProject = useStore((s) => s.renameProject)
  const deleteProject = useStore((s) => s.deleteProject)

  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [draft, setDraft] = useState(p.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(p.title)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [editing, p.title])

  const dot = statusDot(p.status)
  const subtitle = `${modelById(p.model).label} · ${p.mode === 'direct' ? 'Direct' : engineLabel(p.engine)}`
  const thumbSrc = p.hasModel && p.thumbnail ? `protoloop-file://${p.id}/${p.thumbnail}` : null

  const commitRename = (): void => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== p.title) void renameProject(p.id, next)
  }

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer items-center gap-2.5 rounded-md py-2 pl-2.5 pr-1.5 transition-colors',
        active ? 'bg-hover' : 'hover:bg-elevated/70'
      )}
      onClick={() => {
        if (!editing && !active) void selectProject(p.id)
      }}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-accent"
          className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-amber"
          transition={{ type: 'spring', stiffness: 600, damping: 40 }}
        />
      )}

      {/* Thumbnail */}
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-line/80 bg-[#16181c]">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <SeededThumb id={p.id} size={44} />
        )}
      </div>

      {/* Title + subtitle */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="w-full rounded border border-amber/50 bg-base px-1 py-0.5 text-xs text-ink outline-none"
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-ink">{p.title || 'Untitled'}</span>
            {dot && (
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  dot.className,
                  dot.pulse && 'animate-pulse'
                )}
              />
            )}
          </div>
        )}
        <div className="mt-0.5 truncate text-2xs text-ink-mute">{subtitle}</div>
      </div>

      {/* Hover ⋯ menu */}
      {!editing && (
        <div
          className={cn(
            'relative shrink-0 transition-opacity',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="More"
            onClick={() => {
              setConfirmDel(false)
              setMenuOpen((o) => !o)
            }}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded text-ink-mute transition-colors hover:bg-base hover:text-ink',
              menuOpen && 'bg-base text-ink'
            )}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="3.2" cy="8" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="12.8" cy="8" r="1.3" />
            </svg>
          </button>
          <Popover
            open={menuOpen}
            onClose={() => {
              setMenuOpen(false)
              setConfirmDel(false)
            }}
            className="min-w-[150px]"
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setEditing(true)
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-ink transition-colors hover:bg-hover"
            >
              Rename
            </button>
            {confirmDel ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmDel(false)
                  void deleteProject(p.id)
                }}
                className="flex w-full items-center gap-2 rounded bg-bad/10 px-2.5 py-1.5 text-left text-xs text-bad transition-colors hover:bg-bad/20"
              >
                Confirm delete
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-ink-dim transition-colors hover:bg-hover hover:text-bad"
              >
                Delete
              </button>
            )}
          </Popover>
        </div>
      )}
    </div>
  )
}
