import type Database from 'better-sqlite3'
import type {
  MaskedSettings,
  ModelSettings,
  RetrievalSettings,
  SpendSettings,
  RemindersMirroringSettings,
  UserProfile,
  SettingsPatch,
} from '@bestfriend/core'
import { DEFAULT_SETTINGS } from '@bestfriend/core'

function getSettingJson<T>(db: Database.Database, key: string, fallback: T): T {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as
    | { value_json: string }
    | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value_json) as T
  } catch {
    return fallback
  }
}

function setSettingJson(db: Database.Database, key: string, value: unknown): void {
  db.prepare(`
    INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value))
}

interface ProfileRow {
  name: string
  role: string
  timezone: string
  tone_preferences: string
  current_projects_json: string
}

export class SettingsRepo {
  constructor(private readonly db: Database.Database) {}

  loadProfile(): UserProfile {
    const row = this.db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as ProfileRow | undefined

    if (!row) return DEFAULT_SETTINGS.profile

    return {
      name: row.name,
      role: row.role,
      timezone: row.timezone,
      tone_preferences: row.tone_preferences,
      current_projects: JSON.parse(row.current_projects_json) as string[],
    }
  }

  saveProfile(profile: UserProfile): void {
    this.db
      .prepare(`
        UPDATE user_profile SET
          name = ?, role = ?, timezone = ?, tone_preferences = ?,
          current_projects_json = ?, updated_at = datetime('now')
        WHERE id = 1
      `)
      .run(
        profile.name,
        profile.role,
        profile.timezone,
        profile.tone_preferences,
        JSON.stringify(profile.current_projects),
      )
  }

  loadNonSecretSettings(): Omit<MaskedSettings, 'profile' | 'openai_api_key_set' | 'pinecone_api_key_set'> {
    return {
      models: getSettingJson<ModelSettings>(this.db, 'models', DEFAULT_SETTINGS.models),
      retrieval: getSettingJson<RetrievalSettings>(this.db, 'retrieval', DEFAULT_SETTINGS.retrieval),
      spend: getSettingJson<SpendSettings>(this.db, 'spend', DEFAULT_SETTINGS.spend),
      theme: getSettingJson<'system' | 'light' | 'dark'>(this.db, 'theme', DEFAULT_SETTINGS.theme),
      reminders_mirroring: getSettingJson<RemindersMirroringSettings>(
        this.db,
        'reminders_mirroring',
        DEFAULT_SETTINGS.reminders_mirroring,
      ),
    }
  }

  /**
   * Persists non-secret settings from a patch.
   * API keys (openai_api_key, pinecone_api_key) are intentionally ignored here —
   * they are handled by safeStorage in the electron-pro layer.
   */
  saveFromPatch(patch: SettingsPatch): void {
    if (patch.profile) this.saveProfile(patch.profile)
    if (patch.models) setSettingJson(this.db, 'models', patch.models)
    if (patch.retrieval) setSettingJson(this.db, 'retrieval', patch.retrieval)
    if (patch.spend) setSettingJson(this.db, 'spend', patch.spend)
    if (patch.theme !== undefined) setSettingJson(this.db, 'theme', patch.theme)
    if (patch.reminders_mirroring) setSettingJson(this.db, 'reminders_mirroring', patch.reminders_mirroring)
  }
}
