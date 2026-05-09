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

/** Estimate chat completion cost in USD from token counts (~OpenAI list prices, subject to change). */
export function estimateChatCompletionCostUsd(
  promptTokens: number,
  completionTokens: number,
  model: string,
): number {
  const perMillion: Record<string, { in: number; out: number }> = {
    'gpt-4o': { in: 2.5, out: 10 },
    'gpt-4o-mini': { in: 0.15, out: 0.6 },
    'gpt-4.1': { in: 2.0, out: 8.0 },
    'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  }
  const p = perMillion[model] ?? { in: 2.5, out: 10 }
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out
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
