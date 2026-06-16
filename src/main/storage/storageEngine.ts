import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { BlobStore } from './blobStore'
import { computeTextStats, isLikelyBinary } from './textStats'
import type {
  FileRow,
  FileVersion,
  Snapshot,
  SnapshotEvent,
  StorageStats,
  TimelineEntry
} from '@shared/types'

export interface CaptureResult {
  snapshot: Snapshot
  newBlob: boolean
}

/** Storage engine wrapping the DB index and the blob store. */
export class StorageEngine {
  private db: Database.Database
  blobs: BlobStore

  constructor(db: Database.Database, blobsDir: string) {
    this.db = db
    this.blobs = new BlobStore(blobsDir)
  }

  /**
   * Capture a snapshot for a file. Reads the file from disk, hashes it,
   * deduplicates if the content is unchanged from the most recent snapshot,
   * stores the blob if new, and records the snapshot row.
   *
   * Returns null when the content is unchanged from the latest snapshot for
   * that path.
   */
  async captureFile(
    filePath: string,
    event: SnapshotEvent,
    options: { encrypt: boolean; scopeId: number | null; skipBinaries: boolean }
  ): Promise<CaptureResult | null> {
    if (event === 'delete') {
      return this.captureDeletion(filePath, options.scopeId)
    }

    let data: Buffer
    try {
      data = fs.readFileSync(filePath)
    } catch {
      // The file may have vanished between the event and now; record nothing.
      return null
    }

    const binary = isLikelyBinary(data)
    if (binary && options.skipBinaries) return null

    const hash = await BlobStore.hash(data)
    const existing = this.getLatestSnapshot(filePath)
    if (existing && existing.blob_hash === hash) {
      this.db
        .prepare('UPDATE files SET last_seen_ts = ?, status = ? WHERE path = ?')
        .run(Date.now(), 'active', filePath)
      return null
    }

    const wroteNew = await this.blobs.write(hash, data, options.encrypt)
    this.upsertBlob(hash, data.length, options.encrypt, wroteNew ? 1 : 0)

    const stats = computeTextStats(data, binary)
    const ts = Date.now()

    const info = this.db
      .prepare(
        `INSERT INTO snapshots
         (file_path, blob_hash, ts, event, size, lines, words, chars, encrypted, scope_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        filePath,
        hash,
        ts,
        event,
        data.length,
        stats.lines,
        stats.words,
        stats.chars,
        options.encrypt ? 1 : 0,
        options.scopeId
      )

    this.upsertFile(filePath, hash, ts, 'active')

    const snapshot: Snapshot = {
      id: Number(info.lastInsertRowid),
      filePath,
      blobHash: hash,
      ts,
      event,
      size: data.length,
      lines: stats.lines,
      words: stats.words,
      chars: stats.chars,
      encrypted: options.encrypt
    }
    return { snapshot, newBlob: wroteNew }
  }

  private captureDeletion(filePath: string, scopeId: number | null): CaptureResult | null {
    const ts = Date.now()
    const existing = this.getLatestSnapshot(filePath)
    // If we never have any recoverable snapshot for this path (e.g. it was a
    // binary we skipped), recording a deletion is dead weight - it would show
    // in the UI without any way to restore. Drop it silently.
    if (!existing || existing.blob_hash === null) {
      return null
    }
    if (existing.event === 'delete') {
      this.upsertFile(filePath, null, ts, 'deleted')
      return {
        snapshot: this.snapshotRowToSnapshot(existing),
        newBlob: false
      }
    }
    const info = this.db
      .prepare(
        `INSERT INTO snapshots (file_path, blob_hash, ts, event, size, lines, words, chars, encrypted, scope_id)
         VALUES (?, NULL, ?, 'delete', 0, 0, 0, 0, 0, ?)`
      )
      .run(filePath, ts, scopeId)
    this.upsertFile(filePath, null, ts, 'deleted')
    return {
      snapshot: {
        id: Number(info.lastInsertRowid),
        filePath,
        blobHash: null,
        ts,
        event: 'delete',
        size: 0,
        lines: 0,
        words: 0,
        chars: 0,
        encrypted: false
      },
      newBlob: false
    }
  }

  private getLatestSnapshot(
    filePath: string
  ): {
    id: number
    blob_hash: string | null
    ts: number
    event: SnapshotEvent
    encrypted: number
    size: number
    lines: number
    words: number
    chars: number
  } | null {
    return this.db
      .prepare(
        `SELECT id, blob_hash, ts, event, encrypted, size, lines, words, chars
         FROM snapshots WHERE file_path = ? ORDER BY ts DESC LIMIT 1`
      )
      .get(filePath) as ReturnType<StorageEngine['getLatestSnapshot']>
  }

  private upsertFile(
    filePath: string,
    hash: string | null,
    ts: number,
    status: 'active' | 'deleted'
  ): void {
    this.db
      .prepare(
        `INSERT INTO files (path, current_blob_hash, last_seen_ts, status)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           current_blob_hash = excluded.current_blob_hash,
           last_seen_ts = excluded.last_seen_ts,
           status = excluded.status`
      )
      .run(filePath, hash, ts, status)
  }

  private upsertBlob(hash: string, size: number, encrypted: boolean, refDelta: number): void {
    this.db
      .prepare(
        `INSERT INTO blobs (hash, size, refcount, encrypted) VALUES (?, ?, ?, ?)
         ON CONFLICT(hash) DO UPDATE SET refcount = refcount + ?`
      )
      .run(hash, size, refDelta, encrypted ? 1 : 0, refDelta)
  }

  private snapshotRowToSnapshot(row: ReturnType<StorageEngine['getLatestSnapshot']>): Snapshot {
    if (!row) throw new Error('Cannot convert null row')
    return {
      id: row.id,
      filePath: '',
      blobHash: row.blob_hash,
      ts: row.ts,
      event: row.event,
      size: row.size,
      lines: row.lines,
      words: row.words,
      chars: row.chars,
      encrypted: !!row.encrypted
    }
  }

  /* ----------------------------- Query helpers ----------------------------- */

  listVersions(filePath: string, limit = 200): FileVersion[] {
    const rows = this.db
      .prepare(
        `SELECT id, ts, event, size, lines, words, chars, encrypted
         FROM snapshots WHERE file_path = ? ORDER BY ts DESC LIMIT ?`
      )
      .all(filePath, limit) as Array<{
      id: number
      ts: number
      event: SnapshotEvent
      size: number
      lines: number
      words: number
      chars: number
      encrypted: number
    }>
    return rows.map((r) => ({
      snapshotId: r.id,
      ts: r.ts,
      event: r.event,
      size: r.size,
      lines: r.lines,
      words: r.words,
      chars: r.chars,
      encrypted: !!r.encrypted
    }))
  }

  getSnapshotById(
    id: number
  ): {
    id: number
    filePath: string
    blobHash: string | null
    encrypted: boolean
    event: SnapshotEvent
    ts: number
  } | null {
    const row = this.db
      .prepare(
        `SELECT id, file_path as filePath, blob_hash as blobHash, encrypted, event, ts
         FROM snapshots WHERE id = ?`
      )
      .get(id) as {
      id: number
      filePath: string
      blobHash: string | null
      encrypted: number
      event: SnapshotEvent
      ts: number
    } | undefined
    if (!row) return null
    return { ...row, encrypted: !!row.encrypted }
  }

  async readSnapshotContent(
    snapshotId: number
  ): Promise<{ content: string; isBinary: boolean } | null> {
    const snap = this.getSnapshotById(snapshotId)
    if (!snap || !snap.blobHash) return null
    const buf = await this.blobs.read(snap.blobHash, snap.encrypted)
    const binary = isLikelyBinary(buf)
    return {
      content: binary ? `<binary file: ${buf.length} bytes>` : buf.toString('utf8'),
      isBinary: binary
    }
  }

  getDayEntries(dateIso: string): TimelineEntry[] {
    const start = new Date(dateIso + 'T00:00:00').getTime()
    const end = start + 24 * 60 * 60 * 1000
    const rows = this.db
      .prepare(
        `SELECT id, file_path as filePath, ts, event, size, lines, words, chars, encrypted
         FROM snapshots WHERE ts >= ? AND ts < ? ORDER BY ts DESC`
      )
      .all(start, end) as Array<{
      id: number
      filePath: string
      ts: number
      event: SnapshotEvent
      size: number
      lines: number
      words: number
      chars: number
      encrypted: number
    }>
    return rows.map((r) => ({
      snapshotId: r.id,
      ts: r.ts,
      filePath: r.filePath,
      event: r.event,
      size: r.size,
      lines: r.lines,
      words: r.words,
      chars: r.chars,
      encrypted: !!r.encrypted
    }))
  }

  getDayCounts(fromIso: string, toIso: string): { date: string; count: number }[] {
    const start = new Date(fromIso + 'T00:00:00').getTime()
    const end = new Date(toIso + 'T23:59:59').getTime()
    const rows = this.db
      .prepare(
        `SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime') as date, COUNT(*) as count
         FROM snapshots WHERE ts >= ? AND ts <= ? GROUP BY date ORDER BY date ASC`
      )
      .all(start, end) as Array<{ date: string; count: number }>
    return rows
  }

  searchFiles(query: string, includeDeleted: boolean, limit = 100): FileRow[] {
    const like = `%${query}%`
    const sql = includeDeleted
      ? `SELECT path, current_blob_hash as currentBlobHash, last_seen_ts as lastSeenTs, status
         FROM files WHERE path LIKE ? ORDER BY last_seen_ts DESC LIMIT ?`
      : `SELECT path, current_blob_hash as currentBlobHash, last_seen_ts as lastSeenTs, status
         FROM files WHERE path LIKE ? AND status = 'active' ORDER BY last_seen_ts DESC LIMIT ?`
    return this.db.prepare(sql).all(like, limit) as FileRow[]
  }

  deletedFiles(limit = 100): FileRow[] {
    return this.db
      .prepare(
        `SELECT path, current_blob_hash as currentBlobHash, last_seen_ts as lastSeenTs, status
         FROM files WHERE status = 'deleted' ORDER BY last_seen_ts DESC LIMIT ?`
      )
      .all(limit) as FileRow[]
  }

  fileExists(filePath: string): boolean {
    const row = this.db
      .prepare(`SELECT path FROM files WHERE path = ?`)
      .get(filePath) as { path: string } | undefined
    return !!row
  }

  /* ----------------------------- Storage stats ----------------------------- */

  storageStatsPerScope(scopeIdToName: Map<number | null, string>): StorageStats[] {
    const rows = this.db
      .prepare(
        `SELECT scope_id as scopeId,
                COUNT(*) as snapshotCount,
                COUNT(DISTINCT file_path) as fileCount,
                COALESCE(SUM(size), 0) as bytes
         FROM snapshots GROUP BY scope_id`
      )
      .all() as Array<{
      scopeId: number | null
      snapshotCount: number
      fileCount: number
      bytes: number
    }>
    return rows.map((r) => ({
      scopeId: r.scopeId,
      scopeName: scopeIdToName.get(r.scopeId) ?? 'Unscoped',
      bytes: r.bytes,
      fileCount: r.fileCount,
      snapshotCount: r.snapshotCount
    }))
  }

  totalSnapshotCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM snapshots').get() as { c: number }
    return row.c
  }

  /* ----------------------------- Restore ----------------------------- */

  async restoreSnapshot(snapshotId: number, targetPath?: string): Promise<string> {
    const snap = this.getSnapshotById(snapshotId)
    if (!snap) throw new Error('Snapshot not found')
    if (snap.event === 'delete') throw new Error('Cannot restore a deletion event')
    if (!snap.blobHash) throw new Error('Snapshot has no associated content')
    const buf = await this.blobs.read(snap.blobHash, snap.encrypted)
    const dest = targetPath ?? snap.filePath
    // Non-destructive: if dest currently exists, capture it first as a pre-restore snapshot.
    if (fs.existsSync(dest)) {
      try {
        await this.captureFile(dest, 'modify', {
          encrypt: snap.encrypted,
          scopeId: null,
          skipBinaries: false
        })
      } catch {
        // Best effort.
      }
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, buf)
    this.upsertFile(dest, snap.blobHash, Date.now(), 'active')
    return dest
  }
}
