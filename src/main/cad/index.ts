/**
 * Public surface of the CAD render layer.
 *  - createEngineLayer: electron-free four-engine render layer (implements EngineLayer)
 *  - registerCadIpc: wires the artifacts IPC channels (imports electron)
 */
export { createEngineLayer } from './engineLayer'
export type { EngineLayerConfig } from './engineLayer'
export { registerCadIpc } from './cadIpc'
