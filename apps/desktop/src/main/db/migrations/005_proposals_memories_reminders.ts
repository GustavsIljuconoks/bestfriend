import type { Migration } from '../migrate.js'

export const migration005: Migration = {
  version: 5,
  name: '005_proposals_memories_reminders',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('reminder', 'suggestion')),
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        decided_at TEXT
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_proposals_message
      ON proposals (message_id)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_proposals_conversation_status
      ON proposals (status)
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_deleted
      ON memories (deleted_at)
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        due_at TEXT NOT NULL,
        timezone TEXT NOT NULL,
        recurrence TEXT NOT NULL CHECK (recurrence IN ('one_off', 'daily', 'weekly', 'monthly')),
        status TEXT NOT NULL CHECK (status IN ('scheduled', 'fired', 'cancelled')),
        snoozed_until TEXT,
        eventkit_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        fired_at TEXT
      )
    `)

    db.exec(`
      ALTER TABLE messages ADD COLUMN memories_captured INTEGER NOT NULL DEFAULT 0
    `)
  },
}
