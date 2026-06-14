import type { ProtoloopApi } from '@shared/ipc'

declare global {
  interface Window {
    protoloop: ProtoloopApi
  }
}

export {}
