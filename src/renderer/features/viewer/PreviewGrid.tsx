import { useStore } from '@/store/store'
import { PreviewTile } from './PreviewTile'

/** Responsive grid of open preview panes. Empty when nothing is open. */
export function PreviewGrid(): JSX.Element {
  const openPreviews = useStore((s) => s.openPreviews)
  const n = openPreviews.length

  if (n === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-base">
        <p className="font-mono text-2xs uppercase tracking-widest text-ink-mute">
          Select a creation to preview
        </p>
      </div>
    )
  }

  const cols = n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : n <= 6 ? 3 : 4

  return (
    <div
      className="grid h-full w-full gap-2 bg-base p-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}
    >
      {openPreviews.map((id) => (
        <PreviewTile key={id} id={id} />
      ))}
    </div>
  )
}
