import { create } from 'zustand'

interface ChatStreamState {
  activeConversationId: string | null
  streamingText: string
  isStreaming: boolean
  streamingError: string | null
  startStream: (conversationId: string) => void
  appendToken: (conversationId: string, text: string) => void
  endStream: () => void
  setError: (conversationId: string, message: string) => void
}

export const useChatStreamStore = create<ChatStreamState>((set) => ({
  activeConversationId: null,
  streamingText: '',
  isStreaming: false,
  streamingError: null,
  startStream: (conversationId) =>
    set({
      activeConversationId: conversationId,
      streamingText: '',
      isStreaming: true,
      streamingError: null,
    }),
  appendToken: (conversationId, text) =>
    set((s) => {
      if (s.activeConversationId !== conversationId) return s
      return { streamingText: s.streamingText + text }
    }),
  endStream: () =>
    set({
      isStreaming: false,
      streamingText: '',
      activeConversationId: null,
      streamingError: null,
    }),
  setError: (conversationId, message) =>
    set((s) =>
      s.activeConversationId === conversationId
        ? { isStreaming: false, streamingError: message, streamingText: '' }
        : s,
    ),
}))
