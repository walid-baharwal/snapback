/** Types shared between the main and renderer processes. */

export type ScopeType = 'global' | 'folder' | 'glob'

export type CaptureMode = 'code' | 'docs' | 'everything'

/** Time-based retention policy for a scope. */
export interface RetentionRules {
  /** Within this many days, keep every snapshot. */
  keepAllDays: number
  /** Between keepAllDays and dailyDays, thin to one per hour. */
  hourlyDays: number
  /** Between hourlyDays and weeklyDays, thin to one per day. */
  dailyDays: number
  /** Between weeklyDays and maxAgeDays, thin to one per week. */
  weeklyDays: number
  /** Hard delete snapshots older than this many days. 0 = never. */
  maxAgeDays: number
  /** Hard cap on total bytes for this scope's snapshots. 0 = unlimited. */
  maxBytes: number
  /** Hard cap on number of snapshots per file. 0 = unlimited. */
  maxVersionsPerFile: number
}

/** Filter rules controlling what gets captured. */
export interface FilterRules {
  captureMode: CaptureMode
  includeGlobs: string[]
  excludeGlobs: string[]
  respectGitignore: boolean
  skipBinaries: boolean
  excludeSecrets: boolean
  maxFileSizeBytes: number
}

/** Trigger configuration. */
export interface TriggerRules {
  debounceMs: number
  onAnyChange: boolean
}

/** Security / safety rules. */
export interface SecurityRules {
  encrypt: boolean
}

/** Complete rules for a scope. */
export interface ScopeRules {
  filters: FilterRules
  triggers: TriggerRules
  retention: RetentionRules
  security: SecurityRules
}

export interface Scope {
  id: number
  type: ScopeType
  pathOrPattern: string
  parentId: number | null
  rules: ScopeRules
  enabled: boolean
  name: string
}

export type FileStatus = 'active' | 'deleted'

export interface FileRow {
  path: string
  currentBlobHash: string | null
  lastSeenTs: number
  status: FileStatus
}

export type SnapshotEvent = 'create' | 'modify' | 'delete' | 'rename'

export interface Snapshot {
  id: number
  filePath: string
  blobHash: string | null
  ts: number
  event: SnapshotEvent
  size: number
  lines: number
  words: number
  chars: number
  encrypted: boolean
}

export type DaemonStatus =
  | { state: 'running'; pausedReason: null }
  | { state: 'paused'; pausedReason: 'user' | 'battery' | 'startup' }
  | { state: 'stopped'; pausedReason: null }
  | { state: 'warming'; pausedReason: null }

export interface DaemonInfo {
  status: DaemonStatus
  watchedScopes: number
  snapshotCount: number
  totalBytes: number
  startedAt: number | null
}

export interface AppPreferences {
  setupComplete: boolean
  pauseOnBattery: boolean
  autostart: boolean
  storageLocation: string
  defaultMode: 'folders' | 'machine' | null
}

export interface DryRunEstimate {
  matchedFiles: number
  estimatedBytesPerWeek: number
  scannedFiles: number
}

export interface TimelineEntry {
  snapshotId: number
  ts: number
  filePath: string
  event: SnapshotEvent
  size: number
  lines: number
  words: number
  chars: number
  encrypted: boolean
}

export interface DayTimeline {
  date: string
  totalEvents: number
  entries: TimelineEntry[]
}

export interface FileVersion {
  snapshotId: number
  ts: number
  event: SnapshotEvent
  size: number
  lines: number
  words: number
  chars: number
  encrypted: boolean
}

export interface StorageStats {
  scopeId: number | null
  scopeName: string
  bytes: number
  fileCount: number
  snapshotCount: number
}

/** Defaults for a freshly-created scope, varied per preset. */
export type ScopePreset = 'code' | 'documents' | 'everything'

export interface IpcSurface {
  setup: {
    getPreferences(): Promise<AppPreferences>
    complete(mode: 'folders' | 'machine', folders: { path: string; preset: ScopePreset }[]): Promise<void>
    updatePreferences(patch: Partial<AppPreferences>): Promise<AppPreferences>
  }
  daemon: {
    getInfo(): Promise<DaemonInfo>
    pause(reason: 'user' | 'battery'): Promise<void>
    resume(): Promise<void>
  }
  scopes: {
    list(): Promise<Scope[]>
    add(
      type: ScopeType,
      pathOrPattern: string,
      preset: ScopePreset,
      parentId: number | null
    ): Promise<Scope>
    update(id: number, partialRules: Partial<ScopeRules>, name?: string): Promise<Scope>
    remove(id: number): Promise<void>
    dryRun(pathOrPattern: string, preset: ScopePreset): Promise<DryRunEstimate>
    resolved(path: string): Promise<ScopeRules | null>
  }
  timeline: {
    day(dateIso: string): Promise<DayTimeline>
    days(fromIso: string, toIso: string): Promise<{ date: string; count: number }[]>
  }
  files: {
    versions(path: string, limit?: number): Promise<FileVersion[]>
    readVersion(snapshotId: number): Promise<{ content: string; isBinary: boolean }>
    current(path: string): Promise<{ content: string; isBinary: boolean; exists: boolean }>
    restore(snapshotId: number, targetPath?: string): Promise<{ restoredTo: string }>
    search(query: string, includeDeleted: boolean, limit?: number): Promise<FileRow[]>
    deleted(limit?: number): Promise<FileRow[]>
  }
  storage: {
    stats(): Promise<StorageStats[]>
    runPruneNow(): Promise<{ deletedSnapshots: number; freedBytes: number }>
  }
  picker: {
    chooseFolder(): Promise<string | null>
  }
}
