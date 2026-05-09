---
name: "react-electron"
description: "Use when building React components in the Bestfriend Electron renderer: TanStack Query patterns for IPC-backed data, Zustand store design, streaming chat token rendering, optimistic updates, code splitting with React.lazy, error boundaries, IPC subscription/unsubscription patterns, and avoiding common pitfalls when React runs inside Electron. Invoke for any component in apps/desktop/src/renderer/."
---

# React + Electron Renderer Patterns — Bestfriend Project

Patterns specific to building React inside an Electron renderer process. The renderer is sandboxed (no Node.js, no direct network) — all data flows through `window.api.*`.

## TanStack Query — IPC-Backed Data

```typescript
// queryClient.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // IPC data is fast; 30s stale is fine
      gcTime: 5 * 60_000,      // keep unused queries in cache 5 minutes
      retry: (count, err) => count < 2 && !isAuthError(err),
    },
  },
})

// Key conventions: ['entity', ...identifiers?, filter?]
const QUERY_KEYS = {
  documents: () => ['documents'] as const,
  conversations: () => ['conversations'] as const,
  messages: (convId: string) => ['messages', convId] as const,
  proposals: (convId: string) => ['proposals', convId] as const,
  feedItems: () => ['feed-items'] as const,
  inbox: () => ['inbox'] as const,
  reminders: () => ['reminders'] as const,
  settings: () => ['settings'] as const,
  memories: () => ['memories'] as const,
}

// Fetch pattern: always return typed data from window.api
function useDocuments() {
  return useQuery({
    queryKey: QUERY_KEYS.documents(),
    queryFn: () => window.api.listDocuments(),
  })
}

// Mutation pattern: invalidate after success
function useAcceptProposal() {
  return useMutation({
    mutationFn: (proposalId: string) => window.api.acceptProposal(proposalId),
    onSuccess: (_, __, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.proposals(conversationId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reminders() })
    },
  })
}
```

## Zustand — Local UI State

```typescript
// state/stores/chatStore.ts
// Rule: Zustand only for state that does NOT belong on the server (IPC)

interface ChatStore {
  activeConversationId: string | null
  streamingBuffer: string          // tokens accumulating from current stream
  isStreaming: boolean
  sourcesDrawerOpen: boolean
  setActiveConversation: (id: string) => void
  appendToken: (token: string) => void
  clearStream: () => void
  toggleSourcesDrawer: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  activeConversationId: null,
  streamingBuffer: '',
  isStreaming: false,
  sourcesDrawerOpen: false,
  setActiveConversation: (id) => set({ activeConversationId: id, streamingBuffer: '' }),
  appendToken: (token) => set((s) => ({ streamingBuffer: s.streamingBuffer + token, isStreaming: true })),
  clearStream: () => set({ streamingBuffer: '', isStreaming: false }),
  toggleSourcesDrawer: () => set((s) => ({ sourcesDrawerOpen: !s.sourcesDrawerOpen })),
}))
```

## Streaming Chat — IPC Event Subscription

```typescript
// Key pattern: subscribe in useEffect, unsubscribe on cleanup
function useStreamingTokens(conversationId: string) {
  const appendToken = useChatStore(s => s.appendToken)
  const clearStream = useChatStore(s => s.clearStream)

  useEffect(() => {
    // window.api.onChatToken returns an unsubscribe function
    const unsub = window.api.onChatToken(conversationId, (token: string) => {
      appendToken(token)
    })
    const unsubDone = window.api.onChatDone(conversationId, () => {
      clearStream()
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['proposals', conversationId] })
    })
    return () => { unsub(); unsubDone() }
  }, [conversationId])
}

// Streaming message component — no per-token re-render of full list
function StreamingAssistantMessage() {
  // Use a selector that only subscribes to the buffer slice
  const buffer = useChatStore(s => s.streamingBuffer)
  const isStreaming = useChatStore(s => s.isStreaming)
  if (!isStreaming && !buffer) return null
  return <div className="message assistant streaming">{buffer}<span className="caret" /></div>
}
```

## Optimistic Updates

```typescript
// Mark feed item read instantly, rollback on error
function useMarkFeedRead() {
  return useMutation({
    mutationFn: (itemId: string) => window.api.markFeedRead(itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.feedItems() })
      const prev = queryClient.getQueryData(QUERY_KEYS.feedItems())
      queryClient.setQueryData(QUERY_KEYS.feedItems(), (old: FeedItem[]) =>
        old?.map(item => item.id === itemId ? { ...item, read_at: new Date().toISOString() } : item)
      )
      return { prev }
    },
    onError: (_, __, ctx) => queryClient.setQueryData(QUERY_KEYS.feedItems(), ctx?.prev),
  })
}
```

## Code Splitting — Route-Level Lazy Loading

```typescript
// renderer/main.tsx
const Library = React.lazy(() => import('./routes/Library'))
const Chat = React.lazy(() => import('./routes/Chat'))
const Feed = React.lazy(() => import('./routes/Feed'))
const Settings = React.lazy(() => import('./routes/Settings'))
const Inbox = React.lazy(() => import('./routes/Inbox'))

// Route wrapper with Suspense
<Suspense fallback={<SkeletonScreen />}>
  <Routes>
    <Route path="/library" element={<Library />} />
    <Route path="/chat/:id?" element={<Chat />} />
    <Route path="/feed" element={<Feed />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/inbox" element={<Inbox />} />
  </Routes>
</Suspense>
```

## Error Boundaries

```typescript
// Wrap each major route — IPC failures should degrade gracefully
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div className="error-state">
          <p>Something went wrong: {error.message}</p>
          <button onClick={resetErrorBoundary}>Try again</button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
```

## Virtual Lists for Long Datasets

```typescript
// Use @tanstack/virtual for document list, message history when > 100 items
import { useVirtualizer } from '@tanstack/react-virtual'

function DocumentList({ documents }: { documents: DocumentSummary[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: documents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,  // list item row height
  })
  return (
    <div ref={parentRef} className="list-container">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(vItem => (
          <DocumentRow
            key={vItem.key}
            style={{ transform: `translateY(${vItem.start}px)` }}
            document={documents[vItem.index]}
          />
        ))}
      </div>
    </div>
  )
}
```

## Common Electron + React Pitfalls

| Pitfall | Fix |
|---|---|
| `window.require` in renderer | Disabled — use `window.api.*` instead |
| `fetch('http://localhost:...')` | Never — use `window.api.*` IPC |
| Accessing `process.env` in renderer | Only VITE_* vars are available via `import.meta.env` |
| `__dirname` in renderer | Not available — paths live in main process only |
| Event listener leak on IPC | Always return unsubscribe from `useEffect` |
| Large query returning secret data | IPC handler must filter before returning |
| Zustand state not resetting on window reload | Reset stores on `'did-finish-load'` event |

## Performance Rules

- `React.memo` on: `DocumentRow`, `FeedItem`, `ConversationRow`, `MessageBubble`
- `useCallback` wrapping: event handlers passed as props to memo'd children
- No per-token state updates in parent — buffer in Zustand, render in isolated component
- Parallel IPC calls: `Promise.all([api.listConversations(), api.listDocuments()])` on mount
- Avoid `useEffect` dependency on object references — use primitive keys or stable refs
