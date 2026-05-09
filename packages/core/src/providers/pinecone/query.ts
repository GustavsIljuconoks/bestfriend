import type { Index, RecordMetadata } from '@pinecone-database/pinecone'
import type { MessageRole, RetrievedChunk } from '../../domain/types.js'
import type { PineconeMetadataValue } from './upsert.js'

export interface RawChatSimilarityHit {
  id: string
  score: number
  message_id: string
  conversation_id: string
  role: MessageRole
  text: string
  created_at: string
}

function metaVal(meta: RecordMetadata | undefined, key: string): PineconeMetadataValue | undefined {
  if (!meta || !(key in meta)) return undefined
  return meta[key] as PineconeMetadataValue
}

function asNonEmptyString(v: PineconeMetadataValue | undefined): string | null {
  if (typeof v === 'string' && v.length > 0) return v
  if (typeof v === 'number' && !Number.isNaN(v)) return String(v)
  return null
}

function asChunkIndex(v: PineconeMetadataValue | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v)
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export async function queryDocsForRag(
  index: Index<RecordMetadata>,
  queryVector: number[],
  topK: number,
  scopeCollectionIds: string[],
): Promise<RetrievedChunk[]> {
  const base = {
    vector: queryVector,
    topK,
    includeMetadata: true as const,
  }
  const res =
    scopeCollectionIds.length > 0
      ? await index.namespace('docs').query({
          ...base,
          filter: { collection_ids: { $in: scopeCollectionIds } },
        })
      : await index.namespace('docs').query(base)

  const out: RetrievedChunk[] = []
  for (const m of res.matches) {
    const meta = m.metadata
    const chunkId = asNonEmptyString(metaVal(meta, 'chunk_id'))
    const documentId = asNonEmptyString(metaVal(meta, 'document_id'))
    const filename = asNonEmptyString(metaVal(meta, 'filename')) ?? 'document'
    const text = asNonEmptyString(metaVal(meta, 'text')) ?? ''
    if (!chunkId || !documentId) continue
    out.push({
      chunk_id: chunkId,
      document_id: documentId,
      document_name: filename,
      chunk_index: asChunkIndex(metaVal(meta, 'chunk_index')),
      score: m.score ?? 0,
      text,
    })
  }
  return out
}

export async function queryChatHistoryForRag(
  index: Index<RecordMetadata>,
  queryVector: number[],
  topK: number,
  conversationId: string,
  scopeToCurrentConversation: boolean,
): Promise<RawChatSimilarityHit[]> {
  const base = {
    vector: queryVector,
    topK,
    includeMetadata: true as const,
  }
  const res = scopeToCurrentConversation
    ? await index.namespace('chat_history').query({
        ...base,
        filter: { conversation_id: { $eq: conversationId } },
      })
    : await index.namespace('chat_history').query(base)

  const out: RawChatSimilarityHit[] = []
  for (const m of res.matches) {
    const meta = m.metadata
    const messageId = asNonEmptyString(metaVal(meta, 'message_id'))
    const convId = asNonEmptyString(metaVal(meta, 'conversation_id'))
    const text = asNonEmptyString(metaVal(meta, 'text')) ?? ''
    const createdAt =
      asNonEmptyString(metaVal(meta, 'created_at')) ?? new Date().toISOString()
    const roleRaw = asNonEmptyString(metaVal(meta, 'role'))
    if (!messageId || !convId || !roleRaw) continue
    const role = roleRaw === 'assistant' || roleRaw === 'user' ? roleRaw : 'user'
    out.push({
      id: m.id,
      score: m.score ?? 0,
      message_id: messageId,
      conversation_id: convId,
      role,
      text,
      created_at: createdAt,
    })
  }
  return out
}
