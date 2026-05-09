import type Database from 'better-sqlite3'
import type { Document, DocumentSummary, DocumentStatus, SourceType } from '@bestfriend/core'
import { randomUUID } from 'crypto'

interface DocumentRow {
  id: string
  source_type: string
  source_uri: string
  display_name: string
  mime_type: string
  sha256: string
  bytes: number
  indexed_at: string | null
  last_seen_at: string
  status: string
  error_message: string | null
}

interface SummaryRow {
  id: string
  display_name: string
  mime_type: string
  status: string
  chunk_count: number
  indexed_at: string | null
  error_message: string | null
}

export class DocumentRepo {
  constructor(private readonly db: Database.Database) {}

  create(params: {
    sourceType: SourceType
    sourceUri: string
    displayName: string
    mimeType: string
    sha256: string
    bytes: number
  }): Document {
    const id = randomUUID()
    this.db
      .prepare(`
        INSERT INTO documents (id, source_type, source_uri, display_name, mime_type, sha256, bytes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'indexing')
      `)
      .run(
        id,
        params.sourceType,
        params.sourceUri,
        params.displayName,
        params.mimeType,
        params.sha256,
        params.bytes,
      )
    return this.getById(id)!
  }

  getById(id: string): Document | null {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
      | DocumentRow
      | undefined
    return row ? rowToDocument(row) : null
  }

  getBySha256(sha256: string): Document | null {
    const row = this.db.prepare('SELECT * FROM documents WHERE sha256 = ?').get(sha256) as
      | DocumentRow
      | undefined
    return row ? rowToDocument(row) : null
  }

  getBySourceUri(sourceUri: string): Document | null {
    const row = this.db
      .prepare('SELECT * FROM documents WHERE source_uri = ?')
      .get(sourceUri) as DocumentRow | undefined
    return row ? rowToDocument(row) : null
  }

  listSummaries(collectionId?: string): DocumentSummary[] {
    let rows: SummaryRow[]
    if (collectionId) {
      rows = this.db
        .prepare(`
          SELECT d.id, d.display_name, d.mime_type, d.status, d.indexed_at, d.error_message,
                 COUNT(c.id) as chunk_count
          FROM documents d
          JOIN document_collections dc ON dc.document_id = d.id
          LEFT JOIN chunks c ON c.document_id = d.id
          WHERE dc.collection_id = ?
          GROUP BY d.id
          ORDER BY d.last_seen_at DESC
        `)
        .all(collectionId) as SummaryRow[]
    } else {
      rows = this.db
        .prepare(`
          SELECT d.id, d.display_name, d.mime_type, d.status, d.indexed_at, d.error_message,
                 COUNT(c.id) as chunk_count
          FROM documents d
          LEFT JOIN chunks c ON c.document_id = d.id
          GROUP BY d.id
          ORDER BY d.last_seen_at DESC
        `)
        .all() as SummaryRow[]
    }
    return rows.map(rowToSummary)
  }

  markIndexed(id: string): void {
    this.db
      .prepare(`
        UPDATE documents SET status = 'indexed', indexed_at = datetime('now'), error_message = NULL
        WHERE id = ?
      `)
      .run(id)
  }

  markError(id: string, message: string): void {
    this.db
      .prepare(`
        UPDATE documents SET status = 'error', error_message = ?
        WHERE id = ?
      `)
      .run(message, id)
  }

  markIndexing(id: string): void {
    this.db.prepare(`UPDATE documents SET status = 'indexing' WHERE id = ?`).run(id)
  }

  updateSha256(id: string, sha256: string, bytes: number): void {
    this.db
      .prepare(`UPDATE documents SET sha256 = ?, bytes = ?, last_seen_at = datetime('now') WHERE id = ?`)
      .run(sha256, bytes, id)
  }

  setStatus(id: string, status: DocumentStatus): void {
    this.db.prepare(`UPDATE documents SET status = ? WHERE id = ?`).run(status, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  }

  listAll(): Document[] {
    const rows = this.db
      .prepare('SELECT * FROM documents ORDER BY last_seen_at DESC')
      .all() as DocumentRow[]
    return rows.map(rowToDocument)
  }
}

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    source_type: row.source_type as SourceType,
    source_uri: row.source_uri,
    display_name: row.display_name,
    mime_type: row.mime_type,
    sha256: row.sha256,
    bytes: row.bytes,
    indexed_at: row.indexed_at,
    last_seen_at: row.last_seen_at,
    status: row.status as DocumentStatus,
    error_message: row.error_message,
  }
}

function rowToSummary(row: SummaryRow): DocumentSummary {
  return {
    id: row.id,
    display_name: row.display_name,
    mime_type: row.mime_type,
    status: row.status as DocumentStatus,
    chunk_count: row.chunk_count,
    indexed_at: row.indexed_at,
    error_message: row.error_message,
  }
}
