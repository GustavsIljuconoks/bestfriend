import type { Index, RecordMetadata } from '@pinecone-database/pinecone'

export type PineconeMetadataValue = string | number | boolean | string[]

export interface VectorRecord {
  id: string
  embedding: number[]
  metadata: Record<string, PineconeMetadataValue>
}

const UPSERT_BATCH_SIZE = 100
const DELETE_BATCH_SIZE = 1000

export async function upsertVectors(
  index: Index<RecordMetadata>,
  namespace: string,
  vectors: VectorRecord[],
): Promise<void> {
  if (vectors.length === 0) return

  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE)
    await index.namespace(namespace).upsert({
      records: batch.map((v) => ({
        id: v.id,
        values: v.embedding,
        metadata: v.metadata,
      })),
    })
  }
}

export async function deleteVectorsByIds(
  index: Index<RecordMetadata>,
  namespace: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return

  for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    const batch = ids.slice(i, i + DELETE_BATCH_SIZE)
    await index.namespace(namespace).deleteMany({ ids: batch })
  }
}
