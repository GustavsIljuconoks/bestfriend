import { useState } from 'react'
import { Plus, Folder, FolderOpen, Trash, PencilSimple, Check, X } from '@phosphor-icons/react'
import type { Collection } from '@bestfriend/core'

interface CollectionsSidebarProps {
  collections: Collection[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function CollectionsSidebar({
  collections,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: CollectionsSidebarProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreate = () => {
    const trimmed = newName.trim()
    if (trimmed) {
      onCreate(trimmed)
      setNewName('')
    }
    setCreating(false)
  }

  const handleStartEdit = (col: Collection) => {
    setEditingId(col.id)
    setEditName(col.name)
  }

  const handleConfirmEdit = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
  }

  return (
    <aside className="collections-sidebar">
      <div className="collections-header">
        <span className="collections-title">Collections</span>
        <button
          className="icon-btn"
          title="New collection"
          onClick={() => {
            setCreating(true)
            setNewName('')
          }}
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>

      <nav className="collections-list">
        <button
          className={`collection-item ${selectedId === null ? 'collection-item--active' : ''}`}
          onClick={() => onSelect(null)}
        >
          <Folder size={15} weight={selectedId === null ? 'duotone' : 'regular'} />
          <span>All Documents</span>
        </button>

        {collections.map((col) =>
          editingId === col.id ? (
            <div key={col.id} className="collection-item collection-item--editing">
              <input
                className="collection-edit-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmEdit()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                autoFocus
              />
              <button className="icon-btn" onClick={handleConfirmEdit}>
                <Check size={12} weight="bold" />
              </button>
              <button className="icon-btn" onClick={() => setEditingId(null)}>
                <X size={12} weight="bold" />
              </button>
            </div>
          ) : (
            <div key={col.id} className="collection-item-wrapper">
              <button
                className={`collection-item ${selectedId === col.id ? 'collection-item--active' : ''}`}
                onClick={() => onSelect(col.id)}
              >
                {selectedId === col.id ? (
                  <FolderOpen size={15} weight="duotone" style={{ color: col.color ?? 'var(--accent)' }} />
                ) : (
                  <Folder size={15} weight="regular" style={{ color: col.color ?? undefined }} />
                )}
                <span className="collection-item-name">{col.name}</span>
              </button>
              <div className="collection-item-actions">
                <button
                  className="icon-btn icon-btn--sm"
                  title="Rename"
                  onClick={() => handleStartEdit(col)}
                >
                  <PencilSimple size={12} />
                </button>
                <button
                  className="icon-btn icon-btn--sm icon-btn--danger"
                  title="Delete collection"
                  onClick={() => onDelete(col.id)}
                >
                  <Trash size={12} />
                </button>
              </div>
            </div>
          ),
        )}

        {creating && (
          <div className="collection-item collection-item--new">
            <input
              className="collection-edit-input"
              placeholder="Collection name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
              autoFocus
            />
            <button className="icon-btn" onClick={handleCreate}>
              <Check size={12} weight="bold" />
            </button>
            <button className="icon-btn" onClick={() => setCreating(false)}>
              <X size={12} weight="bold" />
            </button>
          </div>
        )}
      </nav>
    </aside>
  )
}
