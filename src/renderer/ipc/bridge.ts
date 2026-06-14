import type { ProtoloopApi } from '@shared/ipc'

/**
 * The single typed handle to the preload bridge. Every renderer module talks to
 * main through `api`, never through `window` directly.
 */
export const api: ProtoloopApi = window.protoloop
