import type Database from 'better-sqlite3'
import type { FolderIndex } from '@bestfriend/core'
import { randomUUID } from 'crypto'

interface FolderIndexRow {
  id: string
  path: string
  include_globs_json: string
  exclude_globs_json: string
  last_scan_at: string | null
}

export class FolderIndexRepo {
  constructor(private readonly db: Database.Database) {}

  create(path: string, includeGlobs: string[] = [], excludeGlobs: string[] = []): FolderIndex {
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT OR IGNORE INTO folder_indexes (id, path, include_globs_json, exclude_globs_json) VALUES (?, ?, ?, ?)',
      )
      .run(id, path, JSON.stringify(includeGlobs), JSON.stringify(excludeGlobs))

    const existing = this.getByPath(path)
    if (existing) return existing

    return {
      id,
      path,
      include_globs: includeGlobs,
      exclude_globs: excludeGlobs,
      last_scan_at: null,
    }
  }

  getById(id: string): FolderIndex | null {
    const row = this.db.prepare('SELECT * FROM folder_indexes WHERE id = ?').get(id) as
      | FolderIndexRow
      | undefined
    return row ? rowToFolderIndex(row) : null
  }

  getByPath(path: string): FolderIndex | null {
    const row = this.db.prepare('SELECT * FROM folder_indexes WHERE path = ?').get(path) as
      | FolderIndexRow
      | undefined
    return row ? rowToFolderIndex(row) : null
  }

  listAll(): FolderIndex[] {
    const rows = this.db.prepare('SELECT * FROM folder_indexes').all() as FolderIndexRow[]
    return rows.map(rowToFolderIndex)
  }

  markScanned(id: string): void {
    this.db
      .prepare(`UPDATE folder_indexes SET last_scan_at = datetime('now') WHERE id = ?`)
      .run(id)
  }
}

function rowToFolderIndex(row: FolderIndexRow): FolderIndex {
  return {
    id: row.id,
    path: row.path,
    include_globs: JSON.parse(row.include_globs_json) as string[],
    exclude_globs: JSON.parse(row.exclude_globs_json) as string[],
    last_scan_at: row.last_scan_at,
  }
}
