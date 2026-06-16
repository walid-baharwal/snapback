import { contextBridge, ipcRenderer } from 'electron'
import { Channels } from '../shared/ipcChannels'
import type {
  AppPreferences,
  DaemonInfo,
  DaemonStatus,
  DryRunEstimate,
  FileRow,
  FileVersion,
  IpcSurface,
  Scope,
  ScopePreset,
  ScopeRules,
  ScopeType,
  StorageStats,
  TimelineEntry
} from '../shared/types'

const api: IpcSurface & {
  events: {
    onSnapshot(fn: (info: { filePath: string; event: string; snapshotId: number }) => void): () => void
    onStatusChanged(fn: (status: DaemonStatus) => void): () => void
  }
} = {
  setup: {
    getPreferences: () => ipcRenderer.invoke(Channels.setup.getPreferences) as Promise<AppPreferences>,
    complete: (mode, folders) => ipcRenderer.invoke(Channels.setup.complete, mode, folders),
    updatePreferences: (patch: Partial<AppPreferences>) =>
      ipcRenderer.invoke(Channels.setup.updatePreferences, patch) as Promise<AppPreferences>
  },
  daemon: {
    getInfo: () => ipcRenderer.invoke(Channels.daemon.getInfo) as Promise<DaemonInfo>,
    pause: (reason) => ipcRenderer.invoke(Channels.daemon.pause, reason),
    resume: () => ipcRenderer.invoke(Channels.daemon.resume)
  },
  scopes: {
    list: () => ipcRenderer.invoke(Channels.scopes.list) as Promise<Scope[]>,
    add: (type: ScopeType, pathOrPattern: string, preset: ScopePreset, parentId: number | null) =>
      ipcRenderer.invoke(Channels.scopes.add, type, pathOrPattern, preset, parentId) as Promise<Scope>,
    update: (id: number, partialRules: Partial<ScopeRules>, name?: string) =>
      ipcRenderer.invoke(Channels.scopes.update, id, partialRules, name) as Promise<Scope>,
    remove: (id: number) => ipcRenderer.invoke(Channels.scopes.remove, id),
    dryRun: (pathOrPattern: string, preset: ScopePreset) =>
      ipcRenderer.invoke(Channels.scopes.dryRun, pathOrPattern, preset) as Promise<DryRunEstimate>,
    resolved: (p: string) => ipcRenderer.invoke(Channels.scopes.resolved, p) as Promise<ScopeRules | null>
  },
  timeline: {
    day: (dateIso: string) =>
      ipcRenderer.invoke(Channels.timeline.day, dateIso) as Promise<{
        date: string
        totalEvents: number
        entries: TimelineEntry[]
      }>,
    days: (fromIso: string, toIso: string) =>
      ipcRenderer.invoke(Channels.timeline.days, fromIso, toIso) as Promise<{ date: string; count: number }[]>
  },
  files: {
    versions: (p: string, limit?: number) =>
      ipcRenderer.invoke(Channels.files.versions, p, limit) as Promise<FileVersion[]>,
    readVersion: (snapshotId: number) =>
      ipcRenderer.invoke(Channels.files.readVersion, snapshotId) as Promise<{
        content: string
        isBinary: boolean
      }>,
    current: (p: string) =>
      ipcRenderer.invoke(Channels.files.current, p) as Promise<{
        content: string
        isBinary: boolean
        exists: boolean
      }>,
    restore: (snapshotId: number, targetPath?: string) =>
      ipcRenderer.invoke(Channels.files.restore, snapshotId, targetPath) as Promise<{ restoredTo: string }>,
    search: (query: string, includeDeleted: boolean, limit?: number) =>
      ipcRenderer.invoke(Channels.files.search, query, includeDeleted, limit) as Promise<FileRow[]>,
    deleted: (limit?: number) => ipcRenderer.invoke(Channels.files.deleted, limit) as Promise<FileRow[]>
  },
  storage: {
    stats: () => ipcRenderer.invoke(Channels.storage.stats) as Promise<StorageStats[]>,
    runPruneNow: () =>
      ipcRenderer.invoke(Channels.storage.runPruneNow) as Promise<{
        deletedSnapshots: number
        freedBytes: number
      }>
  },
  picker: {
    chooseFolder: () => ipcRenderer.invoke(Channels.picker.chooseFolder) as Promise<string | null>
  },
  events: {
    onSnapshot(fn) {
      const wrap = (
        _e: Electron.IpcRendererEvent,
        info: { filePath: string; event: string; snapshotId: number }
      ): void => fn(info)
      ipcRenderer.on(Channels.events.snapshotCreated, wrap)
      return () => ipcRenderer.removeListener(Channels.events.snapshotCreated, wrap)
    },
    onStatusChanged(fn) {
      const wrap = (_e: Electron.IpcRendererEvent, status: DaemonStatus): void => fn(status)
      ipcRenderer.on(Channels.daemon.statusChanged, wrap)
      return () => ipcRenderer.removeListener(Channels.daemon.statusChanged, wrap)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
