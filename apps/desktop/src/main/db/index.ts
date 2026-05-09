import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { runMigrations } from './migrate.js'
import { migration001 } from './migrations/001_settings_and_profile.js'
import { migration002 } from './migrations/002_usage_ledger.js'
import { migration003 } from './migrations/003_documents_and_collections.js'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) throw new Error('Database not initialized — call initDb() first')
  return _db
}

export function initDb(): Database.Database {
  if (_db) return _db

  const dbPath = join(app.getPath('userData'), 'bestfriend.db')
  _db = new Database(dbPath)

  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  _db.pragma('busy_timeout = 5000')

  runMigrations(_db, [migration001, migration002, migration003])

  return _db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
