import type OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'

export interface StreamChatResult {
  fullText: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  } | null
}

export interface RawToolCall {
  name: string
  arguments: string
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

export interface StreamChatWithToolsResult extends StreamChatResult {
  toolCalls: RawToolCall[]
}

const MAX_TOOL_ROUNDS = 6

export async function streamChatWithToolLoop(
  client: OpenAI,
  params: {
    model: string
    messages: ChatCompletionMessageParam[]
    tools: ChatCompletionTool[]
  },
  onDelta: (text: string) => void,
  onRoundUsage?: (usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }) => void,
): Promise<StreamChatWithToolsResult> {
  const messages: ChatCompletionMessageParam[] = [...params.messages]
  let fullText = ''
  const toolCalls: RawToolCall[] = []
  let combinedUsage: StreamChatResult['usage'] = null

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.chat.completions.stream({
      model: params.model,
      messages,
      tools: params.tools,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        fullText += delta
        onDelta(delta)
      }
    }

    const final = await stream.finalChatCompletion()
    const u = final.usage
    if (u) {
      const chunk = {
        prompt_tokens: u.prompt_tokens,
        completion_tokens: u.completion_tokens,
        total_tokens: u.total_tokens,
      }
      onRoundUsage?.(chunk)
      if (combinedUsage === null) {
        combinedUsage = { ...chunk }
      } else {
        combinedUsage = {
          prompt_tokens: combinedUsage.prompt_tokens + chunk.prompt_tokens,
          completion_tokens: combinedUsage.completion_tokens + chunk.completion_tokens,
          total_tokens: combinedUsage.total_tokens + chunk.total_tokens,
        }
      }
    }

    const choice = final.choices[0]
    const msg = choice?.message
    const finish = choice?.finish_reason

    if (finish === 'tool_calls' && msg?.tool_calls?.length) {
      messages.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      })
      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue
        toolCalls.push({
          name: tc.function.name,
          arguments: tc.function.arguments,
        })
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: '{"ok":true}',
        })
      }
      continue
    }

    return { fullText, usage: combinedUsage, toolCalls }
  }

  throw new Error(`Chat tool loop exceeded ${MAX_TOOL_ROUNDS} rounds`)
}
