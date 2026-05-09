import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Memory } from '@bestfriend/core'

export const MEMORIES_QUERY_KEY = ['memories'] as const

export function useMemories() {
  return useQuery<Memory[]>({
    queryKey: MEMORIES_QUERY_KEY,
    queryFn: () => window.api.listMemories(),
    staleTime: 10_000,
  })
}

export function useUpdateMemory() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; content: string }>({
    mutationFn: ({ id, content }) => window.api.updateMemory(id, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY })
    },
  })
}

export function usePinMemory() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; pinned: boolean }>({
    mutationFn: ({ id, pinned }) => window.api.pinMemory(id, pinned),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY })
    },
  })
}

export function useDeleteMemory() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => window.api.deleteMemory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY })
    },
  })
}
