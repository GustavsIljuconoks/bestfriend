import type Database from 'better-sqlite3'
import type { Collection } from '@bestfriend/core'
import { randomUUID } from 'crypto'

interface CollectionRow {
  id: string
  name: string
  color: string | null
  created_at: string
}

export class CollectionRepo {
  constructor(private readonly db: Database.Database) {}

  create(name: string, color?: string): Collection {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO collections (id, name, color) VALUES (?, ?, ?)')
      .run(id, name, color ?? null)
    return this.getById(id)!
  }

  getById(id: string): Collection | null {
    const row = this.db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as
      | CollectionRow
      | undefined
    return row ? rowToCollection(row) : null
  }

  listAll(): Collection[] {
    const rows = this.db
      .prepare('SELECT * FROM collections ORDER BY created_at ASC')
      .all() as CollectionRow[]
    return rows.map(rowToCollection)
  }

  rename(id: string, name: string): void {
    this.db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(name, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM collections WHERE id = ?').run(id)
  }

  assignDocument(documentId: string, collectionId: string): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO document_collections (document_id, collection_id) VALUES (?, ?)',
      )
      .run(documentId, collectionId)
  }

  removeDocument(documentId: string, collectionId: string): void {
    this.db
      .prepare('DELETE FROM document_collections WHERE document_id = ? AND collection_id = ?')
      .run(documentId, collectionId)
  }

  getCollectionIdsForDocument(documentId: string): string[] {
    const rows = this.db
      .prepare(
        'SELECT collection_id FROM document_collections WHERE document_id = ?',
      )
      .all(documentId) as { collection_id: string }[]
    return rows.map((r) => r.collection_id)
  }
}

function rowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    created_at: row.created_at,
  }
}
