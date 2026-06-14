import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function quantize(v: number, min: number, step: number): number {
  if (!(step > 0)) return v
  const snapped = min + Math.round((v - min) / step) * step
  // kill float noise (e.g. 2.5000000004)
  return Math.round(snapped * 1e6) / 1e6
}

/**
 * Custom drag slider — pointer-driven for snappy, precise control without
 * relying on un-themable native range styling. Click-to-set + drag + keyboard.
 */
export function Slider({
  value,
  min,
  max,
  step = 0,
  onChange,
  disabled,
  className
}: SliderProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const span = max - min || 1
  const pct = clamp(((value - min) / span) * 100, 0, 100)

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current
      if (!el) return value
      const rect = el.getBoundingClientRect()
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
      const raw = min + ratio * span
      return clamp(quantize(raw, min, step), min, max)
    },
    [min, max, span, step, value]
  )

  const onPointerDown = (e: React.PointerEvent): void => {
    if (disabled) return
    e.preventDefault()
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    onChange(valueFromClientX(e.clientX))
  }

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent): void => onChange(valueFromClientX(e.clientX))
    const up = (): void => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging, onChange, valueFromClientX])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (disabled) return
    const inc = step > 0 ? step : span / 100
    let next = value
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + inc
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - inc
    else if (e.key === 'Home') next = min
    else if (e.key === 'End') next = max
    else return
    e.preventDefault()
    onChange(clamp(quantize(next, min, step), min, max))
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative flex h-4 cursor-pointer items-center outline-none',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      {/* track */}
      <div className="relative h-[3px] w-full rounded-full bg-line">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-amber/70 group-focus-visible:bg-amber"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* thumb */}
      <div
        className={cn(
          'pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber bg-base transition-transform',
          dragging ? 'scale-110 border-amber-bright' : 'group-hover:scale-110',
          'group-focus-visible:ring-2 group-focus-visible:ring-amber/30'
        )}
        style={{ left: `${pct}%` }}
      />
    </div>
  )
}
