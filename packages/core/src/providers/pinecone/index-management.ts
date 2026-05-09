import type { CreatePineconeIndexResult } from '../../domain/types.js'
import { DEFAULT_PINECONE_INDEX_NAME } from '../../domain/models-catalog.js'
import { createPineconeClient } from './client.js'

export async function createIndexIfMissing(
  apiKey: string,
  indexName: string = DEFAULT_PINECONE_INDEX_NAME,
  dimension: number = 1536,
  metric: 'cosine' | 'euclidean' | 'dotproduct' = 'cosine',
): Promise<CreatePineconeIndexResult> {
  try {
    const client = createPineconeClient(apiKey)
    const existing = await client.listIndexes()
    const exists = existing.indexes?.some((idx) => idx.name === indexName) ?? false

    if (exists) {
      return { created: false, existed: true, dimension, error: null }
    }

    await client.createIndex({
      name: indexName,
      dimension,
      metric,
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    })

    return { created: true, existed: false, dimension, error: null }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    return { created: false, existed: false, dimension, error }
  }
}

export async function pineconeIndexExists(
  apiKey: string,
  indexName: string = DEFAULT_PINECONE_INDEX_NAME,
): Promise<boolean> {
  try {
    const client = createPineconeClient(apiKey)
    const existing = await client.listIndexes()
    return existing.indexes?.some((idx) => idx.name === indexName) ?? false
  } catch {
    return false
  }
}
