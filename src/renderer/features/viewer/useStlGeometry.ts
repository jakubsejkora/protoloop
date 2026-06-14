import { useEffect, useRef, useState } from 'react'
import { Box3, BufferGeometry, Vector3 } from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

export interface StlGeometryInfo {
  /** Parsed geometry, rested on the plate (bottom at Z=0, centred in X/Y). null while empty. */
  geometry: BufferGeometry | null
  /** Bounding-box size in model units (size.z = height above the plate). */
  size: Vector3
  /** Bounding-sphere radius — used to clamp orbit zoom + scale the grid. */
  radius: number
  /** True the first frame a brand-new model becomes available (drives the materialize tween). */
  isFresh: boolean
}

const sharedLoader = new STLLoader()

/**
 * Parses binary STL bytes into a centered BufferGeometry.
 *
 * - Re-parses only when `version` changes (a new render), never on unrelated re-renders.
 * - Centers the mesh at the origin so OrbitControls rotates around its middle.
 * - Disposes the previously parsed geometry to avoid leaking GPU buffers.
 * - Keeps the CAD faceting (flat look) — only computes vertex normals if missing.
 */
export function useStlGeometry(bytes: ArrayBuffer | null, version: number): StlGeometryInfo {
  const [info, setInfo] = useState<StlGeometryInfo>(() => ({
    geometry: null,
    size: new Vector3(),
    radius: 1,
    isFresh: false
  }))

  // Hold the live geometry in a ref so cleanup can dispose the exact instance
  // we created, independent of React state timing.
  const currentRef = useRef<BufferGeometry | null>(null)

  useEffect(() => {
    if (!bytes || bytes.byteLength === 0) {
      if (currentRef.current) {
        currentRef.current.dispose()
        currentRef.current = null
      }
      setInfo({ geometry: null, size: new Vector3(), radius: 1, isFresh: false })
      return
    }

    let geometry: BufferGeometry
    try {
      // STLLoader mutates a copy of the buffer view internally; parse() expects
      // the ArrayBuffer directly (we deliberately do NOT fetch a URL).
      geometry = sharedLoader.parse(bytes)
    } catch (err) {
      // Corrupt / truncated STL — fall back to empty rather than crash the scene.
      console.error('[viewer] failed to parse STL', err)
      if (currentRef.current) {
        currentRef.current.dispose()
        currentRef.current = null
      }
      setInfo({ geometry: null, size: new Vector3(), radius: 1, isFresh: false })
      return
    }

    // Some STLs (ASCII without normals) need normals for shading.
    if (!geometry.getAttribute('normal')) {
      geometry.computeVertexNormals()
    }

    // Rest the object ON the build plate: centre it in X/Y but put its bottom
    // (min Z — model space is Z-up) at Z=0, so it sits on the grid instead of
    // being bisected by it. ModelMesh's Z-up→Y-up rotation then places the base
    // on the floor (three-Y=0) with the object rising above it.
    geometry.computeBoundingBox()
    const box = geometry.boundingBox ?? new Box3()
    const center = new Vector3()
    box.getCenter(center)
    geometry.translate(-center.x, -center.y, -box.min.z)

    // Recompute bounds now that we have moved it, then derive size + radius.
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const size = new Vector3()
    geometry.boundingBox?.getSize(size)
    const radius = geometry.boundingSphere?.radius ?? Math.max(size.x, size.y, size.z, 1) * 0.5

    // Dispose the previous geometry only after the new one is ready.
    const previous = currentRef.current
    currentRef.current = geometry
    if (previous && previous !== geometry) previous.dispose()

    setInfo({ geometry, size, radius: radius || 1, isFresh: true })
    // Re-parse keyed on version; bytes identity is incidental.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, bytes])

  // Dispose on unmount.
  useEffect(() => {
    return () => {
      if (currentRef.current) {
        currentRef.current.dispose()
        currentRef.current = null
      }
    }
  }, [])

  return info
}
