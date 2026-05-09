import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  up(db: Database.Database): void
}

export function runMigrations(db: Database.Database, migrations: Migration[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT version FROM _migrations').all() as { version: number }[]).map((r) => r.version),
  )

  const sorted = [...migrations].sort((a, b) => a.version - b.version)

  for (const migration of sorted) {
    if (applied.has(migration.version)) continue

    db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
    })()

    console.log(`[db] Applied migration ${migration.version}: ${migration.name}`)
  }
}
