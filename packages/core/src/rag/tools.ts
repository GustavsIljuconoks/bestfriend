import type { ChatCompletionTool } from 'openai/resources/chat/completions'

const RECURRENCE_ENUM = ['one_off', 'daily', 'weekly', 'monthly'] as const

export const CHAT_FUNCTION_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'propose_reminder',
      description:
        'Propose a one-off or recurring reminder for the user. The user must accept it in the app before it is scheduled.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'due_at', 'timezone', 'recurrence', 'confidence'],
        properties: {
          title: { type: 'string' },
          due_at: {
            type: 'string',
            description: 'ISO 8601 local datetime without timezone offset',
          },
          timezone: { type: 'string', description: 'IANA timezone, e.g. Europe/Helsinki' },
          recurrence: { type: 'string', enum: [...RECURRENCE_ENUM] },
          notes: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_suggestion',
      description: 'Propose a suggested next action or follow-up for the user to confirm.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'confidence'],
        properties: {
          title: { type: 'string' },
          details: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_about_user',
      description:
        'Store one short durable fact about the user for personalization. Do not use for secrets.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['content', 'reason'],
        properties: {
          content: {
            type: 'string',
            description: 'One short fact about the user',
          },
          reason: { type: 'string', description: 'Why this fact is worth remembering' },
        },
      },
    },
  },
]
