import { X } from '@phosphor-icons/react'
import type { RetrievalTrace } from '@bestfriend/core'

interface SourcesDrawerProps {
  open: boolean
  trace: RetrievalTrace | null
  onClose: () => void
}

export function SourcesDrawer({ open, trace, onClose }: SourcesDrawerProps) {
  if (!open || !trace) return null

  const hasDocs = trace.docs_hits.length > 0
  const hasChat = trace.chat_hits.length > 0

  return (
    <div className="sources-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="sources-drawer"
        role="dialog"
        aria-labelledby="sources-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sources-drawer-header">
          <h2 id="sources-drawer-title" className="sources-drawer-title">
            Sources
          </h2>
          <button type="button" className="sources-drawer-close" onClick={onClose} aria-label="Close">
            <X size={20} weight="regular" />
          </button>
        </header>
        <div className="sources-drawer-body">
          {!hasDocs && !hasChat ? (
            <p className="sources-drawer-empty">No retrieved sources for this reply.</p>
          ) : null}
          {hasDocs ? (
            <section className="sources-section">
              <h3 className="sources-section-title">Documents</h3>
              <ul className="sources-list">
                {trace.docs_hits.map((h) => (
                  <li key={h.chunk_id} className="sources-item">
                    <div className="sources-item-meta">
                      <span className="sources-item-label sources-mono">
                        {h.document_name}#{h.chunk_index}
                      </span>
                      <span className="sources-item-score">{h.score.toFixed(4)}</span>
                    </div>
                    <p className="sources-item-text">{h.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {hasChat ? (
            <section className="sources-section">
              <h3 className="sources-section-title">Past chats</h3>
              <ul className="sources-list">
                {trace.chat_hits.map((h) => (
                  <li key={h.message_id} className="sources-item">
                    <div className="sources-item-meta">
                      <span className="sources-item-label">
                        {h.conversation_title} · {h.role}
                      </span>
                      <span className="sources-item-score">{h.score.toFixed(4)}</span>
                    </div>
                    <p className="sources-item-text">{h.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
