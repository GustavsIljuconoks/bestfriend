import { useState } from 'react'
import { DotsThree, ArrowClockwise, Trash, Spinner } from '@phosphor-icons/react'
import type { DocumentSummary } from '@bestfriend/core'

interface DocumentRowProps {
  doc: DocumentSummary
  onReindex: (id: string) => void
  onRemove: (id: string) => void
  isReindexing: boolean
  isRemoving: boolean
}

function StatusBadge({ status }: { status: DocumentSummary['status'] }) {
  const map = {
    indexed: { label: 'Indexed', cls: 'badge--success' },
    indexing: { label: 'Indexing…', cls: 'badge--warning' },
    error: { label: 'Error', cls: 'badge--error' },
  }
  const { label, cls } = map[status]
  return <span className={`badge ${cls}`}>{label}</span>
}

function mimeIcon(mime: string): string {
  if (mime === 'text/markdown') return '↯'
  if (mime === 'text/plain') return '☰'
  if (mime === 'application/pdf') return '⬡'
  if (mime.startsWith('audio/')) return '♪'
  return '◻'
}

export function DocumentRow({
  doc,
  onReindex,
  onRemove,
  isReindexing,
  isRemoving,
}: DocumentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const busy = isReindexing || isRemoving || doc.status === 'indexing'

  return (
    <div className={`doc-row ${busy ? 'doc-row--busy' : ''}`}>
      <span className="doc-row-icon" aria-hidden>
        {doc.status === 'indexing' ? (
          <Spinner size={14} className="spin" />
        ) : (
          mimeIcon(doc.mime_type)
        )}
      </span>

      <div className="doc-row-info">
        <span className="doc-row-name">{doc.display_name}</span>
        <span className="doc-row-meta">
          {doc.chunk_count > 0 && `${doc.chunk_count} chunk${doc.chunk_count !== 1 ? 's' : ''}`}
          {doc.indexed_at && (
            <>
              {doc.chunk_count > 0 && ' · '}
              {new Date(doc.indexed_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </>
          )}
          {doc.error_message && (
            <span className="doc-row-error" title={doc.error_message}>
              {' · '}{doc.error_message.slice(0, 60)}
            </span>
          )}
        </span>
      </div>

      <StatusBadge status={doc.status} />

      <div className="doc-row-actions">
        <button
          className="icon-btn"
          title="More actions"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy}
        >
          <DotsThree size={16} weight="bold" />
        </button>
        {menuOpen && (
          <div className="doc-row-menu" onMouseLeave={() => setMenuOpen(false)}>
            <button
              className="doc-row-menu-item"
              onClick={() => {
                setMenuOpen(false)
                onReindex(doc.id)
              }}
              disabled={busy}
            >
              <ArrowClockwise size={14} />
              Reindex
            </button>
            <button
              className="doc-row-menu-item doc-row-menu-item--danger"
              onClick={() => {
                setMenuOpen(false)
                onRemove(doc.id)
              }}
              disabled={busy}
            >
              <Trash size={14} />
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
