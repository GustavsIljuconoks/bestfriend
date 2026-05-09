import { Pinecone } from '@pinecone-database/pinecone'
import { ProviderConfigError } from '../openai/client.js'

export function createPineconeClient(apiKey: string | null, strict = true): Pinecone {
  if (!apiKey) {
    if (strict) throw new ProviderConfigError('Pinecone API key is not configured')
    return new Pinecone({ apiKey: 'not-configured' })
  }
  return new Pinecone({ apiKey })
}
