import OpenAI from 'openai'

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderConfigError'
  }
}

/**
 * Creates an OpenAI client. Throws ProviderConfigError if apiKey is null/empty
 * and strict=true (default). Pass strict=false to get a stub client that will
 * fail on actual API calls — useful for constructing before keys are available.
 */
export function createOpenAIClient(apiKey: string | null, strict = true): OpenAI {
  if (!apiKey) {
    if (strict) throw new ProviderConfigError('OpenAI API key is not configured')
    return new OpenAI({ apiKey: 'not-configured' })
  }
  return new OpenAI({ apiKey })
}
