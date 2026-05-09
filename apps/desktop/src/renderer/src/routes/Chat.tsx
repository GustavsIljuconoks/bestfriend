import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChatCircle,
  ChatsCircle,
  PaperPlaneRight,
  Plus,
  Books,
} from '@phosphor-icons/react'
import { MAX_CHAT_USER_MESSAGE_CHARS, type Message, type Proposal, type RetrievalTrace } from '@bestfriend/core'
import { SourcesDrawer } from '@renderer/components/chat/SourcesDrawer'
import { ProposalCard } from '@renderer/components/chat/ProposalCard'
import { AcceptReminderDialog } from '@renderer/components/chat/AcceptReminderDialog'
import { useChatStreamStore } from '@renderer/state/chatStreamStore'
import {
  useConversations,
  useMessages,
  useCreateConversation,
  useSendMessage,
  CONVERSATIONS_QUERY_KEY,
  messagesQueryKey,
} from '@renderer/state/queries/chat'
import { useCollections } from '@renderer/state/queries/library'
import {
  useProposals,
  useAcceptProposal,
  useRejectProposal,
  proposalsQueryKey,
} from '@renderer/state/queries/proposals'
import { MEMORIES_QUERY_KEY } from '@renderer/state/queries/memories'

function formatConvTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function MessageBubble({
  message,
  onShowSources,
  showSourcesAction,
  appendix,
}: {
  message: Message
  onShowSources: (trace: RetrievalTrace) => void
  showSourcesAction: boolean
  appendix?: ReactNode
}) {
  const isUser = message.role === 'user'
  return (
    <div className={`chat-message-row ${isUser ? 'chat-message-row-user' : 'chat-message-row-assistant'}`}>
      <div className={`chat-turn-stack${isUser ? ' chat-turn-stack-user' : ''}`}>
        <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
          <div className={isUser ? 'chat-bubble-text' : 'chat-bubble-text chat-bubble-text-serif'}>
            {message.content}
          </div>
          {!isUser && showSourcesAction && message.retrieval_trace ? (
            <button
              type="button"
              className="chat-sources-link"
              onClick={() => onShowSources(message.retrieval_trace!)}
            >
              <Books size={14} weight="regular" aria-hidden />
              Sources
            </button>
          ) : null}
        </div>
        {appendix}
      </div>
    </div>
  )
}

export function Chat() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeId = conversationId

  const { data: conversations = [], isLoading: convsLoading } = useConversations()
  const { data: messages = [], isLoading: msgsLoading } = useMessages(activeId)
  const { data: collections = [] } = useCollections()

  const createConversation = useCreateConversation()
  const sendMessage = useSendMessage(activeId)

  const streamingText = useChatStreamStore((s) => s.streamingText)
  const isStreaming = useChatStreamStore((s) => s.isStreaming)
  const streamConvId = useChatStreamStore((s) => s.activeConversationId)
  const streamingError = useChatStreamStore((s) => s.streamingError)
  const startStream = useChatStreamStore((s) => s.startStream)
  const endStream = useChatStreamStore((s) => s.endStream)

  const [draft, setDraft] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [scopeSelection, setScopeSelection] = useState<string[]>([])
  const [sourcesTrace, setSourcesTrace] = useState<RetrievalTrace | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [reminderTarget, setReminderTarget] = useState<Proposal | null>(null)

  const { data: proposals = [] } = useProposals(activeId)
  const acceptProposal = useAcceptProposal(activeId)
  const rejectProposal = useRejectProposal(activeId)

  const draftTooLong = draft.length > MAX_CHAT_USER_MESSAGE_CHARS

  useEffect(() => {
    if (!newOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setNewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newOpen])

  useEffect(() => {
    return window.api.onChatStream((ev) => {
      const st = useChatStreamStore.getState()
      if (ev.type === 'token') {
        st.appendToken(ev.conversationId, ev.text)
      } else if (ev.type === 'complete') {
        st.endStream()
        void queryClient.invalidateQueries({ queryKey: messagesQueryKey(ev.conversationId) })
        void queryClient.invalidateQueries({ queryKey: proposalsQueryKey(ev.conversationId) })
        void queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY })
        void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
      } else if (ev.type === 'error') {
        st.setError(ev.conversationId, ev.message)
        void queryClient.invalidateQueries({ queryKey: messagesQueryKey(ev.conversationId) })
      }
    })
  }, [queryClient])

  const showStreamingPlaceholder = Boolean(
    activeId && isStreaming && streamConvId === activeId,
  )

  const toggleScope = useCallback((id: string) => {
    setScopeSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  const openNewChat = useCallback(() => {
    setScopeSelection([])
    setNewOpen(true)
  }, [])

  const confirmNewChat = useCallback(() => {
    const ids = scopeSelection.length > 0 ? scopeSelection : undefined
    createConversation.mutate(ids, {
      onSuccess: ({ conversationId: id }) => {
        setNewOpen(false)
        navigate(`/chat/${id}`)
      },
    })
  }, [createConversation, navigate, scopeSelection])

  const onSubmit = useCallback(async () => {
    const text = draft.trim()
    if (!activeId || !text || draftTooLong || sendMessage.isPending || isStreaming) return
    setDraft('')
    startStream(activeId)
    try {
      await sendMessage.mutateAsync(text)
    } catch {
      endStream()
    }
  }, [activeId, draft, draftTooLong, sendMessage, isStreaming, startStream, endStream])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void onSubmit()
      }
    },
    [onSubmit],
  )

  const convSubtitle = useMemo(() => {
    const c = conversations.find((x) => x.id === activeId)
    if (!c) return ''
    if (c.scope_collection_ids.length === 0) return 'All collections'
    const names = c.scope_collection_ids
      .map((id) => collections.find((col) => col.id === id)?.name ?? id)
      .join(', ')
    return names
  }, [activeId, conversations, collections])

  return (
    <div className="chat-layout library-layout">
      <aside className="chat-sidebar" style={{ width: 280, flexShrink: 0 }}>
        <div className="library-toolbar" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="library-title" style={{ fontSize: 'var(--text-14)' }}>
            Conversations
          </h2>
          <div className="library-toolbar-actions">
            <button type="button" className="icon-btn" onClick={openNewChat} title="New chat">
              <Plus size={18} weight="regular" />
            </button>
          </div>
        </div>
        <div className="chat-conv-list doc-list">
          {convsLoading ? (
            <div className="library-loading">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="library-empty">
              <ChatsCircle size={40} weight="thin" />
              <p>No conversations yet</p>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chat-conv-row ${c.id === activeId ? 'chat-conv-row-active' : ''}`}
                onClick={() => navigate(`/chat/${c.id}`)}
              >
                <div className="chat-conv-row-title">{c.title}</div>
                <div className="chat-conv-row-meta">
                  {formatConvTime(c.last_message_at)} · {c.message_count} msgs
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="library-main chat-main">
        {!activeId ? (
          <div className="library-empty">
            <ChatCircle size={56} weight="thin" />
            <h2>New chat</h2>
            <p>Choose a conversation or start fresh with a scoped collection.</p>
            <div className="library-empty-actions">
              <button type="button" className="btn btn-primary" onClick={openNewChat}>
                New chat
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="chat-thread-header">
              <div>
                <h1 className="chat-thread-title">
                  {conversations.find((c) => c.id === activeId)?.title ?? 'Chat'}
                </h1>
                <p className="chat-thread-scope">{convSubtitle}</p>
              </div>
            </header>

            <div className="chat-messages">
              {msgsLoading ? (
                <div className="library-loading">Loading messages…</div>
              ) : (
                messages.map((m) => {
                  const forMsg = proposals.filter((p) => p.message_id === m.id)
                  const busy = acceptProposal.isPending || rejectProposal.isPending
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      onShowSources={(t) => {
                        setSourcesTrace(t)
                        setSourcesOpen(true)
                      }}
                      showSourcesAction={
                        m.role === 'assistant' &&
                        Boolean(
                          m.retrieval_trace &&
                            (m.retrieval_trace.docs_hits.length > 0 ||
                              m.retrieval_trace.chat_hits.length > 0),
                        )
                      }
                      appendix={
                        m.role === 'assistant' ? (
                          <>
                            {m.memories_captured > 0 ? (
                              <p className="chat-memory-hint" role="status">
                                Saved {m.memories_captured}{' '}
                                {m.memories_captured === 1 ? 'memory' : 'memories'} — view in
                                Settings.
                              </p>
                            ) : null}
                            {forMsg.map((p) => (
                              <ProposalCard
                                key={p.id}
                                proposal={p}
                                busy={busy}
                                onAcceptReminder={(prop) => setReminderTarget(prop)}
                                onAcceptSuggestion={(prop) => {
                                  void acceptProposal.mutateAsync({ proposalId: prop.id })
                                }}
                                onReject={(id) => rejectProposal.mutate(id)}
                              />
                            ))}
                          </>
                        ) : undefined
                      }
                    />
                  )
                })
              )}
              {showStreamingPlaceholder ? (
                <div className="chat-message-row chat-message-row-assistant">
                  <div className="chat-bubble chat-bubble-assistant">
                    <div className="chat-bubble-text chat-bubble-text-serif chat-streaming">
                      {streamingText}
                      <span className="chat-caret" aria-hidden />
                    </div>
                  </div>
                </div>
              ) : null}
              {streamingError && streamConvId === activeId ? (
                <div className="chat-error-banner">{streamingError}</div>
              ) : null}
            </div>

            <footer className="chat-composer-wrap">
              {draftTooLong ? (
                <p className="chat-composer-limit">
                  Message exceeds {MAX_CHAT_USER_MESSAGE_CHARS.toLocaleString()} characters.
                </p>
              ) : null}
              <div className="chat-composer">
                <textarea
                  className="chat-composer-input"
                  placeholder="Message… (Enter to send, Shift+Enter for newline)"
                  rows={3}
                  value={draft}
                  disabled={sendMessage.isPending || isStreaming}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                />
                <button
                  type="button"
                  className="chat-send-btn btn btn-primary"
                  disabled={
                    !draft.trim() || draftTooLong || sendMessage.isPending || isStreaming
                  }
                  onClick={() => void onSubmit()}
                  aria-label="Send message"
                >
                  <PaperPlaneRight size={20} weight="regular" />
                </button>
              </div>
            </footer>
          </>
        )}
      </div>

      {newOpen ? (
        <div className="sources-drawer-backdrop" role="presentation" onClick={() => setNewOpen(false)}>
          <div
            className="chat-new-modal"
            role="dialog"
            aria-labelledby="new-chat-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-chat-title" className="chat-new-title">
              New chat
            </h2>
            <p className="chat-new-desc">
              Scope to one or more collections, or leave empty to use all indexed documents.
            </p>
            <div className="chat-scope-chips">
              {collections.length === 0 ? (
                <span className="text-tertiary">No collections yet — indexing everything.</span>
              ) : (
                collections.map((col) => {
                  const on = scopeSelection.includes(col.id)
                  return (
                    <button
                      key={col.id}
                      type="button"
                      className={`chat-scope-chip ${on ? 'chat-scope-chip-on' : ''}`}
                      onClick={() => toggleScope(col.id)}
                    >
                      {col.name}
                    </button>
                  )
                })
              )}
            </div>
            <div className="chat-new-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setNewOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={createConversation.isPending}
                onClick={confirmNewChat}
              >
                Start
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SourcesDrawer
        open={sourcesOpen}
        trace={sourcesTrace}
        onClose={() => {
          setSourcesOpen(false)
          setSourcesTrace(null)
        }}
      />

      <AcceptReminderDialog
        open={reminderTarget !== null}
        payload={
          reminderTarget && reminderTarget.type === 'reminder' && 'due_at' in reminderTarget.payload
            ? reminderTarget.payload
            : null
        }
        isPending={acceptProposal.isPending}
        onClose={() => setReminderTarget(null)}
        onConfirm={(edited) => {
          if (!reminderTarget) return
          void acceptProposal
            .mutateAsync({ proposalId: reminderTarget.id, edited })
            .then(() => setReminderTarget(null))
        }}
      />
    </div>
  )
}
