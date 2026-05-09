import type Database from 'better-sqlite3'
import type { Chunk } from '@bestfriend/core'
import { randomUUID } from 'crypto'

interface ChunkRow {
  id: string
  document_id: string
  chunk_index: number
  chunk_text: string
  token_count_estimate: number
  pinecone_vector_id: string | null
  created_at: string
}

export class ChunkRepo {
  constructor(private readonly db: Database.Database) {}

  insertBatch(
    chunks: Array<{
      documentId: string
      chunkIndex: number
      chunkText: string
      tokenCountEstimate: number
    }>,
  ): Chunk[] {
    const stmt = this.db.prepare(`
      INSERT INTO chunks (id, document_id, chunk_index, chunk_text, token_count_estimate)
      VALUES (?, ?, ?, ?, ?)
    `)

    const insertMany = this.db.transaction(
      (
        items: Array<{
          documentId: string
          chunkIndex: number
          chunkText: string
          tokenCountEstimate: number
        }>,
      ) => {
        return items.map((item) => {
          const id = randomUUID()
          stmt.run(id, item.documentId, item.chunkIndex, item.chunkText, item.tokenCountEstimate)
          return id
        })
      },
    )

    const ids = insertMany(chunks)
    return ids.map((id, i) => ({
      id,
      document_id: chunks[i].documentId,
      chunk_index: chunks[i].chunkIndex,
      chunk_text: chunks[i].chunkText,
      token_count_estimate: chunks[i].tokenCountEstimate,
      pinecone_vector_id: null,
      created_at: new Date().toISOString(),
    }))
  }

  setPineconeVectorId(chunkId: string, vectorId: string): void {
    this.db
      .prepare('UPDATE chunks SET pinecone_vector_id = ? WHERE id = ?')
      .run(vectorId, chunkId)
  }

  listByDocument(documentId: string): Chunk[] {
    const rows = this.db
      .prepare('SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index')
      .all(documentId) as ChunkRow[]
    return rows.map(rowToChunk)
  }

  getPineconeVectorIds(documentId: string): string[] {
    const rows = this.db
      .prepare(
        'SELECT pinecone_vector_id FROM chunks WHERE document_id = ? AND pinecone_vector_id IS NOT NULL',
      )
      .all(documentId) as { pinecone_vector_id: string }[]
    return rows.map((r) => r.pinecone_vector_id)
  }

  deleteByDocument(documentId: string): void {
    this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId)
  }

  countByDocument(documentId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM chunks WHERE document_id = ?')
      .get(documentId) as { count: number }
    return row.count
  }
}

function rowToChunk(row: ChunkRow): Chunk {
  return {
    id: row.id,
    document_id: row.document_id,
    chunk_index: row.chunk_index,
    chunk_text: row.chunk_text,
    token_count_estimate: row.token_count_estimate,
    pinecone_vector_id: row.pinecone_vector_id,
    created_at: row.created_at,
  }
}
