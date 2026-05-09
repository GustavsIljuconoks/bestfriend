import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@renderer/state/queryClient'
import { useUiStore } from '@renderer/state/uiStore'
import { useSettings } from '@renderer/state/queries/settings'
import { Sidebar } from '@renderer/components/Sidebar'
import { Library } from '@renderer/routes/Library'
import { Chat } from '@renderer/routes/Chat'
import { Feed } from '@renderer/routes/Feed'
import { Settings } from '@renderer/routes/Settings'
import { Inbox } from '@renderer/routes/Inbox'

function resolveTheme(
  stored: 'system' | 'light' | 'dark' | undefined,
  osDark: boolean,
): 'dark' | 'light' {
  if (stored === 'dark') return 'dark'
  if (stored === 'light') return 'light'
  return osDark ? 'dark' : 'light'
}

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme)
}

function ThemeSync() {
  const setTheme = useUiStore((s) => s.setTheme)
  const { data: settings } = useSettings()

  // Apply stored preference once settings load (overrides OS default)
  useEffect(() => {
    if (!settings) return
    const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const resolved = resolveTheme(settings.theme, osDark)
    applyTheme(resolved)
    setTheme(resolved)
  }, [settings?.theme, setTheme]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial OS-based theme before settings load + OS change listener
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    const handleOS = () => {
      // Only follow OS if preference is 'system' (or settings not yet loaded)
      const stored = queryClient.getQueryData<{ theme?: string }>(['settings'])?.theme
      if (!stored || stored === 'system') {
        const resolved = resolveTheme('system', mq.matches)
        applyTheme(resolved)
        setTheme(resolved)
      }
    }

    // Set initial before settings load
    handleOS()

    mq.addEventListener('change', handleOS)
    return () => mq.removeEventListener('change', handleOS)
  }, [setTheme])

  // Main-process theme:update (OS changes forwarded from nativeTheme)
  useEffect(() => {
    const handleTheme = (e: Event) => {
      const theme = (e as CustomEvent<'dark' | 'light'>).detail
      const stored = queryClient.getQueryData<{ theme?: string }>(['settings'])?.theme
      if (!stored || stored === 'system') {
        applyTheme(theme)
        setTheme(theme)
      }
    }
    window.addEventListener('theme:update', handleTheme)
    return () => window.removeEventListener('theme:update', handleTheme)
  }, [setTheme])

  return null
}

function SidebarToggleListener() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  useEffect(() => {
    window.addEventListener('menu:toggle-sidebar', toggleSidebar)
    return () => window.removeEventListener('menu:toggle-sidebar', toggleSidebar)
  }, [toggleSidebar])

  return null
}

function KeyboardShortcuts() {
  const navigate = useNavigate()
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return

      const routes: Record<string, string> = {
        '1': '/inbox',
        '2': '/library',
        '3': '/chat',
        '4': '/feed',
        ',': '/settings',
      }

      if (routes[e.key]) {
        e.preventDefault()
        navigate(routes[e.key])
        return
      }

      if (e.key === '\\') {
        e.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, toggleSidebar])

  return null
}

function AppShell() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="content-area">
        <Routes>
          <Route path="/" element={<Navigate to="/inbox" replace />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/library" element={<Library />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:conversationId" element={<Chat />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:section" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <SidebarToggleListener />
      <HashRouter>
        <KeyboardShortcuts />
        <AppShell />
      </HashRouter>
    </QueryClientProvider>
  )
}
