import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { RetrievedChatChunk, RetrievedChunk, RetrievalTrace } from '../domain/types.js'
import { estimateTokens } from '../util/tokens.js'

export interface CappedRetrieval {
  trace: RetrievalTrace
  sourcesBlock: string
}

export function mergeDedupeAndCapSources(
  docsHits: RetrievedChunk[],
  chatHits: RetrievedChatChunk[],
  maxSourceTokens: number,
): CappedRetrieval {
  // Higher score first: cosine/dotproduct-style similarity (this app's Pinecone index).
  // If the index metric were euclidean, prefer ascending score/distance instead.
  const sortedDocs = [...docsHits].sort((a, b) => b.score - a.score)
  const sortedChat = [...chatHits].sort((a, b) => b.score - a.score)

  const seenChunks = new Set<string>()
  const docsAcc: RetrievedChunk[] = []
  for (const h of sortedDocs) {
    if (seenChunks.has(h.chunk_id)) continue
    seenChunks.add(h.chunk_id)
    docsAcc.push(h)
  }

  const seenMessages = new Set<string>()
  const chatAcc: RetrievedChatChunk[] = []
  for (const h of sortedChat) {
    if (seenMessages.has(h.message_id)) continue
    seenMessages.add(h.message_id)
    chatAcc.push(h)
  }

  let budget = maxSourceTokens
  const docsOut: RetrievedChunk[] = []
  for (const d of docsAcc) {
    const overhead = estimateTokens(`[doc:${d.document_name}#${d.chunk_index}]`) + 8
    const t = estimateTokens(d.text) + overhead
    if (t > budget) continue
    docsOut.push(d)
    budget -= t
  }

  const chatsOut: RetrievedChatChunk[] = []
  for (const c of chatAcc) {
    const label = `[chat:${c.conversation_title}@${c.created_at.slice(0, 10)}]`
    const overhead = estimateTokens(label) + 8
    const t = estimateTokens(c.text) + overhead
    if (t > budget) continue
    chatsOut.push(c)
    budget -= t
  }

  const lines: string[] = ['## Sources (retrieved)']
  for (const d of docsOut) {
    lines.push(
      `[doc:${d.document_name}#${d.chunk_index}] score=${d.score.toFixed(4)}`,
      d.text,
      '',
    )
  }
  for (const c of chatsOut) {
    lines.push(
      `[chat:${c.conversation_title}@${c.created_at.slice(0, 10)}] score=${c.score.toFixed(4)} role=${c.role}`,
      c.text,
      '',
    )
  }

  return {
    trace: { docs_hits: docsOut, chat_hits: chatsOut },
    sourcesBlock: lines.join('\n'),
  }
}

export function buildRagSystemPreamble(
  profileLines: string[],
  sourcesBlock: string,
  memorySections: string[],
): string {
  const parts = [
    'You are Bestfriend, a helpful personal assistant with access to the user library and past chats.',
    'When Sources are relevant, use them and cite with [doc:filename#chunkIndex] or [chat:title@YYYY-MM-DD].',
    'Use the provided tools when appropriate: propose_reminder / propose_suggestion for actionable items, remember_about_user for stable personalization facts.',
    'Never claim a reminder was scheduled until the user accepts it in the app.',
    ...profileLines,
    ...memorySections,
    sourcesBlock,
  ].filter((p) => p.length > 0)
  return parts.join('\n\n')
}

export function buildMemorySections(
  activeMemories: string[],
  suppressedMemoryIds: string[],
): string[] {
  const lines: string[] = []
  if (activeMemories.length > 0) {
    lines.push(
      ['## Active memories', ...activeMemories.map((m) => `- ${m}`)].join('\n'),
    )
  }
  if (suppressedMemoryIds.length > 0) {
    lines.push(
      [
        '## Do not re-record',
        'The user removed these memory IDs — never call remember_about_user to restate the same facts:',
        suppressedMemoryIds.map((id) => `- ${id}`).join('\n'),
      ].join('\n'),
    )
  }
  return lines
}

export function toOpenAiHistory(messages: { role: 'user' | 'assistant'; content: string }[]): ChatCompletionMessageParam[] {
  return messages.map((m) =>
    m.role === 'user'
      ? { role: 'user' as const, content: m.content }
      : { role: 'assistant' as const, content: m.content },
  )
}

export function maxSourceTokenBudget(retrievalChunkSize: number): number {
  return Math.min(8000, Math.max(2000, retrievalChunkSize * 12))
}
