import { app, BrowserWindow, dialog, ipcMain, powerMonitor } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { Channels } from '@shared/ipcChannels'
import {
  defaultGlobalRules,
  getCommonExcludes,
  presetRules,
  wholeMachineExtraExcludes
} from '@shared/defaults'
import type {
  AppPreferences,
  DaemonInfo,
  DaemonStatus,
  DryRunEstimate,
  FileRow,
  FileVersion,
  Scope,
  ScopePreset,
  ScopeRules,
  ScopeType,
  StorageStats,
  TimelineEntry
} from '@shared/types'
import { getDb } from '../db/database'
import { ScopesRepo } from '../services/scopesRepo'
import { RulesEngine } from '../services/rulesEngine'
import { WatcherService } from '../services/watcher'
import { StorageEngine } from '../storage/storageEngine'
import { RetentionScheduler } from '../services/retention'
import { dryRun as runDryRun } from '../services/dryRun'
import { PreferencesStore } from '../services/preferences'
import { disableLinuxAutostart, enableLinuxAutostart } from '../services/linuxAutostart'

export interface DaemonContext {
  prefs: PreferencesStore
  scopesRepo: ScopesRepo
  rules: RulesEngine
  storage: StorageEngine
  watcher: WatcherService
  retention: RetentionScheduler
  startedAt: number
  status: DaemonStatus
  emitStatus: (status: DaemonStatus) => void
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

/**
 * Centralised autostart enable/disable across all platforms. On Linux we
 * write/remove an XDG autostart `.desktop` file because Electron's
 * `setLoginItemSettings` is a no-op there. On macOS and Windows the Electron
 * API works directly.
 */
export function syncAutostart(enable: boolean): void {
  if (process.platform === 'linux') {
    if (enable) enableLinuxAutostart()
    else disableLinuxAutostart()
    return
  }
  if (typeof app !== 'undefined' && app.setLoginItemSettings) {
    try {
      app.setLoginItemSettings({ openAtLogin: enable, openAsHidden: true })
    } catch {
      // platform may not support
    }
  }
}

function reload(ctx: DaemonContext): void {
  ctx.rules.setScopes(ctx.scopesRepo.list())
  ctx.emitStatus({ state: 'warming', pausedReason: null })
  void ctx.watcher
    .syncScopes(ctx.scopesRepo.list())
    .then(() => ctx.emitStatus({ state: 'running', pausedReason: null }))
    .catch((err) => {
      console.error('[reload] watcher sync failed', err)
      ctx.emitStatus({ state: 'running', pausedReason: null })
    })
}

export function registerIpc(ctx: DaemonContext): void {
  ipcMain.handle(Channels.setup.getPreferences, (): AppPreferences => ctx.prefs.get())

  ipcMain.handle(
    Channels.setup.updatePreferences,
    (_e, patch: Partial<AppPreferences>): AppPreferences => {
      const next = ctx.prefs.update(patch)
      if (patch.autostart !== undefined) {
        syncAutostart(!!patch.autostart)
      }
      return next
    }
  )

  ipcMain.handle(
    Channels.setup.complete,
    async (
      _e,
      mode: 'folders' | 'machine',
      folders: { path: string; preset: ScopePreset }[]
    ) => {
      const global = ctx.scopesRepo.ensureGlobal(defaultGlobalRules())
      if (mode === 'machine') {
        const machineRoot = os.homedir()
        const rules = presetRules('everything')
        rules.filters.excludeGlobs = [
          ...new Set([
            ...rules.filters.excludeGlobs,
            ...getCommonExcludes(),
            ...wholeMachineExtraExcludes(process.platform)
          ])
        ]
        ctx.scopesRepo.add('folder', machineRoot, rules, global.id, 'Whole machine')
      } else {
        for (const f of folders) {
          const rules = presetRules(f.preset)
          ctx.scopesRepo.add('folder', f.path, rules, global.id, path.basename(f.path))
        }
      }
      ctx.prefs.update({ setupComplete: true, defaultMode: mode })
      reload(ctx)
    }
  )

  ipcMain.handle(Channels.daemon.getInfo, (): DaemonInfo => {
    const scopes = ctx.scopesRepo.list().filter((s) => s.enabled && s.type === 'folder').length
    const snapshotCount = ctx.storage.totalSnapshotCount()
    const totalBytes = ctx.storage.blobs.totalBytes()
    return {
      status: ctx.status,
      watchedScopes: scopes,
      snapshotCount,
      totalBytes,
      startedAt: ctx.startedAt
    }
  })

  ipcMain.handle(Channels.daemon.pause, (_e, reason: 'user' | 'battery') => {
    ctx.watcher.setPaused(true)
    ctx.emitStatus({ state: 'paused', pausedReason: reason })
  })

  ipcMain.handle(Channels.daemon.resume, () => {
    ctx.watcher.setPaused(false)
    ctx.emitStatus({ state: 'running', pausedReason: null })
  })

  ipcMain.handle(Channels.scopes.list, (): Scope[] => ctx.scopesRepo.list())

  ipcMain.handle(
    Channels.scopes.add,
    (
      _e,
      type: ScopeType,
      pathOrPattern: string,
      preset: ScopePreset,
      parentId: number | null
    ): Scope => {
      const rules = presetRules(preset)
      const name = type === 'folder' ? path.basename(pathOrPattern) : pathOrPattern
      const scope = ctx.scopesRepo.add(type, pathOrPattern, rules, parentId, name)
      reload(ctx)
      return scope
    }
  )

  ipcMain.handle(
    Channels.scopes.update,
    (_e, id: number, partialRules: Partial<ScopeRules>, name?: string): Scope | null => {
      const existing = ctx.scopesRepo.get(id)
      if (!existing) return null
      const merged: ScopeRules = {
        filters: { ...existing.rules.filters, ...(partialRules.filters ?? {}) },
        triggers: { ...existing.rules.triggers, ...(partialRules.triggers ?? {}) },
        retention: { ...existing.rules.retention, ...(partialRules.retention ?? {}) },
        security: { ...existing.rules.security, ...(partialRules.security ?? {}) }
      }
      const updated = ctx.scopesRepo.update(id, merged, name)
      reload(ctx)
      return updated
    }
  )

  ipcMain.handle(Channels.scopes.remove, (_e, id: number) => {
    ctx.scopesRepo.remove(id)
    reload(ctx)
  })

  ipcMain.handle(
    Channels.scopes.dryRun,
    async (_e, pathOrPattern: string, preset: ScopePreset): Promise<DryRunEstimate> => {
      return runDryRun(pathOrPattern, preset)
    }
  )

  ipcMain.handle(Channels.scopes.resolved, (_e, p: string) => {
    const resolved = ctx.rules.resolve(p)
    return resolved?.rules ?? null
  })

  ipcMain.handle(Channels.timeline.day, (_e, dateIso: string) => {
    const entries: TimelineEntry[] = ctx.storage.getDayEntries(dateIso)
    return { date: dateIso, totalEvents: entries.length, entries }
  })

  ipcMain.handle(Channels.timeline.days, (_e, fromIso: string, toIso: string) =>
    ctx.storage.getDayCounts(fromIso, toIso)
  )

  ipcMain.handle(Channels.files.versions, (_e, p: string, limit?: number): FileVersion[] =>
    ctx.storage.listVersions(p, limit)
  )

  ipcMain.handle(Channels.files.readVersion, async (_e, id: number) => {
    const result = await ctx.storage.readSnapshotContent(id)
    return result ?? { content: '', isBinary: false }
  })

  ipcMain.handle(Channels.files.current, async (_e, p: string) => {
    const fs = await import('node:fs/promises')
    try {
      const data = await fs.readFile(p)
      const isBin = data.includes(0)
      return {
        content: isBin ? `<binary file: ${data.length} bytes>` : data.toString('utf8'),
        isBinary: isBin,
        exists: true
      }
    } catch {
      return { content: '', isBinary: false, exists: false }
    }
  })

  ipcMain.handle(
    Channels.files.restore,
    async (_e, snapshotId: number, targetPath?: string) => {
      const restoredTo = await ctx.storage.restoreSnapshot(snapshotId, targetPath)
      return { restoredTo }
    }
  )

  ipcMain.handle(
    Channels.files.search,
    (_e, query: string, includeDeleted: boolean, limit?: number): FileRow[] =>
      ctx.storage.searchFiles(query, includeDeleted, limit)
  )

  ipcMain.handle(Channels.files.deleted, (_e, limit?: number): FileRow[] =>
    ctx.storage.deletedFiles(limit)
  )

  ipcMain.handle(Channels.storage.stats, (): StorageStats[] => {
    const scopes = ctx.scopesRepo.list()
    const map = new Map<number | null, string>()
    for (const s of scopes) map.set(s.id, s.name || s.pathOrPattern)
    map.set(null, 'Unscoped / restored')
    return ctx.storage.storageStatsPerScope(map)
  })

  ipcMain.handle(Channels.storage.runPruneNow, async () => ctx.retention.runOnce())

  ipcMain.handle(Channels.picker.chooseFolder, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ctx.watcher.on('snapshot', (info) => {
    broadcast(Channels.events.snapshotCreated, info)
  })

  if (ctx.prefs.get().pauseOnBattery) {
    const onBattery = (): void => {
      ctx.watcher.setPaused(true)
      ctx.emitStatus({ state: 'paused', pausedReason: 'battery' })
    }
    const onPower = (): void => {
      ctx.watcher.setPaused(false)
      ctx.emitStatus({ state: 'running', pausedReason: null })
    }
    powerMonitor.on('on-battery', onBattery)
    powerMonitor.on('on-ac', onPower)
  }

  // Re-broadcast use database queries via getDb when handlers fire so the
  // initial DB instance is the most recent one.
  void getDb()
}
