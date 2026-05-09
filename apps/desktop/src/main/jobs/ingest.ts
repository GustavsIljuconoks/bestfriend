import { statSync } from 'fs'
import { basename } from 'path'
import type Database from 'better-sqlite3'
import {
  parseTextFile,
  chunkDocument,
  sha256File,
  mimeFromPath,
  isTextMime,
  isSupportedMime,
  estimateTokensFromBytes,
  estimateEmbeddingCostUsd,
  createOpenAIClient,
  embedBatch,
  createPineconeClient,
  upsertVectors,
  deleteVectorsByIds,
  DEFAULT_PINECONE_INDEX_NAME,
  EMBEDDING_MODEL_CATALOG,
} from '@bestfriend/core'
import type { IndexingEstimate } from '@bestfriend/core'
import { DocumentRepo } from '../db/repos/DocumentRepo.js'
import { ChunkRepo } from '../db/repos/ChunkRepo.js'
import { CollectionRepo } from '../db/repos/CollectionRepo.js'
import { UsageLedgerRepo } from '../db/repos/UsageLedgerRepo.js'
import { SettingsRepo } from '../db/repos/SettingsRepo.js'
import { retrieveKey } from '../security/safeStorage.js'
import type { ProgressCallback } from './JobQueue.js'

const EMBED_BATCH_SIZE = 96

export function estimateFilePaths(db: Database.Database, paths: string[]): IndexingEstimate {
  const settingsRepo = new SettingsRepo(db)
  const { models, spend } = settingsRepo.loadNonSecretSettings()

  let totalTokens = 0
  let fileCount = 0

  for (const p of paths) {
    try {
      const mime = mimeFromPath(p)
      if (!isSupportedMime(mime)) continue
      if (!isTextMime(mime)) continue
      const stat = statSync(p)
      totalTokens += estimateTokensFromBytes(stat.size)
      fileCount++
    } catch {
      // skip inaccessible files
    }
  }

  const catalogEntry = EMBEDDING_MODEL_CATALOG.find((e) => e.id === models.embeddings_model)
  const chunkSize = 400
  const estimatedChunks = Math.ceil(totalTokens / chunkSize)
  const estimatedCost = estimateEmbeddingCostUsd(totalTokens, catalogEntry?.id)

  return {
    file_count: fileCount,
    estimated_chunks: estimatedChunks,
    estimated_cost_usd: estimatedCost,
    exceeds_threshold: estimatedCost > spend.confirm_threshold_usd,
  }
}

export async function ingestFiles(
  db: Database.Database,
  paths: string[],
  onProgress: ProgressCallback,
): Promise<void> {
  const docRepo = new DocumentRepo(db)
  const chunkRepo = new ChunkRepo(db)
  const collectionRepo = new CollectionRepo(db)
  const ledgerRepo = new UsageLedgerRepo(db)
  const settingsRepo = new SettingsRepo(db)

  const openaiKey = retrieveKey('openai')
  const pineconeKey = retrieveKey('pinecone')

  if (!openaiKey) throw new Error('OpenAI API key is not configured')
  if (!pineconeKey) throw new Error('Pinecone API key is not configured')

  const openai = createOpenAIClient(openaiKey)
  const pinecone = createPineconeClient(pineconeKey)
  const pineconeIndex = pinecone.index(DEFAULT_PINECONE_INDEX_NAME)

  const supportedPaths = paths.filter((p) => {
    try {
      return isTextMime(mimeFromPath(p))
    } catch {
      return false
    }
  })

  const total = supportedPaths.length
  let processed = 0
  let estimatedCostSoFar = 0

  onProgress({ current: 0, total, phase: 'starting', estimated_cost_usd: 0 })

  for (const filePath of supportedPaths) {
    const { models, spend, retrieval } = settingsRepo.loadNonSecretSettings()
    const catalogEntry = EMBEDDING_MODEL_CATALOG.find((e) => e.id === models.embeddings_model)
    const embeddingModel = catalogEntry?.id ?? 'text-embedding-3-small'

    // Check daily spend cap before each file
    const todaySpend = ledgerRepo.todayTotalUsd()
    if (spend.daily_cap_usd > 0 && todaySpend >= spend.daily_cap_usd) {
      throw new Error(
        `Daily spend cap of $${spend.daily_cap_usd.toFixed(2)} reached ($${todaySpend.toFixed(2)} spent today). ${total - processed} file(s) skipped.`,
      )
    }

    onProgress({
      current: processed,
      total,
      phase: `parsing ${basename(filePath)}`,
      estimated_cost_usd: estimatedCostSoFar,
    })

    try {
      const mime = mimeFromPath(filePath)
      const stat = statSync(filePath)
      const sha256 = sha256File(filePath)

      // Check if already indexed with same sha256
      const existing = docRepo.getBySourceUri(filePath)
      if (existing?.sha256 === sha256 && existing.status === 'indexed') {
        processed++
        continue
      }

      // Create or reuse document record
      let doc = existing
      if (!doc) {
        doc = docRepo.create({
          sourceType: 'drop',
          sourceUri: filePath,
          displayName: basename(filePath),
          mimeType: mime,
          sha256,
          bytes: stat.size,
        })
      } else {
        docRepo.markIndexing(doc.id)
        docRepo.updateSha256(doc.id, sha256, stat.size)
        const oldVectorIds = chunkRepo.getPineconeVectorIds(doc.id)
        if (oldVectorIds.length > 0) {
          await deleteVectorsByIds(pineconeIndex, 'docs', oldVectorIds)
        }
        chunkRepo.deleteByDocument(doc.id)
      }

      const documentText = parseTextFile(filePath, doc.id)

      const rawChunks = chunkDocument({
        documentId: doc.id,
        fullText: documentText.fullText,
        targetChunkTokens: retrieval.chunk_size_tokens,
        overlapTokens: retrieval.chunk_overlap_tokens,
      })

      if (rawChunks.length === 0) {
        docRepo.markIndexed(doc.id)
        processed++
        continue
      }

      const persistedChunks = chunkRepo.insertBatch(
        rawChunks.map((c) => ({
          documentId: c.documentId,
          chunkIndex: c.chunkIndex,
          chunkText: c.chunkText,
          tokenCountEstimate: c.tokenCountEstimate,
        })),
      )

      const collectionIds = collectionRepo.getCollectionIdsForDocument(doc.id)

      for (let i = 0; i < persistedChunks.length; i += EMBED_BATCH_SIZE) {
        onProgress({
          current: processed,
          total,
          phase: `embedding ${basename(filePath)} ${i + 1}–${Math.min(i + EMBED_BATCH_SIZE, persistedChunks.length)}/${persistedChunks.length}`,
          estimated_cost_usd: estimatedCostSoFar,
        })

        const batchChunks = persistedChunks.slice(i, i + EMBED_BATCH_SIZE)
        const texts = batchChunks.map((c) => c.chunk_text)

        const embedResult = await embedBatch(openai, texts, embeddingModel)
        const batchCost = estimateEmbeddingCostUsd(embedResult.total_tokens, embeddingModel)
        estimatedCostSoFar += batchCost

        ledgerRepo.record({
          provider: 'openai',
          kind: 'embed',
          tokens_in: embedResult.total_tokens,
          tokens_out: null,
          units: null,
          est_cost_usd: batchCost,
        })

        const vectors = batchChunks.map((chunk, idx) => ({
          id: `chunk::${chunk.id}`,
          embedding: embedResult.embeddings[idx],
          metadata: {
            chunk_id: chunk.id,
            document_id: doc!.id,
            chunk_index: chunk.chunk_index,
            filename: basename(filePath),
            source_uri: filePath,
            mime_type: mime,
            sha256,
            text: chunk.chunk_text,
            collection_ids: collectionIds,
          },
        }))

        await upsertVectors(pineconeIndex, 'docs', vectors)

        for (const chunk of batchChunks) {
          chunkRepo.setPineconeVectorId(chunk.id, `chunk::${chunk.id}`)
        }
      }

      docRepo.markIndexed(doc.id)
    } catch (err) {
      const existing = docRepo.getBySourceUri(filePath)
      if (existing) {
        docRepo.markError(existing.id, err instanceof Error ? err.message : String(err))
      }
    }

    processed++
    onProgress({
      current: processed,
      total,
      phase: processed === total ? 'done' : `processed ${processed}/${total}`,
      estimated_cost_usd: estimatedCostSoFar,
    })
  }
}

export async function removeDocumentVectors(
  db: Database.Database,
  documentId: string,
): Promise<void> {
  const chunkRepo = new ChunkRepo(db)
  const pineconeKey = retrieveKey('pinecone')
  if (!pineconeKey) return

  const vectorIds = chunkRepo.getPineconeVectorIds(documentId)
  if (vectorIds.length === 0) return

  try {
    const pinecone = createPineconeClient(pineconeKey)
    const index = pinecone.index(DEFAULT_PINECONE_INDEX_NAME)
    await deleteVectorsByIds(index, 'docs', vectorIds)
  } catch (err) {
    console.error('[ingest] Failed to delete Pinecone vectors:', err)
  }
}
