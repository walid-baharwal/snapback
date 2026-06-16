import type Database from 'better-sqlite3'

/** Apply the database schema. Idempotent. */
export function applySchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      path_or_pattern TEXT NOT NULL,
      parent_id INTEGER,
      rules_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (parent_id) REFERENCES scopes(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scopes_type ON scopes(type);
    CREATE INDEX IF NOT EXISTS idx_scopes_parent ON scopes(parent_id);

    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      current_blob_hash TEXT,
      last_seen_ts INTEGER NOT NULL,
      status TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
    CREATE INDEX IF NOT EXISTS idx_files_last_seen ON files(last_seen_ts);

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      blob_hash TEXT,
      ts INTEGER NOT NULL,
      event TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      lines INTEGER NOT NULL DEFAULT 0,
      words INTEGER NOT NULL DEFAULT 0,
      chars INTEGER NOT NULL DEFAULT 0,
      encrypted INTEGER NOT NULL DEFAULT 0,
      scope_id INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_file ON snapshots(file_path);
    CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);
    CREATE INDEX IF NOT EXISTS idx_snapshots_scope ON snapshots(scope_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_file_ts ON snapshots(file_path, ts DESC);

    CREATE TABLE IF NOT EXISTS blobs (
      hash TEXT PRIMARY KEY,
      size INTEGER NOT NULL,
      refcount INTEGER NOT NULL DEFAULT 0,
      encrypted INTEGER NOT NULL DEFAULT 0
    );
  `)
}
