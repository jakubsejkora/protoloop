/**
 * Public surface of the agent slice: the SessionManager factory and the IPC registrar.
 * The IPC router imports these to wire chat handling into the AppContext.
 */
export { createSessionManager } from './SessionManager'
export type { SessionManagerDeps } from './SessionManager'
export { registerAgentIpc } from './agentIpc'
