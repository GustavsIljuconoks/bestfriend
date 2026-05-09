import type Database from 'better-sqlite3'
import type { ConversationSummary } from '@bestfriend/core'
import { randomUUID } from 'crypto'

interface ConversationRow {
  id: string
  title: string
  scope_collection_ids_json: string | null
  created_at: string
  updated_at: string
}

interface SummaryRow extends ConversationRow {
  message_count: number
  last_message_at: string | null
}

export class ConversationRepo {
  constructor(private readonly db: Database.Database) {}

  create(scopeCollectionIds: string[]): { id: string } {
    const id = randomUUID()
    const scopeJson =
      scopeCollectionIds.length > 0 ? JSON.stringify(scopeCollectionIds) : null
    this.db
      .prepare(`
        INSERT INTO conversations (id, title, scope_collection_ids_json)
        VALUES (?, 'New chat', ?)
      `)
      .run(id, scopeJson)
    return { id }
  }

  getById(id: string):
    | {
        id: string
        title: string
        scope_collection_ids: string[]
        created_at: string
        updated_at: string
      }
    | undefined {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | ConversationRow
      | undefined
    if (!row) return undefined
    return {
      id: row.id,
      title: row.title,
      scope_collection_ids: parseScope(row.scope_collection_ids_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  getTitle(id: string): string | undefined {
    const row = this.db.prepare('SELECT title FROM conversations WHERE id = ?').get(id) as
      | { title: string }
      | undefined
    return row?.title
  }

  listSummaries(): ConversationSummary[] {
    const rows = this.db
      .prepare(
        `
        SELECT c.*,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
          (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = c.id) AS last_message_at
        FROM conversations c
        ORDER BY COALESCE(last_message_at, c.updated_at) DESC
      `,
      )
      .all() as SummaryRow[]

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      scope_collection_ids: parseScope(r.scope_collection_ids_json),
      last_message_at: r.last_message_at,
      message_count: r.message_count,
    }))
  }

  touchUpdated(id: string): void {
    this.db
      .prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`)
      .run(id)
  }

  setTitleIfDefault(id: string, title: string): void {
    this.db
      .prepare(
        `
        UPDATE conversations SET title = ?, updated_at = datetime('now')
        WHERE id = ? AND title = 'New chat'
      `,
      )
      .run(title, id)
  }
}

function parseScope(json: string | null): string[] {
  if (json == null || json === '') return []
  try {
    const parsed = JSON.parse(json) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
