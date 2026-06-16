import type Database from 'better-sqlite3'
import type { RetentionRules, Scope } from '@shared/types'
import type { StorageEngine } from '../storage/storageEngine'
import type { ScopesRepo } from './scopesRepo'

interface SnapshotRow {
  id: number
  file_path: string
  blob_hash: string | null
  ts: number
  size: number
  scope_id: number | null
}

/**
 * Retention scheduler. For each scope it:
 *   1. Keeps every snapshot within `keepAllDays`.
 *   2. Thins older snapshots into hourly -> daily -> weekly buckets.
 *   3. Hard-deletes snapshots past `maxAgeDays`.
 *   4. Enforces `maxBytes` and `maxVersionsPerFile` caps.
 *   5. Decrements blob refcounts and GCs orphan blobs.
 */
export class RetentionScheduler {
  private timer: NodeJS.Timeout | null = null
  private intervalMs: number

  constructor(
    private db: Database.Database,
    private storage: StorageEngine,
    private scopesRepo: ScopesRepo,
    intervalMs = 60 * 60 * 1000
  ) {
    this.intervalMs = intervalMs
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => console.error('[retention] error', err))
    }, this.intervalMs)
    // First run is deferred well past boot so it doesn't compete with chokidar's
    // initial walk for the main thread. The hourly interval kicks in regardless.
    setTimeout(() => {
      this.runOnce().catch((err) => console.error('[retention] error', err))
    }, 120_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async runOnce(): Promise<{ deletedSnapshots: number; freedBytes: number }> {
    let deletedSnapshots = 0
    let freedBytes = 0
    const scopes = this.scopesRepo.list()
    const scopeIds: (number | null)[] = scopes.map((s) => s.id)
    scopeIds.push(null)

    for (const scope of scopes) {
      const r = await this.applyToScope(scope)
      deletedSnapshots += r.deletedSnapshots
      freedBytes += r.freedBytes
    }
    return { deletedSnapshots, freedBytes }
  }

  private async applyToScope(scope: Scope): Promise<{ deletedSnapshots: number; freedBytes: number }> {
    const rules = scope.rules.retention
    let totalDeleted = 0
    let totalFreed = 0

    const filePaths = this.db
      .prepare('SELECT DISTINCT file_path FROM snapshots WHERE scope_id = ?')
      .all(scope.id) as Array<{ file_path: string }>

    for (const { file_path } of filePaths) {
      const snaps = this.db
        .prepare(
          `SELECT id, file_path, blob_hash, ts, size, scope_id FROM snapshots
           WHERE scope_id = ? AND file_path = ? ORDER BY ts ASC`
        )
        .all(scope.id, file_path) as SnapshotRow[]

      const { keep, drop } = this.pickKeeps(snaps, rules)
      for (const snap of drop) {
        this.deleteSnapshot(snap)
        totalDeleted++
        totalFreed += snap.size
      }

      if (rules.maxVersionsPerFile > 0 && keep.length > rules.maxVersionsPerFile) {
        const overflow = keep.slice(0, keep.length - rules.maxVersionsPerFile)
        for (const snap of overflow) {
          this.deleteSnapshot(snap)
          totalDeleted++
          totalFreed += snap.size
        }
      }
    }

    if (rules.maxBytes > 0) {
      const result = this.enforceMaxBytes(scope.id, rules.maxBytes)
      totalDeleted += result.deletedSnapshots
      totalFreed += result.freedBytes
    }

    this.gcOrphanBlobs()
    return { deletedSnapshots: totalDeleted, freedBytes: totalFreed }
  }

  /**
   * Bucket-based thinning. Returns the snapshots to keep and to drop.
   * The most recent snapshot of each file is always kept.
   */
  private pickKeeps(
    snaps: SnapshotRow[],
    rules: RetentionRules
  ): { keep: SnapshotRow[]; drop: SnapshotRow[] } {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const keepAllBefore = now - rules.keepAllDays * dayMs
    const hourlyBefore = now - rules.hourlyDays * dayMs
    const dailyBefore = now - rules.dailyDays * dayMs
    const weeklyBefore = now - rules.weeklyDays * dayMs
    const hardCutoff = rules.maxAgeDays > 0 ? now - rules.maxAgeDays * dayMs : -Infinity

    const keep: SnapshotRow[] = []
    const drop: SnapshotRow[] = []

    const bucketKeeps = new Map<string, SnapshotRow>()
    const bucketFor = (snap: SnapshotRow): string | null => {
      if (snap.ts >= keepAllBefore) return null
      if (snap.ts < hardCutoff) return 'DROP'
      const bucketSize = (() => {
        if (snap.ts >= hourlyBefore) return 60 * 60 * 1000
        if (snap.ts >= dailyBefore) return dayMs
        if (snap.ts >= weeklyBefore) return 7 * dayMs
        return rules.maxAgeDays > 0 ? 7 * dayMs : 30 * dayMs
      })()
      return `${Math.floor(snap.ts / bucketSize)}`
    }

    const latestId = snaps.length ? snaps[snaps.length - 1].id : -1

    for (const snap of snaps) {
      if (snap.id === latestId) {
        keep.push(snap)
        continue
      }
      const bucket = bucketFor(snap)
      if (bucket === null) {
        keep.push(snap)
      } else if (bucket === 'DROP') {
        drop.push(snap)
      } else {
        const existing = bucketKeeps.get(bucket)
        if (!existing) {
          bucketKeeps.set(bucket, snap)
        } else if (snap.ts > existing.ts) {
          drop.push(existing)
          bucketKeeps.set(bucket, snap)
        } else {
          drop.push(snap)
        }
      }
    }
    for (const v of bucketKeeps.values()) keep.push(v)
    return { keep, drop }
  }

  private enforceMaxBytes(
    scopeId: number,
    maxBytes: number
  ): { deletedSnapshots: number; freedBytes: number } {
    let deleted = 0
    let freed = 0
    while (true) {
      const row = this.db
        .prepare('SELECT COALESCE(SUM(size), 0) as total FROM snapshots WHERE scope_id = ?')
        .get(scopeId) as { total: number }
      if (row.total <= maxBytes) break
      const victim = this.db
        .prepare(
          `SELECT s.id, s.file_path, s.blob_hash, s.ts, s.size, s.scope_id
           FROM snapshots s WHERE s.scope_id = ?
             AND s.id != (SELECT id FROM snapshots WHERE scope_id = ? AND file_path = s.file_path ORDER BY ts DESC LIMIT 1)
           ORDER BY s.ts ASC LIMIT 1`
        )
        .get(scopeId, scopeId) as SnapshotRow | undefined
      if (!victim) break
      this.deleteSnapshot(victim)
      deleted++
      freed += victim.size
    }
    return { deletedSnapshots: deleted, freedBytes: freed }
  }

  private deleteSnapshot(snap: SnapshotRow): void {
    this.db.prepare('DELETE FROM snapshots WHERE id = ?').run(snap.id)
    if (snap.blob_hash) {
      this.db
        .prepare('UPDATE blobs SET refcount = refcount - 1 WHERE hash = ?')
        .run(snap.blob_hash)
    }
  }

  private gcOrphanBlobs(): void {
    const orphans = this.db
      .prepare('SELECT hash FROM blobs WHERE refcount <= 0')
      .all() as Array<{ hash: string }>
    for (const o of orphans) {
      this.storage.blobs.delete(o.hash)
      this.db.prepare('DELETE FROM blobs WHERE hash = ?').run(o.hash)
    }
  }
}
