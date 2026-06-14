import { Fragment } from 'react'
import { Html, Line } from '@react-three/drei'
import { Vector3 } from 'three'

const MARKER_COLOR = '#4a9eff'
const LINE_COLOR = '#4a9eff'

/** A finished or in-progress measurement pair. `b` is null until the 2nd pick. */
export interface MeasurePair {
  a: Vector3
  b: Vector3 | null
}

interface MeasureLayerProps {
  pairs: MeasurePair[]
  /** Marker radius in world units — scaled to the model so it reads on any size. */
  markerRadius: number
  units: string
}

function format(distance: number, units: string): string {
  // Two decimals reads cleanly for mm-scale parts without looking noisy.
  return `${distance.toFixed(2)} ${units}`
}

/**
 * In-scene overlays for the measure tool: point markers, the A→B line, and a
 * midpoint distance pill. Purely additive — it never touches the model material.
 *
 * NOTE: this lives OUTSIDE the Z-up model group, so points captured from
 * `e.point` (already world-space) render at the correct location.
 */
export default function MeasureLayer({ pairs, markerRadius, units }: MeasureLayerProps) {
  return (
    <group>
      {pairs.map((pair, i) => {
        const { a, b } = pair
        const distance = b ? a.distanceTo(b) : 0
        const mid = b ? a.clone().add(b).multiplyScalar(0.5) : null

        return (
          <Fragment key={i}>
            <mesh position={a}>
              <sphereGeometry args={[markerRadius, 20, 20]} />
              <meshBasicMaterial color={MARKER_COLOR} toneMapped={false} />
            </mesh>

            {b && (
              <mesh position={b}>
                <sphereGeometry args={[markerRadius, 20, 20]} />
                <meshBasicMaterial color={MARKER_COLOR} toneMapped={false} />
              </mesh>
            )}

            {b && (
              <Line
                points={[
                  [a.x, a.y, a.z],
                  [b.x, b.y, b.z]
                ]}
                color={LINE_COLOR}
                lineWidth={2}
                dashed={false}
                transparent
                opacity={0.95}
              />
            )}

            {b && mid && (
              <Html center position={[mid.x, mid.y, mid.z]} zIndexRange={[20, 0]}>
                <div className="pointer-events-none select-none whitespace-nowrap rounded-full border border-[#4a9eff]/40 bg-[#0c0d0f]/85 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[#cfe3ff] shadow-lg shadow-black/40 backdrop-blur-sm">
                  {format(distance, units)}
                </div>
              </Html>
            )}
          </Fragment>
        )
      })}
    </group>
  )
}
