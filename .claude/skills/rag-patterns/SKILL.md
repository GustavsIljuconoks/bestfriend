---
name: "rag-patterns"
description: "Use when implementing or debugging the Bestfriend RAG pipeline: Pinecone multi-namespace queries, OpenAI streaming chat with tool calls, context assembly and token budgeting, chunking algorithm, embedding batch upserts, chat history embedding, proposal/memory extraction from tool call payloads, and spend tracking. Invoke whenever touching packages/core/rag/, packages/core/providers/, or the AI-facing parts of main process."
---

# RAG & AI Pipeline Patterns — Bestfriend Project

Reference guide for the Bestfriend AI pipeline. All code lives in `packages/core/` (pure TypeScript, no Electron) and is called from the Electron main process.

## Pinecone Index Design

```
Index: one serverless index
Namespace "docs":         document chunks — filter by collection_ids
Namespace "chat_history": past message chunks — no filtering needed

Vector ID format:
  docs:         chunk::<chunkId>        (UUID from SQLite chunks table)
  chat_history: msg::<messageId>        (UUID from SQLite messages table)
```

### Pinecone client patterns

```typescript
import { Pinecone } from '@pinecone-database/pinecone'

const pc = new Pinecone({ apiKey: secrets.pineconeApiKey })
const index = pc.index(settings.indexName)

// Upsert doc chunks
await index.namespace('docs').upsert([{
  id: `chunk::${chunkId}`,
  values: embedding,        // float32[], dim 1536
  metadata: {
    chunk_id: chunkId,
    document_id: documentId,
    chunk_index: i,
    filename: displayName,
    source_uri: sourceUri,
    mime_type: mimeType,
    sha256: sha256,
    text: chunkText,        // include text in metadata for inline display
    collection_ids: collectionIds,  // string[] — for $in filter
  }
}])

// Multi-namespace query (PARALLEL — always await Promise.all)
const [docsRes, histRes] = await Promise.all([
  index.namespace('docs').query({
    vector: queryEmbedding,
    topK: settings.topK_docs,       // default 10
    includeMetadata: true,
    filter: scope.collectionIds?.length
      ? { collection_ids: { $in: scope.collectionIds } }
      : undefined,
  }),
  index.namespace('chat_history').query({
    vector: queryEmbedding,
    topK: settings.topK_chat,       // default 5
    includeMetadata: true,
  }),
])

// Delete doc vectors when removing a document
await index.namespace('docs').deleteMany({ document_id: { $eq: documentId } })
```

## Chunking Algorithm (deterministic)

```typescript
// packages/core/ingest/chunker.ts
const TARGET_CHUNK_TOKENS = 512   // configurable in Settings
const OVERLAP_TOKENS = 64         // carry-over for context continuity

function chunk(text: string): ChunkResult[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const paragraphs = normalized.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''
  let currentTokens = 0

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)
    if (currentTokens + paraTokens > TARGET_CHUNK_TOKENS && current) {
      chunks.push(current.trim())
      // overlap: carry last OVERLAP_TOKENS tokens into next chunk
      const overlap = lastNTokens(current, OVERLAP_TOKENS)
      current = overlap + ' ' + para
      currentTokens = estimateTokens(current)
    } else {
      current = current ? current + '\n\n' + para : para
      currentTokens += paraTokens
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.map((text, i) => ({ text, chunkIndex: i, tokenCount: estimateTokens(text) }))
}
```

## Embedding Patterns

```typescript
// packages/core/providers/openai/embeddings.ts
const EMBED_BATCH_SIZE = 100  // OpenAI limit per request
const MODEL = 'text-embedding-3-small'  // 1536 dim

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({ model: MODEL, input: texts })
  // Track usage
  await usageLedger.record({ provider: 'openai', kind: 'embed',
    tokens_in: res.usage.total_tokens, est_cost_usd: estimateCost(res.usage.total_tokens) })
  return res.data.map(d => d.embedding)
}

// Batch chunks before embedding
for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
  const batch = chunks.slice(i, i + EMBED_BATCH_SIZE)
  const embeddings = await embedBatch(batch.map(c => c.text))
  // ... upsert to Pinecone
}
```

## Context Assembly

```typescript
// Merge docs + chat_history results, deduplicate, sort by score
const merged = [...docsRes.matches, ...histRes.matches]
  .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
  .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

// Hard cap total context tokens
const MAX_CONTEXT_TOKENS = settings.maxContextTokens  // default 8000
let usedTokens = 0
const selected = merged.filter(m => {
  const t = estimateTokens(String(m.metadata?.text ?? ''))
  if (usedTokens + t > MAX_CONTEXT_TOKENS) return false
  usedTokens += t
  return true
})

// Format sources block for system prompt
const sourcesBlock = selected.map(m => {
  const isDoc = m.id.startsWith('chunk::')
  const label = isDoc
    ? `[doc:${m.metadata?.filename}#${m.metadata?.chunk_index}]`
    : `[chat:${m.metadata?.conversation_id}]`
  return `${label}\n"${m.metadata?.text}"`
}).join('\n\n')
```

## Chat Call with Streaming + Tool Calls

```typescript
// packages/core/rag/chat.ts
const stream = await openai.chat.completions.create({
  model: settings.chatModel,
  stream: true,
  messages: [
    { role: 'system', content: buildSystemPrompt(userProfile, memories, sourcesBlock) },
    ...historyMessages,  // last N turns
    { role: 'user', content: userMessage },
  ],
  tools: [
    { type: 'function', function: { name: 'propose_reminder', strict: true, parameters: PROPOSE_REMINDER_SCHEMA } },
    { type: 'function', function: { name: 'propose_suggestion', strict: true, parameters: PROPOSE_SUGGESTION_SCHEMA } },
    { type: 'function', function: { name: 'remember_about_user', strict: true, parameters: REMEMBER_SCHEMA } },
  ],
})

// Stream handler
let tokenBuffer = ''
const toolCallAccumulator: Record<number, { name: string; args: string }> = {}

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta

  if (delta.content) {
    tokenBuffer += delta.content
    ipcMain.emit('chat:token', conversationId, delta.content)  // → renderer
  }

  // Accumulate tool call arguments (may arrive in fragments)
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      if (!toolCallAccumulator[tc.index]) {
        toolCallAccumulator[tc.index] = { name: tc.function?.name ?? '', args: '' }
      }
      toolCallAccumulator[tc.index].args += tc.function?.arguments ?? ''
    }
  }
}

// After stream ends: process tool calls
for (const [, tc] of Object.entries(toolCallAccumulator)) {
  try {
    const payload = JSON.parse(tc.args)
    await processToolCall(tc.name, payload, messageId)
  } catch (e) {
    // Schema violation or JSON parse error — log, don't surface garbage
    logger.warn('tool call parse error', { name: tc.name, error: e })
  }
}
```

## Tool Call Processing

```typescript
// proposals only created from tool-call payloads — NEVER from free-form text
async function processToolCall(name: string, payload: unknown, messageId: string) {
  switch (name) {
    case 'propose_reminder': {
      const parsed = ProposeReminderSchema.safeParse(payload)
      if (!parsed.success) { logger.warn('invalid reminder payload', parsed.error); return }
      if (parsed.data.confidence < settings.proposalConfidenceThreshold) return  // gate
      await proposalRepo.create({ messageId, type: 'reminder', payload: parsed.data })
      break
    }
    case 'propose_suggestion': {
      const parsed = ProposeSuggestionSchema.safeParse(payload)
      if (!parsed.success) { logger.warn('invalid suggestion payload', parsed.error); return }
      if (parsed.data.confidence < settings.proposalConfidenceThreshold) return
      await proposalRepo.create({ messageId, type: 'suggestion', payload: parsed.data })
      break
    }
    case 'remember_about_user': {
      const parsed = RememberSchema.safeParse(payload)
      if (!parsed.success) { logger.warn('invalid memory payload', parsed.error); return }
      await memoryRepo.create({ content: parsed.data.content, sourceMessageId: messageId })
      break
    }
  }
}
```

## System Prompt Template

```typescript
function buildSystemPrompt(profile: UserProfile, memories: Memory[], sources: string): string {
  const memoriesSection = memories.length > 0
    ? `\n## Things I know about you\n${memories.map(m => `- ${m.content}`).join('\n')}`
    : ''

  return `You are Bestfriend, a personal AI assistant for ${profile.name}.
${profile.role ? `Role: ${profile.role}` : ''}
${profile.timezone ? `Timezone: ${profile.timezone}` : ''}
${profile.tonePreferences ? `Tone: ${profile.tonePreferences}` : ''}
${profile.currentProjects?.length ? `Current projects: ${profile.currentProjects.join(', ')}` : ''}
${memoriesSection}

## Knowledge base context
${sources || 'No relevant documents found.'}

When you want to suggest a reminder or note an important action, use the propose_reminder or propose_suggestion tool.
When you learn something important about the user worth remembering, use remember_about_user.
Never fabricate tool call arguments — use only information the user has actually told you.
Deleted memories (if any listed below) must NOT be re-recorded.`
}
```

## Token Estimation (fast, no tokenizer)

```typescript
// packages/core/util/tokens.ts
// ~4 chars per token for English text (good enough for budgeting)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
```

## Cost Estimation Table (defaults)

| Model | Rate |
|---|---|
| `text-embedding-3-small` | $0.02 / 1M tokens |
| `gpt-4o-mini` | $0.15 / 1M input, $0.60 / 1M output |
| `gpt-4o` | $2.50 / 1M input, $10.00 / 1M output |
| `whisper-1` | $0.006 / minute |

These are stored in Settings and override-able. Always read from `settings.pricingTable`, not hardcoded.
