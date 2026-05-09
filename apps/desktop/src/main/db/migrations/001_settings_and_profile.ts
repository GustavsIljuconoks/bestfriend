import type { Migration } from '../migrate.js'

export const migration001: Migration = {
  version: 1,
  name: '001_settings_and_profile',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        tone_preferences TEXT NOT NULL DEFAULT '',
        current_projects_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      INSERT OR IGNORE INTO user_profile (id) VALUES (1)
    `)
  },
}
