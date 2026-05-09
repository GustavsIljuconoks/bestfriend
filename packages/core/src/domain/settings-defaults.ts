import type { Settings } from './types.js'

export const DEFAULT_SETTINGS: Omit<Settings, 'openai_api_key' | 'pinecone_api_key'> = {
  profile: {
    name: '',
    role: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tone_preferences: '',
    current_projects: [],
  },
  models: {
    embeddings_model: 'text-embedding-3-small',
    chat_model: 'gpt-4.1-mini',
    transcription_model: 'whisper-1',
  },
  retrieval: {
    top_k_docs: 10,
    top_k_chat: 5,
    chunk_size_tokens: 400,
    chunk_overlap_tokens: 80,
  },
  spend: {
    daily_cap_usd: 5.0,
    confirm_threshold_usd: 0.10,
  },
  theme: 'system',
  reminders_mirroring: {
    enabled: false,
    list_name: 'Bestfriend',
  },
}
