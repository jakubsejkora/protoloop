/**
 * Dark-technical lighting rig.
 *
 * Hemisphere fills the shadows with a cool ground bounce, a warm-neutral key
 * comes from the upper-front-right, and a dim rim behind separates the model
 * from the charcoal background. Intensities are tuned for the #c8ccd0 material.
 */
export default function Lighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#2a2e35', 0.55]} />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.05}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-5, 3, -6]} intensity={0.35} color="#aab4c4" />
      <ambientLight intensity={0.12} />
    </>
  )
}
