import { useEffect, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BufferGeometry, Group, MeshStandardMaterial } from 'three'

interface ModelMeshProps {
  geometry: BufferGeometry
  /** Bumps whenever a new model is parsed — triggers the materialize tween. */
  freshKey: number
  /** Bounding-box max dimension, used to decide whether to re-fit the camera. */
  sizeMax: number
  /** Forwarded surface picks for the measure tool (already in world space upstream). */
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void
  /** Crosshair affordance while measuring. */
  measuring?: boolean
}

// Re-fit the camera only when the model's footprint changes by more than this
// fraction, so nudging a slider by a millimetre doesn't yank the view around.
const REFIT_THRESHOLD = 0.02

/**
 * The model itself: a Z-up→Y-up group containing the flat-shaded mesh.
 *
 * On a fresh geometry it (a) asks <Bounds> to re-frame the camera when the size
 * changed meaningfully and (b) runs a short opacity + scale "materialize" tween.
 */
export default function ModelMesh({
  geometry,
  freshKey,
  sizeMax,
  onPointerDown,
  onPointerUp,
  measuring
}: ModelMeshProps) {
  const groupRef = useRef<Group>(null)
  const materialRef = useRef<MeshStandardMaterial>(null)

  // Tween state lives in a ref so it never causes a React re-render per frame.
  const tween = useRef({ t: 0, active: false })
  const lastSizeMax = useRef(0)

  useEffect(() => {
    if (!geometry) return

    // Materialize on a brand-new model or a meaningful size change — but not on
    // tiny slider nudges (camera re-framing is handled by FramePlate in the scene).
    const prev = lastSizeMax.current
    const changedMeaningfully = prev === 0 || Math.abs(sizeMax - prev) / Math.max(prev, 1e-6) > REFIT_THRESHOLD
    lastSizeMax.current = sizeMax
    if (changedMeaningfully) {
      tween.current = { t: 0, active: true }
      if (materialRef.current) {
        materialRef.current.transparent = true
        materialRef.current.opacity = 0
      }
      if (groupRef.current) groupRef.current.scale.setScalar(0.96)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshKey])

  useFrame((_, delta) => {
    if (!tween.current.active) return
    // ~350ms tween (1 / 0.35 ≈ 2.857 per second).
    tween.current.t = Math.min(1, tween.current.t + delta / 0.35)
    const t = tween.current.t
    // easeOutCubic for a premium settle.
    const eased = 1 - Math.pow(1 - t, 3)

    if (materialRef.current) materialRef.current.opacity = eased
    if (groupRef.current) groupRef.current.scale.setScalar(0.96 + 0.04 * eased)

    if (t >= 1) {
      tween.current.active = false
      // Restore opaque rendering once fully materialized so depth sorting is exact.
      if (materialRef.current) {
        materialRef.current.opacity = 1
        materialRef.current.transparent = false
      }
      if (groupRef.current) groupRef.current.scale.setScalar(1)
    }
  })

  return (
    // OpenSCAD/CAD is Z-up; three is Y-up. Rotate the whole group so the model
    // sits flat on the floor grid. No non-uniform scale anywhere → 1 unit = 1 mm.
    <group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        // Crosshair only over the model while measuring.
        onPointerOver={measuring ? () => (document.body.style.cursor = 'crosshair') : undefined}
        onPointerOut={measuring ? () => (document.body.style.cursor = 'auto') : undefined}
      >
        <meshStandardMaterial
          ref={materialRef}
          color="#c8ccd0"
          roughness={0.62}
          metalness={0.1}
          flatShading
        />
      </mesh>
    </group>
  )
}
