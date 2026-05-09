import { ipcMain, type BrowserWindow } from 'electron'
import type {
  AssistantTurn,
  ChatStreamEvent,
  ConversationSummary,
  Message,
  RetrievedChatChunk,
} from '@bestfriend/core'
import {
  createOpenAIClient,
  createPineconeClient,
  embedBatch,
  streamChatWithToolLoop,
  queryDocsForRag,
  queryChatHistoryForRag,
  mergeDedupeAndCapSources,
  buildRagSystemPreamble,
  buildMemorySections,
  toOpenAiHistory,
  maxSourceTokenBudget,
  DEFAULT_PINECONE_INDEX_NAME,
  EMBEDDING_MODEL_CATALOG,
  upsertVectors,
  estimateEmbeddingCostUsd,
  estimateChatCompletionCostUsd,
  estimateTokens,
  MAX_CHAT_USER_MESSAGE_CHARS,
  CHAT_FUNCTION_TOOLS,
  parseProposeReminderArguments,
  parseProposeSuggestionArguments,
  parseRememberAboutUserArguments,
} from '@bestfriend/core'
import { getDb } from '../db/index.js'
import { ConversationRepo } from '../db/repos/ConversationRepo.js'
import { MessageRepo } from '../db/repos/MessageRepo.js'
import { SettingsRepo } from '../db/repos/SettingsRepo.js'
import { UsageLedgerRepo } from '../db/repos/UsageLedgerRepo.js'
import { CollectionRepo } from '../db/repos/CollectionRepo.js'
import { MemoryRepo } from '../db/repos/MemoryRepo.js'
import { ProposalRepo } from '../db/repos/ProposalRepo.js'
import { retrieveKey } from '../security/safeStorage.js'

function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function validateChatMessageText(value: unknown): string {
  const text = validateString(value, 'text')
  if (text.length > MAX_CHAT_USER_MESSAGE_CHARS) {
    throw new Error(
      `Message is too long (max ${MAX_CHAT_USER_MESSAGE_CHARS} characters, got ${text.length})`,
    )
  }
  return text
}

function validateOptionalScopeIds(value: unknown): string[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('scopeCollectionIds must be an array of strings')
  const out: string[] = []
  for (const v of value) {
    if (typeof v !== 'string' || v.trim() === '') {
      throw new Error('scopeCollectionIds must be an array of strings')
    }
    out.push(v.trim())
  }
  return out
}

function assertCollectionsExist(db: ReturnType<typeof getDb>, ids: string[]): void {
  if (ids.length === 0) return
  const repo = new CollectionRepo(db)
  const known = new Set(repo.listAll().map((c) => c.id))
  for (const id of ids) {
    if (!known.has(id)) throw new Error(`Collection ${id} not found`)
  }
}

function rollbackPartialTurn(
  msgRepo: MessageRepo,
  memoryRepo: MemoryRepo,
  userMessageId: string,
  assistantMessageId: string | null,
): void {
  if (assistantMessageId) {
    memoryRepo.deleteBySourceMessageIdForRollback(assistantMessageId)
    msgRepo.deleteById(assistantMessageId)
  }
  msgRepo.deleteById(userMessageId)
}

export function registerChatHandlers(win: BrowserWindow): void {
  const sendStream = (payload: ChatStreamEvent): void => {
    if (!win.isDestroyed()) {
      win.webContents.send('chat:stream', payload)
    }
  }

  ipcMain.handle('chat:listConversations', async (): Promise<ConversationSummary[]> => {
    return new ConversationRepo(getDb()).listSummaries()
  })

  ipcMain.handle(
    'chat:createConversation',
    async (_e, rawScope: unknown): Promise<{ conversationId: string }> => {
      const db = getDb()
      const scopeIds = validateOptionalScopeIds(rawScope)
      assertCollectionsExist(db, scopeIds)
      const created = new ConversationRepo(db).create(scopeIds)
      return { conversationId: created.id }
    },
  )

  ipcMain.handle('chat:listMessages', async (_e, rawConvId: unknown): Promise<Message[]> => {
    const conversationId = validateString(rawConvId, 'conversationId')
    const conv = new ConversationRepo(getDb()).getById(conversationId)
    if (!conv) throw new Error(`Conversation ${conversationId} not found`)
    return new MessageRepo(getDb()).listByConversation(conversationId)
  })

  ipcMain.handle(
    'chat:sendMessage',
    async (_e, rawConvId: unknown, rawText: unknown): Promise<AssistantTurn> => {
      const conversationId = validateString(rawConvId, 'conversationId')
      const text = validateChatMessageText(rawText)

      const db = getDb()
      const convRepo = new ConversationRepo(db)
      const msgRepo = new MessageRepo(db)
      const settingsRepo = new SettingsRepo(db)
      const ledgerRepo = new UsageLedgerRepo(db)
      const memoryRepo = new MemoryRepo(db)
      const proposalRepo = new ProposalRepo(db)

      const conv = convRepo.getById(conversationId)
      if (!conv) throw new Error(`Conversation ${conversationId} not found`)

      const { models, retrieval, spend } = settingsRepo.loadNonSecretSettings()
      const todaySpend = ledgerRepo.todayTotalUsd()
      if (spend.daily_cap_usd > 0 && todaySpend >= spend.daily_cap_usd) {
        throw new Error(
          `Daily spend cap of $${spend.daily_cap_usd.toFixed(2)} reached ($${todaySpend.toFixed(2)} spent today).`,
        )
      }

      const openaiKey = retrieveKey('openai')
      const pineconeKey = retrieveKey('pinecone')
      if (!openaiKey) throw new Error('OpenAI API key is not configured')
      if (!pineconeKey) throw new Error('Pinecone API key is not configured')

      const catalogEntry = EMBEDDING_MODEL_CATALOG.find((e) => e.id === models.embeddings_model)
      const embeddingModel = catalogEntry?.id ?? 'text-embedding-3-small'

      const userMsg = msgRepo.insert({
        conversationId,
        role: 'user',
        content: text,
        retrievalTrace: null,
      })

      convRepo.touchUpdated(conversationId)

      let assistantMessageId: string | null = null

      try {
        const openai = createOpenAIClient(openaiKey)
        const pinecone = createPineconeClient(pineconeKey)
        const pineconeIndex = pinecone.index(DEFAULT_PINECONE_INDEX_NAME)

        const queryEmbedding = await embedBatch(openai, [text], embeddingModel)
        const embedQueryCost = estimateEmbeddingCostUsd(queryEmbedding.total_tokens, embeddingModel)
        ledgerRepo.record({
          provider: 'openai',
          kind: 'embed',
          tokens_in: queryEmbedding.total_tokens,
          tokens_out: null,
          units: null,
          est_cost_usd: embedQueryCost,
        })

        const queryVector = queryEmbedding.embeddings[0]
        if (!queryVector?.length) throw new Error('Embedding failed')

        const scopeIds = conv.scope_collection_ids
        const scopeActive = scopeIds.length > 0

        const [rawDocs, rawChat] = await Promise.all([
          queryDocsForRag(pineconeIndex, queryVector, retrieval.top_k_docs, scopeIds),
          queryChatHistoryForRag(
            pineconeIndex,
            queryVector,
            retrieval.top_k_chat,
            conversationId,
            scopeActive,
          ),
        ])

        const getTitle = (id: string) => convRepo.getTitle(id)
        const chatHits: RetrievedChatChunk[] = rawChat.map((h) => ({
          message_id: h.message_id,
          conversation_id: h.conversation_id,
          conversation_title: getTitle(h.conversation_id) ?? 'Chat',
          role: h.role,
          score: h.score,
          text: h.text,
          created_at: h.created_at,
        }))

        const tokenBudget = maxSourceTokenBudget(retrieval.chunk_size_tokens)
        const { trace, sourcesBlock } = mergeDedupeAndCapSources(rawDocs, chatHits, tokenBudget)

        const profile = settingsRepo.loadProfile()
        const profileLines = [
          profile.name ? `User name: ${profile.name}` : '',
          profile.role ? `User role: ${profile.role}` : '',
          profile.timezone ? `Timezone: ${profile.timezone}` : '',
          profile.tone_preferences ? `Tone preferences: ${profile.tone_preferences}` : '',
          profile.current_projects.length > 0
            ? `Current projects: ${profile.current_projects.join(', ')}`
            : '',
        ].filter((line) => line.length > 0)

        const activeMemories = memoryRepo.listActive()
        const memoryLines = activeMemories.map((m) => m.content)
        const suppressedIds = memoryRepo.listDeletedIds()
        const memorySections = buildMemorySections(memoryLines, suppressedIds)

        const systemContent = buildRagSystemPreamble(profileLines, sourcesBlock, memorySections)
        const historyRows = msgRepo.getRecentForApi(conversationId, 48)
        const historyParams = toOpenAiHistory(
          historyRows.flatMap((m) =>
            m.role === 'user' || m.role === 'assistant'
              ? [{ role: m.role, content: m.content }]
              : [],
          ),
        )

        const openaiMessages = [{ role: 'system' as const, content: systemContent }, ...historyParams]

        let chatLedgerRounds = 0
        const result = await streamChatWithToolLoop(
          openai,
          {
            model: models.chat_model,
            messages: openaiMessages,
            tools: CHAT_FUNCTION_TOOLS,
          },
          (delta) => {
            sendStream({ type: 'token', conversationId, text: delta })
          },
          (u) => {
            chatLedgerRounds += 1
            const chatCost = estimateChatCompletionCostUsd(
              u.prompt_tokens,
              u.completion_tokens,
              models.chat_model,
            )
            ledgerRepo.record({
              provider: 'openai',
              kind: 'chat',
              tokens_in: u.prompt_tokens,
              tokens_out: u.completion_tokens,
              units: null,
              est_cost_usd: chatCost,
            })
          },
        )

        if (chatLedgerRounds === 0 && !result.usage) {
          const promptTokens =
            estimateTokens(systemContent) +
            historyParams.reduce(
              (s, m) => s + estimateTokens(typeof m.content === 'string' ? m.content : ''),
              0,
            )
          const completionTokens = estimateTokens(result.fullText)
          const chatCost = estimateChatCompletionCostUsd(
            promptTokens,
            completionTokens,
            models.chat_model,
          )
          ledgerRepo.record({
            provider: 'openai',
            kind: 'chat',
            tokens_in: promptTokens,
            tokens_out: completionTokens,
            units: null,
            est_cost_usd: chatCost,
          })
        }

        let memoryCount = 0
        for (const tc of result.toolCalls) {
          if (tc.name !== 'remember_about_user') continue
          const parsed = parseRememberAboutUserArguments(tc.arguments)
          if (!parsed) {
            console.warn('[chat] rejected malformed remember_about_user tool call')
            continue
          }
          memoryCount += 1
        }

        const assistantMsg = msgRepo.insert({
          conversationId,
          role: 'assistant',
          content: result.fullText,
          retrievalTrace: trace,
          memoriesCaptured: memoryCount,
        })
        assistantMessageId = assistantMsg.id

        for (const tc of result.toolCalls) {
          if (tc.name === 'propose_reminder') {
            const parsed = parseProposeReminderArguments(tc.arguments)
            if (!parsed) {
              console.warn('[chat] rejected malformed propose_reminder tool call')
              continue
            }
            proposalRepo.insertProposed({
              messageId: assistantMsg.id,
              type: 'reminder',
              payload: parsed,
            })
          } else if (tc.name === 'propose_suggestion') {
            const parsed = parseProposeSuggestionArguments(tc.arguments)
            if (!parsed) {
              console.warn('[chat] rejected malformed propose_suggestion tool call')
              continue
            }
            proposalRepo.insertProposed({
              messageId: assistantMsg.id,
              type: 'suggestion',
              payload: parsed,
            })
          } else if (tc.name === 'remember_about_user') {
            const parsed = parseRememberAboutUserArguments(tc.arguments)
            if (!parsed) {
              console.warn('[chat] rejected malformed remember_about_user tool call')
              continue
            }
            memoryRepo.insert({ content: parsed.content, sourceMessageId: assistantMsg.id })
          } else {
            console.warn('[chat] ignored unknown tool call', tc.name)
          }
        }

        const previewTitle =
          text.length > 56 ? `${text.slice(0, 53).trimEnd()}…` : text
        convRepo.setTitleIfDefault(conversationId, previewTitle)
        convRepo.touchUpdated(conversationId)

        const embedTurn = await embedBatch(
          openai,
          [userMsg.content, result.fullText],
          embeddingModel,
        )
        const turnEmbedCost = estimateEmbeddingCostUsd(embedTurn.total_tokens, embeddingModel)
        ledgerRepo.record({
          provider: 'openai',
          kind: 'embed',
          tokens_in: embedTurn.total_tokens,
          tokens_out: null,
          units: null,
          est_cost_usd: turnEmbedCost,
        })

        const embUser = embedTurn.embeddings[0]
        const embAssistant = embedTurn.embeddings[1]
        if (!embUser?.length || !embAssistant?.length) {
          throw new Error('Embedding API returned empty vectors for chat history')
        }

        const clip = (s: string) => (s.length > 8000 ? s.slice(0, 8000) : s)

        await upsertVectors(pineconeIndex, 'chat_history', [
          {
            id: `msg::${userMsg.id}`,
            embedding: embUser,
            metadata: {
              message_id: userMsg.id,
              conversation_id: conversationId,
              role: 'user',
              created_at: userMsg.created_at,
              text: clip(userMsg.content),
            },
          },
          {
            id: `msg::${assistantMsg.id}`,
            embedding: embAssistant,
            metadata: {
              message_id: assistantMsg.id,
              conversation_id: conversationId,
              role: 'assistant',
              created_at: assistantMsg.created_at,
              text: clip(result.fullText),
            },
          },
        ])

        msgRepo.setPineconeVectorId(userMsg.id, `msg::${userMsg.id}`)
        msgRepo.setPineconeVectorId(assistantMsg.id, `msg::${assistantMsg.id}`)

        const turnProposals = proposalRepo.listPendingForMessage(
          assistantMsg.id,
          retrieval.proposal_confidence_threshold,
        )
        const turn: AssistantTurn = {
          message: assistantMsg,
          proposals: turnProposals,
          memories_captured: memoryCount,
        }
        sendStream({ type: 'complete', conversationId, turn })
        return turn
      } catch (err) {
        rollbackPartialTurn(msgRepo, memoryRepo, userMsg.id, assistantMessageId)
        const message = err instanceof Error ? err.message : String(err)
        sendStream({ type: 'error', conversationId, message })
        throw err
      }
    },
  )
}
