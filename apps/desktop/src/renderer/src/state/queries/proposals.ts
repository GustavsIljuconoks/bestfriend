import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Proposal, ReminderPayload } from '@bestfriend/core'
import { CONVERSATIONS_QUERY_KEY, messagesQueryKey } from './chat'

export const proposalsQueryKey = (conversationId: string) => ['proposals', conversationId] as const

export function useProposals(conversationId: string | undefined) {
  return useQuery<Proposal[]>({
    queryKey: conversationId ? proposalsQueryKey(conversationId) : ['proposals', 'none'],
    queryFn: () => window.api.listProposals(conversationId!),
    enabled: Boolean(conversationId),
    staleTime: 2_000,
  })
}

export function useAcceptProposal(conversationId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { proposalId: string; edited?: Partial<ReminderPayload> }>({
    mutationFn: ({ proposalId, edited }) => window.api.acceptProposal(proposalId, edited),
    onSuccess: () => {
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: proposalsQueryKey(conversationId) })
        void queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId) })
      }
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
    },
  })
}

export function useRejectProposal(conversationId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (proposalId) => window.api.rejectProposal(proposalId),
    onSuccess: () => {
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: proposalsQueryKey(conversationId) })
      }
    },
  })
}
