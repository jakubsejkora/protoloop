import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { BuildState } from '@shared/types'
import { useStlGeometry } from './useStlGeometry'
import Lighting from './Lighting'
import ModelMesh from './ModelMesh'
import MeasureLayer, { type MeasurePair } from './MeasureLayer'
import BuildProgressBar from './BuildProgressBar'

export interface ModelViewerProps {
  stlBytes: ArrayBuffer | null
  units?: string
  stlVersion: number
  measureActive: boolean
  buildState: BuildState
  registerSnapshot?: (fn: () => string | null) => void
}

const BG = '#16181c'
// A pick counts as a click (not an orbit-drag) only if the pointer barely moved.
const CLICK_DRAG_PX = 4

/** Registers a snapshot callback that reads the live framebuffer as a PNG. */
function SnapshotBridge({ register }: { register?: (fn: () => string | null) => void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!register) return
    register(() => {
      try {
        // preserveDrawingBuffer:true on the Canvas keeps the last frame readable.
        return gl.domElement.toDataURL('image/png')
      } catch (err) {
        console.error('[viewer] snapshot failed', err)
        return null
      }
    })
    return () => register(() => null)
  }, [gl, register])
  return null
}

/**
 * Frames the part sitting ON the build plate and pivots the orbit around its BASE
 * (the plate contact at the origin) — a turntable feel. Re-frames only on a new
 * model or a meaningful size change, so dragging a slider never yanks the view.
 */
function FramePlate({ radius, height, version }: { radius: number; height: number; version: number }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const lastRadius = useRef(0)

  useEffect(() => {
    if (!controls || radius <= 0) return
    const prev = lastRadius.current
    const changed = prev === 0 || Math.abs(radius - prev) / Math.max(prev, 1e-6) > 0.02
    if (!changed) return
    lastRadius.current = radius

    // Defer a tick so the new geometry is mounted before we measure/frame.
    const id = requestAnimationFrame(() => {
      // Pivot at the base on the plate ("under both plates").
      controls.target.set(0, 0, 0)
      // Fit a sphere of radius (height/2 + radius), centred on the base, into the
      // vertical FOV with margin, so the whole part is visible resting on the plate.
      const reff = height / 2 + radius
      const fov = ((camera as { fov?: number }).fov ?? 50) * (Math.PI / 180)
      const dist = (reff / Math.sin(fov / 2)) * 1.15
      const dir = new Vector3(0.62, 0.58, 1).normalize()
      camera.position.copy(dir.multiplyScalar(dist))
      camera.near = Math.max(dist / 200, 0.01)
      camera.far = dist * 12
      ;(camera as { updateProjectionMatrix: () => void }).updateProjectionMatrix()
      controls.update()
    })
    return () => cancelAnimationFrame(id)
  }, [version, radius, height, controls, camera])

  return null
}

interface SceneContentsProps {
  bytes: ArrayBuffer | null
  version: number
  measureActive: boolean
  units: string
  pairs: MeasurePair[]
  onSurfaceDown: (e: ThreeEvent<PointerEvent>) => void
  onSurfaceUp: (e: ThreeEvent<PointerEvent>) => void
  onControlsRef: (c: OrbitControlsImpl | null) => void
}

/** Everything inside the <Canvas>: model, lights, grid, shadows, controls. */
function SceneContents({
  bytes,
  version,
  measureActive,
  units,
  pairs,
  onSurfaceDown,
  onSurfaceUp,
  onControlsRef
}: SceneContentsProps) {
  const { geometry, size, radius } = useStlGeometry(bytes, version)
  const sizeMax = Math.max(size.x, size.y, size.z, 0.001)

  // Derive view-dependent scales from the model's bounding sphere.
  const gridFade = Math.max(20, radius * 14)
  const gridCell = Math.max(1, Math.round(radius / 5))
  const markerRadius = Math.max(0.4, radius * 0.018)
  const shadowScale = Math.max(8, radius * 4)
  const minDist = Math.max(radius * 0.4, 0.1)
  const maxDist = Math.max(radius * 14, 50)

  return (
    <>
      <PerspectiveCamera makeDefault fov={50} position={[radius * 2.2, radius * 1.6, radius * 2.6]} />

      <Lighting />

      {/* Frame the part on the plate and pivot the orbit around its base. */}
      <FramePlate radius={radius} height={size.z} version={version} />
      {geometry && (
        <ModelMesh
          geometry={geometry}
          freshKey={version}
          sizeMax={sizeMax}
          measuring={measureActive}
          onPointerDown={onSurfaceDown}
          onPointerUp={onSurfaceUp}
        />
      )}

      {/* Additive measure overlays sit in world space, outside the model group. */}
      {measureActive && pairs.length > 0 && (
        <MeasureLayer pairs={pairs} markerRadius={markerRadius} units={units} />
      )}

      {/* Floor: a soft contact shadow under the part and an infinite technical grid. */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.4}
        scale={shadowScale}
        blur={2.2}
        far={Math.max(radius * 2, 10)}
        resolution={1024}
        color="#000000"
        frames={1}
      />
      <Grid
        position={[0, -0.001, 0]}
        infiniteGrid
        cellSize={gridCell}
        sectionSize={gridCell * 5}
        cellColor="#23262c"
        sectionColor="#33373f"
        cellThickness={0.6}
        sectionThickness={1}
        fadeDistance={gridFade}
        fadeStrength={1.5}
        followCamera={false}
      />

      <OrbitControls
        ref={onControlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, 0, 0]}
        zoomToCursor
        minDistance={minDist}
        maxDistance={maxDist}
        // Orbiting is the default drag; measuring still orbits and we detect taps.
        enablePan
      />
    </>
  )
}

/** Faint hint + wireframe motif shown when there is nothing to display. */
function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 text-center">
      <svg
        width="92"
        height="92"
        viewBox="0 0 92 92"
        fill="none"
        className="opacity-[0.14]"
        aria-hidden
      >
        {/* Isometric wireframe cube motif */}
        <path
          d="M46 8 84 30v32L46 84 8 62V30L46 8Z"
          stroke="#c8ccd0"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M46 8v32M46 40 8 30M46 40l38-10M46 40v44" stroke="#c8ccd0" strokeWidth="1.2" />
      </svg>
      <div className="space-y-1">
        <p className="text-[13px] font-medium tracking-wide text-[#7c828c]">
          Describe a part to generate a model
        </p>
        <p className="text-[11px] text-[#565b64]">Your 3D preview will appear here</p>
      </div>
    </div>
  )
}

/**
 * Presentational, props-only model viewer. No store, no IPC — every input is a
 * prop and the only output is the optional snapshot callback.
 */
export default function ModelViewer({
  stlBytes,
  units = 'mm',
  stlVersion,
  measureActive,
  buildState,
  registerSnapshot
}: ModelViewerProps) {
  const [pairs, setPairs] = useState<MeasurePair[]>([])
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  // Pointer down bookkeeping for click-vs-drag discrimination.
  const downRef = useRef<{ x: number; y: number; point: Vector3 } | null>(null)

  const isBuilding = buildState.phase !== 'idle' && buildState.phase !== 'done'
  const showEmpty = !stlBytes && !isBuilding

  // Clear measurements whenever the tool is switched off.
  useEffect(() => {
    if (!measureActive) {
      setPairs([])
      downRef.current = null
    }
  }, [measureActive])

  // Reset measurements when a new model loads (old points no longer apply).
  useEffect(() => {
    setPairs([])
  }, [stlVersion])

  const onSurfaceDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!measureActive) return
      // Record where we touched the surface and the screen position to compare on up.
      downRef.current = {
        x: e.nativeEvent.clientX,
        y: e.nativeEvent.clientY,
        point: e.point.clone()
      }
    },
    [measureActive]
  )

  const onSurfaceUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!measureActive) return
      const down = downRef.current
      downRef.current = null
      if (!down) return

      const dx = e.nativeEvent.clientX - down.x
      const dy = e.nativeEvent.clientY - down.y
      // Moved too far → that was an orbit, not a pick.
      if (Math.hypot(dx, dy) >= CLICK_DRAG_PX) return

      // Use the down-point (where the press landed on the surface) for stability.
      const picked = down.point

      setPairs((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.b) {
          // Start a new pair (1st click, or 3rd click after a finished pair).
          return [...prev, { a: picked, b: null }]
        }
        // Close the current pair (2nd click).
        const next = prev.slice(0, -1)
        return [...next, { a: last.a, b: picked }]
      })
    },
    [measureActive]
  )

  const clearMeasurements = useCallback(() => {
    setPairs([])
    downRef.current = null
  }, [])

  const handleControlsRef = useCallback((c: OrbitControlsImpl | null) => {
    controlsRef.current = c
  }, [])

  const hasPoints = pairs.length > 0

  // Radial vignette over the charcoal base for depth against the #0c0d0f column.
  const vignette = useMemo(
    () => ({
      background: `radial-gradient(120% 120% at 50% 35%, ${BG} 55%, #101216 78%, #0c0d0f 100%)`
    }),
    []
  )

  return (
    <div className="relative h-full w-full overflow-hidden" style={vignette}>
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        dpr={[1, 2]}
        shadows
        // Transparent clear so the CSS vignette shows through behind the scene.
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        style={{ cursor: measureActive ? 'crosshair' : 'default' }}
      >
        <SnapshotBridge register={registerSnapshot} />
        <SceneContents
          bytes={stlBytes}
          version={stlVersion}
          measureActive={measureActive}
          units={units}
          pairs={pairs}
          onSurfaceDown={onSurfaceDown}
          onSurfaceUp={onSurfaceUp}
          onControlsRef={handleControlsRef}
        />
      </Canvas>

      {showEmpty && <EmptyState />}

      {/* Clear measurements — only while measuring and points exist. */}
      {measureActive && hasPoints && (
        <button
          type="button"
          onClick={clearMeasurements}
          className="absolute right-3 top-3 z-30 rounded-md border border-white/10 bg-[#1c1f25]/90 px-2.5 py-1 text-[11px] font-medium text-[#cdd2da] shadow-lg shadow-black/40 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-[#23262c] hover:text-white"
        >
          Clear
        </button>
      )}

      <BuildProgressBar buildState={buildState} />
    </div>
  )
}
