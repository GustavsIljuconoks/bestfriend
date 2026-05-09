import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConversationSummary, Message } from '@bestfriend/core'

export const CONVERSATIONS_QUERY_KEY = ['conversations'] as const

export function messagesQueryKey(conversationId: string) {
  return ['messages', conversationId] as const
}

export function useConversations() {
  return useQuery<ConversationSummary[]>({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: () => window.api.listConversations(),
    staleTime: 5_000,
  })
}

export function useMessages(conversationId: string | undefined) {
  return useQuery<Message[]>({
    queryKey: conversationId ? messagesQueryKey(conversationId) : ['messages', 'none'],
    queryFn: () => window.api.listMessages(conversationId!),
    enabled: Boolean(conversationId),
    staleTime: 2_000,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()
  return useMutation<{ conversationId: string }, Error, string[] | undefined>({
    mutationFn: (scopeCollectionIds) =>
      window.api.createConversation(
        scopeCollectionIds && scopeCollectionIds.length > 0 ? scopeCollectionIds : undefined,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
    },
  })
}

export function useSendMessage(conversationId: string | undefined) {
  return useMutation<void, Error, string>({
    mutationFn: async (text: string) => {
      if (!conversationId) throw new Error('No active conversation')
      await window.api.sendMessage(conversationId, text)
    },
  })
}
