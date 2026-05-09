import type Database from 'better-sqlite3'
import type { Memory } from '@bestfriend/core'
import { randomUUID } from 'crypto'

interface MemoryRow {
  id: string
  content: string
  source_message_id: string | null
  pinned: number
  created_at: string
  deleted_at: string | null
}

export class MemoryRepo {
  constructor(private readonly db: Database.Database) {}

  insert(params: { content: string; sourceMessageId: string | null }): Memory {
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    this.db
      .prepare(
        `
        INSERT INTO memories (id, content, source_message_id, pinned, created_at)
        VALUES (?, ?, ?, 0, ?)
      `,
      )
      .run(id, params.content, params.sourceMessageId, createdAt)
    return {
      id,
      content: params.content,
      source_message_id: params.sourceMessageId,
      pinned: false,
      created_at: createdAt,
      deleted_at: null,
    }
  }

  listActive(): Memory[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM memories
        WHERE deleted_at IS NULL
        ORDER BY pinned DESC, datetime(created_at) DESC
      `,
      )
      .all() as MemoryRow[]
    return rows.map(rowToMemory)
  }

  listDeletedIds(): string[] {
    const rows = this.db
      .prepare(`SELECT id FROM memories WHERE deleted_at IS NOT NULL`)
      .all() as { id: string }[]
    return rows.map((r) => r.id)
  }

  updateContent(id: string, content: string): void {
    this.db.prepare(`UPDATE memories SET content = ? WHERE id = ? AND deleted_at IS NULL`).run(
      content,
      id,
    )
  }

  setPinned(id: string, pinned: boolean): void {
    this.db.prepare(`UPDATE memories SET pinned = ? WHERE id = ? AND deleted_at IS NULL`).run(
      pinned ? 1 : 0,
      id,
    )
  }

  softDelete(id: string): void {
    const at = new Date().toISOString()
    this.db
      .prepare(`UPDATE memories SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(at, id)
  }

  deleteBySourceMessageIdForRollback(sourceMessageId: string): void {
    this.db.prepare(`DELETE FROM memories WHERE source_message_id = ?`).run(sourceMessageId)
  }
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    source_message_id: row.source_message_id,
    pinned: row.pinned !== 0,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  }
}
