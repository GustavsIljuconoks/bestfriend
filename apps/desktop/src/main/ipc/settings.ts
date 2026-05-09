import { ipcMain } from 'electron'
import type { MaskedSettings, SettingsPatch } from '@bestfriend/core'
import {
  testOpenAIKey,
  testPineconeKey,
  createIndexIfMissing,
  EMBEDDING_MODEL_CATALOG,
} from '@bestfriend/core'
import { getDb } from '../db/index.js'
import { SettingsRepo } from '../db/repos/SettingsRepo.js'
import { storeKey, retrieveKey, isKeySet } from '../security/safeStorage.js'

function getSettingsRepo(): SettingsRepo {
  return new SettingsRepo(getDb())
}

function buildMaskedSettings(repo: SettingsRepo): MaskedSettings {
  return {
    ...repo.loadNonSecretSettings(),
    profile: repo.loadProfile(),
    openai_api_key_set: isKeySet('openai'),
    pinecone_api_key_set: isKeySet('pinecone'),
  }
}

function validatePatch(patch: unknown): SettingsPatch {
  if (typeof patch !== 'object' || patch === null) {
    throw new Error('Invalid patch: expected object')
  }
  const p = patch as Record<string, unknown>

  if ('openai_api_key' in p) {
    if (typeof p['openai_api_key'] !== 'string' || p['openai_api_key'].length < 20) {
      throw new Error('openai_api_key must be a string of at least 20 characters')
    }
  }
  if ('pinecone_api_key' in p) {
    if (typeof p['pinecone_api_key'] !== 'string' || p['pinecone_api_key'].length < 20) {
      throw new Error('pinecone_api_key must be a string of at least 20 characters')
    }
  }
  if ('models' in p && p['models'] !== undefined) {
    const m = p['models'] as Record<string, unknown>
    if (typeof m['embeddings_model'] !== 'string') {
      throw new Error('models.embeddings_model must be a string')
    }
    if (typeof m['chat_model'] !== 'string') {
      throw new Error('models.chat_model must be a string')
    }
    if (typeof m['transcription_model'] !== 'string') {
      throw new Error('models.transcription_model must be a string')
    }
  }
  if ('retrieval' in p && p['retrieval'] !== undefined) {
    const r = p['retrieval'] as Record<string, unknown>
    const fields = ['top_k_docs', 'top_k_chat', 'chunk_size_tokens', 'chunk_overlap_tokens'] as const
    for (const field of fields) {
      if (r[field] !== undefined && (typeof r[field] !== 'number' || (r[field] as number) < 1)) {
        throw new Error(`retrieval.${field} must be a positive number`)
      }
    }
  }
  if ('spend' in p && p['spend'] !== undefined) {
    const s = p['spend'] as Record<string, unknown>
    if (
      s['daily_cap_usd'] !== undefined &&
      (typeof s['daily_cap_usd'] !== 'number' || (s['daily_cap_usd'] as number) < 0)
    ) {
      throw new Error('spend.daily_cap_usd must be >= 0')
    }
    if (
      s['confirm_threshold_usd'] !== undefined &&
      (typeof s['confirm_threshold_usd'] !== 'number' || (s['confirm_threshold_usd'] as number) < 0)
    ) {
      throw new Error('spend.confirm_threshold_usd must be >= 0')
    }
  }
  if ('theme' in p && !['system', 'light', 'dark'].includes(p['theme'] as string)) {
    throw new Error('theme must be system, light, or dark')
  }

  return p as SettingsPatch
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async (): Promise<MaskedSettings> => {
    const repo = getSettingsRepo()
    return buildMaskedSettings(repo)
  })

  ipcMain.handle('settings:set', async (_event, rawPatch: unknown): Promise<MaskedSettings> => {
    const patch = validatePatch(rawPatch)
    const repo = getSettingsRepo()

    if (patch.openai_api_key) {
      storeKey('openai', patch.openai_api_key)
    }
    if (patch.pinecone_api_key) {
      storeKey('pinecone', patch.pinecone_api_key)
    }

    repo.saveFromPatch(patch)

    return buildMaskedSettings(repo)
  })

  ipcMain.handle('settings:testConnections', async () => {
    const openaiKey = retrieveKey('openai')
    const pineconeKey = retrieveKey('pinecone')

    const [openai, pinecone] = await Promise.all([
      openaiKey
        ? testOpenAIKey(openaiKey)
        : Promise.resolve({ ok: false, error: 'OpenAI API key is not set', latency_ms: null }),
      pineconeKey
        ? testPineconeKey(pineconeKey)
        : Promise.resolve({ ok: false, error: 'Pinecone API key is not set', latency_ms: null }),
    ])

    return { openai, pinecone }
  })

  ipcMain.handle('settings:createPineconeIndex', async () => {
    const pineconeKey = retrieveKey('pinecone')
    if (!pineconeKey) {
      return { created: false, existed: false, dimension: 0, error: 'Pinecone API key is not set' }
    }

    const repo = getSettingsRepo()
    const { models } = repo.loadNonSecretSettings()
    const catalogEntry = EMBEDDING_MODEL_CATALOG.find((e) => e.id === models.embeddings_model)
    const dimension = catalogEntry?.dimension ?? 1536

    return createIndexIfMissing(pineconeKey, undefined, dimension)
  })
}
