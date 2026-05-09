import type { ServiceStatus } from '../../domain/types.js'
import { createPineconeClient } from './client.js'

export async function testPineconeKey(apiKey: string): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const client = createPineconeClient(apiKey)
    await client.listIndexes()
    return { ok: true, error: null, latency_ms: Date.now() - start }
  } catch (err: unknown) {
    return {
      ok: false,
      error: normalizePineconeError(err),
      latency_ms: Date.now() - start,
    }
  }
}

function normalizePineconeError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message
    if (msg.includes('401') || msg.includes('Unauthorized')) return 'Invalid API key'
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) return 'Network error — check your connection'
    return msg
  }
  return String(err)
}
