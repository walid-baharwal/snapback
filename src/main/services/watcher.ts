import chokidar, { type FSWatcher } from 'chokidar'
import micromatch from 'micromatch'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import type { Scope } from '@shared/types'
import type { RulesEngine } from './rulesEngine'
import type { StorageEngine } from '../storage/storageEngine'

interface PendingChange {
  type: 'modify' | 'create' | 'delete'
  timer: NodeJS.Timeout
}

export interface WatcherEvents {
  snapshot: (info: { filePath: string; event: 'create' | 'modify' | 'delete'; snapshotId: number }) => void
}

/**
 * Directory names that are ALWAYS skipped, regardless of user rules. These are
 * either huge (millions of files), churn-heavy (caches), or noisy (system
 * folders) on any of the supported OSes. This is defence in depth: even if a
 * user adds a scope deep inside one of these, we still won't descend.
 */
const HARD_SKIP_DIR_NAMES = new Set<string>([
  // Cross-platform / VCS / build / package managers
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.next',
  '.nuxt',
  '.cache',
  '.parcel-cache',
  '.vite',
  '.turbo',
  '.gradle',
  '.idea',
  '.vscode-server',
  'dist',
  'build',
  'out',
  'target',
  '__pycache__',
  'venv',
  '.venv',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.npm',
  '.nvm',
  '.yarn',
  '.pnpm-store',
  '.cargo',
  '.rustup',
  // Linux user
  '.local',
  '.config',
  '.mozilla',
  '.electron',
  '.Trash',
  'Trash',
  '.snap',
  '.snapshots',
  'snap',
  // macOS
  'Library',
  '.Spotlight-V100',
  '.fseventsd',
  '.Trashes',
  '.DocumentRevisions-V100',
  '.TemporaryItems',
  'Network Trash Folder',
  'Temporary Items',
  '.AppleDouble',
  '.AppleDB',
  '.AppleDesktop',
  // Windows
  'AppData',
  'Application Data',
  'Local Settings',
  '$Recycle.Bin',
  '$RECYCLE.BIN',
  'System Volume Information',
  'Recent',
  'SendTo',
  'Cookies',
  'PrintHood',
  'NetHood'
])

/**
 * Watches all enabled folder scopes via chokidar, applies rules, debounces
 * change bursts, and delegates capture to the StorageEngine.
 */
export class WatcherService extends EventEmitter {
  private watchers: Map<number, FSWatcher> = new Map()
  private pending: Map<string, PendingChange> = new Map()
  private paused = false

  constructor(private rules: RulesEngine, private storage: StorageEngine) {
    super()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
  }

  isPaused(): boolean {
    return this.paused
  }

  /** Apply current scopes - starts watchers for folder scopes that aren't yet watched and stops ones removed. */
  async syncScopes(scopes: Scope[]): Promise<void> {
    const folderScopes = scopes.filter((s) => s.enabled && s.type === 'folder')

    for (const [scopeId, watcher] of this.watchers.entries()) {
      const stillNeeded = folderScopes.find((s) => s.id === scopeId)
      if (!stillNeeded) {
        await watcher.close()
        this.watchers.delete(scopeId)
      }
    }

    for (const scope of folderScopes) {
      if (this.watchers.has(scope.id)) continue
      try {
        const ignoredFn = this.buildIgnoredFn(scope)
        const watcher = chokidar.watch(scope.pathOrPattern, {
          ignored: ignoredFn,
          persistent: true,
          ignoreInitial: true,
          followSymlinks: false,
          awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
          atomic: true,
          depth: 99
        })
        watcher.on('add', (p) => this.queue(p, 'create', scope))
        watcher.on('change', (p) => this.queue(p, 'modify', scope))
        watcher.on('unlink', (p) => this.queue(p, 'delete', scope))
        watcher.on('error', (err) => {
          const e = err as NodeJS.ErrnoException
          if (e?.code === 'ENOSPC') {
            console.error(
              '[watcher] inotify limit reached. Raise it with: sudo sysctl fs.inotify.max_user_watches=524288'
            )
          } else {
            console.error('[watcher]', scope.pathOrPattern, err)
          }
        })
        this.watchers.set(scope.id, watcher)
      } catch (err) {
        console.error('Failed to start watcher for', scope.pathOrPattern, err)
      }
    }
  }

  /**
   * Build the `ignored` predicate. Chokidar calls this for every path it
   * considers during the initial walk and on every event. With whole-machine
   * mode this is hundreds of thousands of calls, so it must be very cheap:
   *
   *   1. Hard-skip directory names via a Set lookup (O(1), microseconds).
   *   2. Dotfile excludes via basename's first char (no micromatch).
   *   3. Remaining globs via a PRE-COMPILED `micromatch.matcher` (single
   *      regex), called once per path on the relative path.
   *
   * The previous implementation called `micromatch.isMatch` (which recompiles
   * globs internally) twice per path. That alone burned 5-15s of CPU on the
   * main thread during the boot scan and was the root cause of the "Snapback
   * not responding" dialog on Linux.
   */
  private buildIgnoredFn(scope: Scope): (p: string) => boolean {
    const allExcludes = scope.rules.filters.excludeGlobs
    const root = scope.pathOrPattern
    const DOTFILE_PATTERNS = new Set(['**/.*', '**/.*/**'])
    const skipDotfiles = allExcludes.some((g) => DOTFILE_PATTERNS.has(g))
    const otherExcludes = allExcludes.filter((g) => !DOTFILE_PATTERNS.has(g))
    const otherMatchers = otherExcludes.map((g) => micromatch.matcher(g, { dot: true }))

    return (p: string): boolean => {
      const base = path.basename(p)
      if (HARD_SKIP_DIR_NAMES.has(base)) return true
      if (
        skipDotfiles &&
        base.length > 0 &&
        base.charCodeAt(0) === 46 /* '.' */ &&
        base !== '.' &&
        base !== '..'
      ) {
        return true
      }
      if (otherMatchers.length > 0) {
        const rel = path.relative(root, p)
        if (rel && !rel.startsWith('..')) {
          for (let i = 0; i < otherMatchers.length; i++) {
            if (otherMatchers[i](rel)) return true
          }
        }
      }
      return false
    }
  }

  async stopAll(): Promise<void> {
    for (const w of this.watchers.values()) await w.close()
    this.watchers.clear()
    for (const p of this.pending.values()) clearTimeout(p.timer)
    this.pending.clear()
  }

  private queue(filePath: string, event: 'create' | 'modify' | 'delete', folderScope: Scope): void {
    if (this.paused) return
    const abs = path.resolve(filePath)
    const resolved = this.rules.resolve(abs)
    if (!resolved) return
    if (event !== 'delete' && !this.rules.isAllowed(abs, resolved.rules, folderScope.pathOrPattern)) {
      return
    }

    const existing = this.pending.get(abs)
    if (existing) clearTimeout(existing.timer)

    const debounce = resolved.rules.triggers.debounceMs
    const finalEvent = event
    const timer = setTimeout(async () => {
      this.pending.delete(abs)
      try {
        const result = await this.storage.captureFile(abs, finalEvent, {
          encrypt: resolved.rules.security.encrypt,
          scopeId: resolved.scope?.id ?? null,
          skipBinaries: resolved.rules.filters.skipBinaries
        })
        if (result) {
          this.emit('snapshot', {
            filePath: abs,
            event: finalEvent,
            snapshotId: result.snapshot.id
          })
        }
      } catch (err) {
        console.error('[watcher] capture failed', abs, err)
      }
    }, debounce)

    this.pending.set(abs, { type: event, timer })
  }
}
