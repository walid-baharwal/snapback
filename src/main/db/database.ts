import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { applySchema } from './schema'

let db: Database.Database | null = null
let dbPath = ''

export function initDatabase(storageDir: string): Database.Database {
  fs.mkdirSync(storageDir, { recursive: true })
  dbPath = path.join(storageDir, 'snapback.db')
  db = new Database(dbPath)
  applySchema(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialised. Call initDatabase first.')
  return db
}

export function getDbPath(): string {
  return dbPath
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
