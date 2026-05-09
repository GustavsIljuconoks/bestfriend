import type OpenAI from 'openai'

export interface EmbedBatchResult {
  embeddings: number[][]
  total_tokens: number
}

export async function embedBatch(
  client: OpenAI,
  texts: string[],
  model = 'text-embedding-3-small',
): Promise<EmbedBatchResult> {
  if (texts.length === 0) return { embeddings: [], total_tokens: 0 }

  const response = await client.embeddings.create({ input: texts, model })

  const ordered = [...response.data].sort((a, b) => a.index - b.index)
  return {
    embeddings: ordered.map((item) => item.embedding),
    total_tokens: response.usage.total_tokens,
  }
}

export async function embedSingle(
  client: OpenAI,
  text: string,
  model = 'text-embedding-3-small',
): Promise<number[]> {
  const result = await embedBatch(client, [text], model)
  return result.embeddings[0] ?? []
}
