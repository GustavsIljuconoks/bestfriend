export interface EmbeddingModelEntry {
  id: string
  label: string
  dimension: number
  provider: 'openai'
}

export const EMBEDDING_MODEL_CATALOG: EmbeddingModelEntry[] = [
  { id: 'text-embedding-3-small', label: 'text-embedding-3-small (1536d)', dimension: 1536, provider: 'openai' },
  { id: 'text-embedding-3-large', label: 'text-embedding-3-large (3072d)', dimension: 3072, provider: 'openai' },
  { id: 'text-embedding-ada-002', label: 'text-embedding-ada-002 (1536d)', dimension: 1536, provider: 'openai' },
]

export const CHAT_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
]

export const TRANSCRIPTION_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'whisper-1', label: 'Whisper-1' },
  { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe' },
  { id: 'gpt-4o-mini-transcribe', label: 'GPT-4o mini Transcribe' },
]

export const DEFAULT_PINECONE_INDEX_NAME = 'bestfriend'
