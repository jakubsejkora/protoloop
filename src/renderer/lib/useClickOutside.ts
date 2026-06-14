import { useEffect, type RefObject } from 'react'

/** Calls `onOutside` when a pointerdown lands outside `ref` (and on Escape). */
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  onOutside: () => void,
  active = true
): void {
  useEffect(() => {
    if (!active) return
    const onDown = (e: MouseEvent): void => {
      const el = ref.current
      if (el && !el.contains(e.target as Node)) onOutside()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOutside()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [ref, onOutside, active])
}
