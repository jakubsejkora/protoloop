/**
 * Deterministic SVG placeholder for projects without a rendered thumbnail.
 * Hashes the project id into a geometric motif (cube / hex / gear / icosahedron)
 * with hash-derived colours, rotation and sides, on the viewer background (#16181c)
 * so every sidebar row reads as a distinct little "part".
 */

const BG = '#16181c'

// Muted, dark-CAD palette. Picks are deterministic per id.
const PALETTE = [
  '#3a4046',
  '#454c54',
  '#2f4858',
  '#3d4b3e',
  '#4a4036',
  '#3a3550',
  '#52463a',
  '#36474f',
  '#4a3f47',
  '#404a4a'
]

/** Fast, stable 32-bit string hash (FNV-1a style). */
function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic PRNG seeded from the id hash (mulberry32). */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Motif = 'cube' | 'hex' | 'gear' | 'ico'
const MOTIFS: Motif[] = ['cube', 'hex', 'gear', 'ico']

function polygonPoints(cx: number, cy: number, r: number, sides: number, rot: number): string {
  const pts: string[] = []
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`)
  }
  return pts.join(' ')
}

function gearPath(cx: number, cy: number, r: number, teeth: number, rot: number): string {
  const inner = r * 0.74
  const tipW = 0.34 // fraction of a tooth slot that is the tooth tip
  const pts: string[] = []
  for (let i = 0; i < teeth; i++) {
    const a0 = rot + (i / teeth) * Math.PI * 2
    const a1 = a0 + ((1 - tipW) / 2 / teeth) * Math.PI * 2
    const a2 = a0 + ((1 + tipW) / 2 / teeth) * Math.PI * 2
    const a3 = a0 + (1 / teeth) * Math.PI * 2
    pts.push(`${(cx + Math.cos(a0) * inner).toFixed(2)},${(cy + Math.sin(a0) * inner).toFixed(2)}`)
    pts.push(`${(cx + Math.cos(a1) * r).toFixed(2)},${(cy + Math.sin(a1) * r).toFixed(2)}`)
    pts.push(`${(cx + Math.cos(a2) * r).toFixed(2)},${(cy + Math.sin(a2) * r).toFixed(2)}`)
    pts.push(`${(cx + Math.cos(a3) * inner).toFixed(2)},${(cy + Math.sin(a3) * inner).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
}

export interface SeededThumbProps {
  id: string
  size?: number
  className?: string
}

/** A small deterministic SVG icon derived from `id`. */
export function SeededThumb({ id, size = 44, className }: SeededThumbProps): JSX.Element {
  const seed = hash32(id)
  const rng = makeRng(seed)
  const motif = MOTIFS[seed % MOTIFS.length]
  const stroke = PALETTE[Math.floor(rng() * PALETTE.length)]
  const fill = PALETTE[Math.floor(rng() * PALETTE.length)]
  const rot = rng() * Math.PI * 2
  const cx = 22
  const cy = 22
  const r = 13.5

  let body: JSX.Element

  if (motif === 'gear') {
    const teeth = 7 + (seed % 5)
    body = (
      <g>
        <path d={gearPath(cx, cy, r, teeth, rot)} fill={fill} stroke={stroke} strokeWidth={1.1} />
        <circle cx={cx} cy={cy} r={r * 0.32} fill={BG} stroke={stroke} strokeWidth={1.1} />
      </g>
    )
  } else if (motif === 'hex') {
    body = (
      <g>
        <polygon
          points={polygonPoints(cx, cy, r, 6, rot)}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.2}
        />
        <polygon
          points={polygonPoints(cx, cy, r * 0.58, 6, rot)}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
          opacity={0.7}
        />
      </g>
    )
  } else if (motif === 'ico') {
    // simple isometric icosahedron silhouette: outer hexagon + radial spokes
    const outer = polygonPoints(cx, cy, r, 6, rot)
    const inner = 6
    const spokes: JSX.Element[] = []
    for (let i = 0; i < inner; i++) {
      const a = rot + (i / inner) * Math.PI * 2
      spokes.push(
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={(cx + Math.cos(a) * r).toFixed(2)}
          y2={(cy + Math.sin(a) * r).toFixed(2)}
          stroke={stroke}
          strokeWidth={0.9}
          opacity={0.85}
        />
      )
    }
    body = (
      <g>
        <polygon points={outer} fill={fill} stroke={stroke} strokeWidth={1.2} />
        {spokes}
      </g>
    )
  } else {
    // cube — isometric three-face box
    const s = r * 0.92
    const top = `${cx},${cy - s} ${cx + s},${cy - s * 0.5} ${cx},${cy} ${cx - s},${cy - s * 0.5}`
    const left = `${cx - s},${cy - s * 0.5} ${cx},${cy} ${cx},${cy + s} ${cx - s},${cy + s * 0.5}`
    const right = `${cx + s},${cy - s * 0.5} ${cx},${cy} ${cx},${cy + s} ${cx + s},${cy + s * 0.5}`
    body = (
      <g stroke={stroke} strokeWidth={1.1} strokeLinejoin="round">
        <polygon points={right} fill={fill} opacity={0.55} />
        <polygon points={left} fill={fill} opacity={0.8} />
        <polygon points={top} fill={fill} />
      </g>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <rect width="44" height="44" rx="6" fill={BG} />
      {body}
    </svg>
  )
}
