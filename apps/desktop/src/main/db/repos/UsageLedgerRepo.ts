import type Database from 'better-sqlite3'
import type { UsageLedgerEntry } from '@bestfriend/core'
import { randomUUID } from 'crypto'

export class UsageLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  record(entry: Omit<UsageLedgerEntry, 'id' | 'occurred_at'>): void {
    this.db
      .prepare(`
        INSERT INTO usage_ledger (id, provider, kind, tokens_in, tokens_out, units, est_cost_usd, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .run(
        randomUUID(),
        entry.provider,
        entry.kind,
        entry.tokens_in ?? null,
        entry.tokens_out ?? null,
        entry.units ?? null,
        entry.est_cost_usd,
      )
  }

  /** Returns total spend in USD for a given day. day format: 'YYYY-MM-DD'. */
  dailyTotalUsd(day: string): number {
    const row = this.db
      .prepare(`
        SELECT COALESCE(SUM(est_cost_usd), 0) as total
        FROM usage_ledger
        WHERE date(occurred_at) = ?
      `)
      .get(day) as { total: number }
    return row.total
  }

  todayTotalUsd(): number {
    return this.dailyTotalUsd(new Date().toISOString().slice(0, 10))
  }

  listRecent(limit = 100): UsageLedgerEntry[] {
    return this.db
      .prepare(`
        SELECT * FROM usage_ledger ORDER BY occurred_at DESC LIMIT ?
      `)
      .all(limit) as UsageLedgerEntry[]
  }
}
