import type Database from 'better-sqlite3'
import type { Message, MessageRole, RetrievalTrace } from '@bestfriend/core'
import { randomUUID } from 'crypto'

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  created_at: string
  retrieval_trace_json: string | null
  pinecone_vector_id: string | null
}

export class MessageRepo {
  constructor(private readonly db: Database.Database) {}

  insert(params: {
    conversationId: string
    role: MessageRole
    content: string
    retrievalTrace: RetrievalTrace | null
  }): Message {
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const traceJson =
      params.retrievalTrace != null ? JSON.stringify(params.retrievalTrace) : null
    this.db
      .prepare(`
        INSERT INTO messages (id, conversation_id, role, content, retrieval_trace_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(id, params.conversationId, params.role, params.content, traceJson, createdAt)
    return {
      id,
      conversation_id: params.conversationId,
      role: params.role,
      content: params.content,
      created_at: createdAt,
      retrieval_trace: params.retrievalTrace,
    }
  }

  setPineconeVectorId(messageId: string, vectorId: string): void {
    this.db
      .prepare(`UPDATE messages SET pinecone_vector_id = ? WHERE id = ?`)
      .run(vectorId, messageId)
  }

  deleteById(messageId: string): void {
    this.db.prepare(`DELETE FROM messages WHERE id = ?`).run(messageId)
  }

  listByConversation(conversationId: string): Message[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY datetime(created_at) ASC
      `,
      )
      .all(conversationId) as MessageRow[]

    return rows.map(rowToMessage)
  }

  getRecentForApi(conversationId: string, limit: number): Message[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM messages
        WHERE conversation_id = ? AND role IN ('user', 'assistant')
        ORDER BY datetime(created_at) DESC
        LIMIT ?
      `,
      )
      .all(conversationId, limit) as MessageRow[]

    return rows.reverse().map(rowToMessage)
  }
}

function rowToMessage(row: MessageRow): Message {
  let retrieval_trace: RetrievalTrace | null = null
  if (row.retrieval_trace_json) {
    try {
      retrieval_trace = JSON.parse(row.retrieval_trace_json) as RetrievalTrace
    } catch {
      retrieval_trace = null
    }
  }
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role as MessageRole,
    content: row.content,
    created_at: row.created_at,
    retrieval_trace,
  }
}
