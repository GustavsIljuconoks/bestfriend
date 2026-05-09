import { create } from 'zustand'

interface UiState {
  sidebarCollapsed: boolean
  theme: 'dark' | 'light'
  toggleSidebar: () => void
  setTheme: (theme: 'dark' | 'light') => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  theme: 'dark',
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTheme: (theme) => set({ theme }),
}))
