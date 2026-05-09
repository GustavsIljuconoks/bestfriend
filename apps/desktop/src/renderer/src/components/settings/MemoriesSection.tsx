import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import type { Memory } from '@bestfriend/core'
import { useMemories, useUpdateMemory, usePinMemory, useDeleteMemory } from '@renderer/state/queries/memories'

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.7 }

function MemoryRow({ memory }: { memory: Memory }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(memory.content)
  const updateMem = useUpdateMemory()
  const pinMem = usePinMemory()
  const delMem = useDeleteMemory()

  useEffect(() => {
    setText(memory.content)
  }, [memory.content])

  return (
    <div className="memory-row">
      {editing ? (
        <textarea
          className="chat-composer-input memory-row-edit"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      ) : (
        <p className="memory-row-content">{memory.content}</p>
      )}
      <div className="memory-row-actions">
        {editing ? (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={updateMem.isPending}
              onClick={() => {
                setEditing(false)
                setText(memory.content)
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={updateMem.isPending || !text.trim()}
              onClick={() => {
                void updateMem.mutateAsync({ id: memory.id, content: text.trim() }).then(() => {
                  setEditing(false)
                })
              }}
            >
              Save
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`btn btn-ghost memory-pin ${memory.pinned ? 'memory-pin-on' : ''}`}
              onClick={() => pinMem.mutate({ id: memory.id, pinned: !memory.pinned })}
            >
              {memory.pinned ? 'Pinned' : 'Pin'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: 'var(--danger)' }}
              disabled={delMem.isPending}
              onClick={() => {
                if (window.confirm('Remove this memory? The assistant will be told not to re-add it.')) {
                  delMem.mutate(memory.id)
                }
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function MemoriesSection() {
  const { data: memories = [], isLoading, isError } = useMemories()

  return (
    <motion.section
      className="settings-section"
      aria-labelledby="memories-heading"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: 0.14 }}
    >
      <div className="settings-section-header">
        <h2 id="memories-heading" className="settings-section-title">
          Memories
        </h2>
      </div>
      <p className="settings-helper" style={{ marginBottom: 16 }}>
        Facts the assistant remembered from your chats. Deleted entries are suppressed in
        future tool calls.
      </p>
      {isLoading ? <div className="library-loading">Loading…</div> : null}
      {isError ? (
        <p className="settings-field-error" role="alert">
          Could not load memories.
        </p>
      ) : null}
      {!isLoading && !isError && memories.length === 0 ? (
        <p className="text-tertiary">No memories yet.</p>
      ) : null}
      <div className="memory-list">
        {memories.map((m) => (
          <MemoryRow key={m.id} memory={m} />
        ))}
      </div>
    </motion.section>
  )
}
