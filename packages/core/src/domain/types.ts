export type SourceType = 'drop' | 'file' | 'folder' | 'audio'
export type DocumentStatus = 'indexed' | 'indexing' | 'error'
export type ProposalStatus = 'proposed' | 'accepted' | 'rejected'
export type ProposalType = 'reminder' | 'suggestion'
export type ReminderRecurrence = 'one_off' | 'daily' | 'weekly' | 'monthly'
export type ReminderStatus = 'scheduled' | 'fired' | 'cancelled'
export type FeedItemType = 'announcement' | 'reminder_fired' | 'index_error' | 'spend_cap'
export type InboxItemKind = 'text' | 'voice'
export type InboxItemStatus = 'untriaged' | 'actioned' | 'dismissed'
export type TriageType = 'reminder' | 'note' | 'chat' | 'dismiss'
export type MessageRole = 'user' | 'assistant' | 'system'
export type JobEventType = 'progress' | 'complete' | 'error'
export type IconWeight = 'bold' | 'duotone' | 'fill' | 'light' | 'regular' | 'thin'

export interface Document {
  id: string
  source_type: SourceType
  source_uri: string
  display_name: string
  mime_type: string
  sha256: string
  bytes: number
  indexed_at: string | null
  last_seen_at: string
  status: DocumentStatus
  error_message: string | null
}

export interface DocumentSummary {
  id: string
  display_name: string
  mime_type: string
  status: DocumentStatus
  chunk_count: number
  indexed_at: string | null
  error_message: string | null
}

export interface Chunk {
  id: string
  document_id: string
  chunk_index: number
  chunk_text: string
  token_count_estimate: number
  pinecone_vector_id: string | null
  created_at: string
}

export interface FolderIndex {
  id: string
  path: string
  include_globs: string[]
  exclude_globs: string[]
  last_scan_at: string | null
}

export interface Collection {
  id: string
  name: string
  color: string | null
  created_at: string
}

export interface ConversationSummary {
  id: string
  title: string
  scope_collection_ids: string[]
  last_message_at: string | null
  message_count: number
}

export interface RetrievedChunk {
  chunk_id: string
  document_id: string
  document_name: string
  chunk_index: number
  score: number
  text: string
}

export interface RetrievedChatChunk {
  message_id: string
  conversation_id: string
  conversation_title: string
  role: MessageRole
  score: number
  text: string
}

export interface RetrievalTrace {
  docs_hits: RetrievedChunk[]
  chat_hits: RetrievedChatChunk[]
}

export interface Message {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  created_at: string
  retrieval_trace: RetrievalTrace | null
}

export interface ReminderPayload {
  title: string
  due_at: string
  timezone: string
  recurrence: ReminderRecurrence
  notes: string | null
  confidence: number
}

export interface SuggestionPayload {
  title: string
  details: string | null
  confidence: number
}

export interface Proposal {
  id: string
  message_id: string
  type: ProposalType
  payload: ReminderPayload | SuggestionPayload
  status: ProposalStatus
  created_at: string
  decided_at: string | null
}

export interface AssistantTurn {
  message: Message
  proposals: Proposal[]
  memories_captured: number
}

export interface Reminder {
  id: string
  title: string
  notes: string | null
  due_at: string
  timezone: string
  recurrence: ReminderRecurrence
  status: ReminderStatus
  snoozed_until: string | null
  eventkit_id: string | null
  created_at: string
  fired_at: string | null
}

export interface FeedItem {
  id: string
  type: FeedItemType
  title: string
  body: string
  created_at: string
  read_at: string | null
}

export interface SuggestedAction {
  type: TriageType
  payload: ReminderPayload | { note_text: string } | null
  confidence: number
}

export interface TriageAction {
  type: TriageType
  payload?: ReminderPayload | { note_text: string } | { conversation_id: string }
}

export interface InboxItem {
  id: string
  kind: InboxItemKind
  raw_text: string | null
  transcript: string | null
  audio_path: string | null
  status: InboxItemStatus
  suggested_action: SuggestedAction | null
  actioned_as: TriageType | null
  actioned_target_id: string | null
  created_at: string
  actioned_at: string | null
}

export interface UserProfile {
  name: string
  role: string
  timezone: string
  tone_preferences: string
  current_projects: string[]
}

export interface Memory {
  id: string
  content: string
  source_message_id: string | null
  pinned: boolean
  created_at: string
  deleted_at: string | null
}

export interface ModelSettings {
  embeddings_model: string
  chat_model: string
  transcription_model: string
}

export interface RetrievalSettings {
  top_k_docs: number
  top_k_chat: number
  chunk_size_tokens: number
  chunk_overlap_tokens: number
}

export interface SpendSettings {
  daily_cap_usd: number
  confirm_threshold_usd: number
}

export interface RemindersMirroringSettings {
  enabled: boolean
  list_name: string
}

/** Main-process internal only — never sent to renderer */
export interface Settings {
  profile: UserProfile
  openai_api_key: string
  pinecone_api_key: string
  models: ModelSettings
  retrieval: RetrievalSettings
  spend: SpendSettings
  theme: 'system' | 'light' | 'dark'
  reminders_mirroring: RemindersMirroringSettings
}

/** Safe projection sent to renderer — raw keys are never included */
export interface MaskedSettings {
  profile: UserProfile
  openai_api_key_set: boolean
  pinecone_api_key_set: boolean
  models: ModelSettings
  retrieval: RetrievalSettings
  spend: SpendSettings
  theme: 'system' | 'light' | 'dark'
  reminders_mirroring: RemindersMirroringSettings
}

/** Write-only patch from renderer — secrets are accepted but never echoed back */
export interface SettingsPatch {
  profile?: UserProfile
  openai_api_key?: string
  pinecone_api_key?: string
  models?: ModelSettings
  retrieval?: RetrievalSettings
  spend?: SpendSettings
  theme?: 'system' | 'light' | 'dark'
  reminders_mirroring?: RemindersMirroringSettings
}

export interface ServiceStatus {
  ok: boolean
  error: string | null
  latency_ms: number | null
}

export interface TestConnectionsResult {
  openai: ServiceStatus
  pinecone: ServiceStatus
}

export interface CreatePineconeIndexResult {
  created: boolean
  existed: boolean
  dimension: number
  error: string | null
}

export interface JobProgress {
  current: number
  total: number
  phase: string
  estimated_cost_usd: number
}

export interface JobEvent {
  job_id: string
  type: JobEventType
  progress?: JobProgress
  error?: string
}

export interface UsageLedgerEntry {
  id: string
  provider: 'openai' | 'pinecone'
  kind: 'embed' | 'chat' | 'transcribe' | 'vector_op'
  tokens_in: number | null
  tokens_out: number | null
  units: number | null
  est_cost_usd: number
  occurred_at: string
}
