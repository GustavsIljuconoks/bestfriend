import type OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export interface StreamChatResult {
  fullText: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  } | null
}

export async function streamChatCompletion(
  client: OpenAI,
  params: {
    model: string
    messages: ChatCompletionMessageParam[]
  },
  onDelta: (text: string) => void,
): Promise<StreamChatResult> {
  const stream = client.chat.completions.stream({
    model: params.model,
    messages: params.messages,
    stream: true,
    stream_options: { include_usage: true },
  })

  let fullText = ''
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      fullText += delta
      onDelta(delta)
    }
  }

  const final = await stream.finalChatCompletion()
  const u = final.usage
  return {
    fullText,
    usage: u
      ? {
          prompt_tokens: u.prompt_tokens,
          completion_tokens: u.completion_tokens,
          total_tokens: u.total_tokens,
        }
      : null,
  }
}
