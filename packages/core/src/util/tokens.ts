/**
 * Rough token count estimate (~4 chars per token for English text).
 * Used for chunking decisions and cost estimation only — not billing-accurate.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimate tokens from raw byte count (assumes UTF-8 English text).
 */
export function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes / 4)
}

/** Estimate embedding cost in USD for a given token count. */
export function estimateEmbeddingCostUsd(
  tokens: number,
  model = 'text-embedding-3-small',
): number {
  const pricePerMillion: Record<string, number> = {
    'text-embedding-3-small': 0.02,
    'text-embedding-3-large': 0.13,
    'text-embedding-ada-002': 0.1,
  }
  const price = pricePerMillion[model] ?? 0.02
  return (tokens / 1_000_000) * price
}
