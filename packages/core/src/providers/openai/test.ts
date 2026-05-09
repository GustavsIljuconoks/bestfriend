import type { ServiceStatus } from '../../domain/types.js'
import { createOpenAIClient } from './client.js'

/**
 * Tests an OpenAI API key by listing models.
 * Returns ServiceStatus with ok/error/latency_ms.
 */
export async function testOpenAIKey(apiKey: string): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const client = createOpenAIClient(apiKey)
    await client.models.list()
    return { ok: true, error: null, latency_ms: Date.now() - start }
  } catch (err: unknown) {
    return {
      ok: false,
      error: normalizeOpenAIError(err),
      latency_ms: Date.now() - start,
    }
  }
}

function normalizeOpenAIError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message
    if (msg.includes('401') || msg.includes('Incorrect API key')) return 'Invalid API key'
    if (msg.includes('429')) return 'Rate limit exceeded'
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) return 'Network error — check your connection'
    return msg
  }
  return String(err)
}
