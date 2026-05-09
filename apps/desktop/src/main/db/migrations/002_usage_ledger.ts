import type { Migration } from '../migrate.js'

export const migration002: Migration = {
  version: 2,
  name: '002_usage_ledger',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_ledger (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK (provider IN ('openai', 'pinecone')),
        kind TEXT NOT NULL CHECK (kind IN ('embed', 'chat', 'transcribe', 'vector_op')),
        tokens_in INTEGER,
        tokens_out INTEGER,
        units REAL,
        est_cost_usd REAL NOT NULL DEFAULT 0,
        occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_usage_ledger_occurred_at ON usage_ledger (occurred_at)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_usage_ledger_provider_kind ON usage_ledger (provider, kind)
    `)
  },
}
