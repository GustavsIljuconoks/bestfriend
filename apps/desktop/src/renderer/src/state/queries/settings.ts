import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  MaskedSettings,
  SettingsPatch,
  TestConnectionsResult,
  CreatePineconeIndexResult,
} from '@bestfriend/core'

export const SETTINGS_QUERY_KEY = ['settings'] as const

export function useSettings() {
  return useQuery<MaskedSettings>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => window.api.getSettings(),
    staleTime: Infinity,
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation<MaskedSettings, Error, SettingsPatch>({
    mutationFn: (patch) => window.api.setSettings(patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, updated)
    },
  })
}

export function useTestConnections() {
  return useMutation<TestConnectionsResult, Error>({
    mutationFn: () => window.api.testConnections(),
  })
}

export function useCreatePineconeIndex() {
  return useMutation<CreatePineconeIndexResult, Error>({
    mutationFn: () => window.api.createPineconeIndex(),
  })
}
