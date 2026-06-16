import type { DaemonStatus, IpcSurface } from '@shared/types'

declare global {
  interface Window {
    api: IpcSurface & {
      events: {
        onSnapshot(fn: (info: { filePath: string; event: string; snapshotId: number }) => void): () => void
        onStatusChanged(fn: (status: DaemonStatus) => void): () => void
      }
    }
  }
}

export {}
