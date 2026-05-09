import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { DocumentSummary, Collection, IndexingEstimate } from '@bestfriend/core'

export const DOCUMENTS_QUERY_KEY = ['documents'] as const
export const COLLECTIONS_QUERY_KEY = ['collections'] as const

export function useDocuments(collectionId?: string) {
  return useQuery<DocumentSummary[]>({
    queryKey: collectionId ? [...DOCUMENTS_QUERY_KEY, collectionId] : DOCUMENTS_QUERY_KEY,
    queryFn: () => window.api.listDocuments(),
    staleTime: 5_000,
  })
}

export function useCollections() {
  return useQuery<Collection[]>({
    queryKey: COLLECTIONS_QUERY_KEY,
    queryFn: () => window.api.listCollections(),
    staleTime: 10_000,
  })
}

export function useDropFiles() {
  const queryClient = useQueryClient()
  return useMutation<{ jobId: string }, Error, string[]>({
    mutationFn: (paths) => window.api.dropFiles(paths),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
    },
  })
}

export function useEstimateFiles() {
  return useMutation<IndexingEstimate, Error, string[]>({
    mutationFn: (paths) => window.api.estimateFiles(paths),
  })
}

export function useRemoveDocument() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (documentId) => window.api.removeDocument(documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
    },
  })
}

export function useReindexDocument() {
  const queryClient = useQueryClient()
  return useMutation<{ jobId: string }, Error, string>({
    mutationFn: (documentId) => window.api.reindexDocument(documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
    },
  })
}

export function useCreateCollection() {
  const queryClient = useQueryClient()
  return useMutation<Collection, Error, { name: string; color?: string }>({
    mutationFn: ({ name, color }) => window.api.createCollection(name, color),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY })
    },
  })
}

export function useRenameCollection() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; name: string }>({
    mutationFn: ({ id, name }) => window.api.renameCollection(id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY })
    },
  })
}

export function useDeleteCollection() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => window.api.deleteCollection(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
    },
  })
}

export function useAssignDocumentToCollection() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { documentId: string; collectionId: string }>({
    mutationFn: ({ documentId, collectionId }) =>
      window.api.assignDocumentToCollection(documentId, collectionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
    },
  })
}

export function usePickFolder() {
  return useMutation<string | null, Error>({
    mutationFn: () => window.api.pickFolder(),
  })
}

export function useAddFolderIndex() {
  const queryClient = useQueryClient()
  return useMutation<{ indexId: string }, Error, string>({
    mutationFn: (path) => window.api.addFolderIndex(path),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
    },
  })
}

export function useScanFolder() {
  const queryClient = useQueryClient()
  return useMutation<{ jobId: string }, Error, string>({
    mutationFn: (indexId) => window.api.scanFolder(indexId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
    },
  })
}
