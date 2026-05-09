import type { Migration } from '../migrate.js'

export const migration003: Migration = {
  version: 3,
  name: '003_documents_and_collections',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK (source_type IN ('drop', 'file', 'folder', 'audio')),
        source_uri TEXT NOT NULL,
        display_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        sha256 TEXT NOT NULL DEFAULT '',
        bytes INTEGER NOT NULL DEFAULT 0,
        indexed_at TEXT,
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'indexing' CHECK (status IN ('indexed', 'indexing', 'error')),
        error_message TEXT
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_source_uri ON documents (source_uri)
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        token_count_estimate INTEGER NOT NULL DEFAULT 0,
        pinecone_vector_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks (document_id)
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS folder_indexes (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        include_globs_json TEXT NOT NULL DEFAULT '[]',
        exclude_globs_json TEXT NOT NULL DEFAULT '[]',
        last_scan_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS document_collections (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        PRIMARY KEY (document_id, collection_id)
      )
    `)
  },
}
