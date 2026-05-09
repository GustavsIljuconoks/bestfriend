import { useState, useCallback, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  EMBEDDING_MODEL_CATALOG,
  CHAT_MODEL_OPTIONS,
  TRANSCRIPTION_MODEL_OPTIONS,
} from '@bestfriend/core'
import type { MaskedSettings, ModelSettings } from '@bestfriend/core'
import { useUpdateSettings } from '@renderer/state/queries/settings'

interface ModelsSectionProps {
  settings: MaskedSettings
}

type SavedState = 'idle' | 'saving' | 'saved' | 'error'

export function ModelsSection({ settings }: ModelsSectionProps) {
  const { mutateAsync, isPending } = useUpdateSettings()
  const [form, setForm] = useState<ModelSettings>(settings.models)
  const [savedState, setSavedState] = useState<SavedState>('idle')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    setForm(settings.models)
  }, [settings.models])

  const handleChange = useCallback(
    async (field: keyof ModelSettings, value: string) => {
      const updated: ModelSettings = { ...form, [field]: value }
      setForm(updated)
      setSavedState('saving')
      try {
        await mutateAsync({ models: updated })
        setSavedState('saved')
        setTimeout(() => setSavedState('idle'), 1200)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed')
        setSavedState('error')
      }
    },
    [form, mutateAsync],
  )

  return (
    <motion.section
      className="settings-section"
      aria-labelledby="models-heading"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.7, delay: 0.08 }}
    >
      <div className="settings-section-header">
        <h2 id="models-heading" className="settings-section-title">
          Models
        </h2>
        <div
          aria-live="polite"
          className={`settings-saved-indicator${savedState === 'saved' ? ' settings-saved-indicator--visible' : ''}`}
        >
          {savedState === 'saved' ? 'Saved' : ''}
        </div>
      </div>

      <div className="settings-fields">
        <div className="settings-field">
          <label className="settings-label" htmlFor="embeddings-model">
            Embeddings model
          </label>
          <select
            id="embeddings-model"
            className="settings-select"
            value={form.embeddings_model}
            onChange={(e) => handleChange('embeddings_model', e.target.value)}
            disabled={isPending}
          >
            {EMBEDDING_MODEL_CATALOG.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="settings-helper">
            Changing this requires reindexing all documents
          </p>
        </div>

        <div className="settings-field">
          <label className="settings-label" htmlFor="chat-model">
            Chat model
          </label>
          <select
            id="chat-model"
            className="settings-select"
            value={form.chat_model}
            onChange={(e) => handleChange('chat_model', e.target.value)}
            disabled={isPending}
          >
            {CHAT_MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-field">
          <label className="settings-label" htmlFor="transcription-model">
            Transcription model
          </label>
          <select
            id="transcription-model"
            className="settings-select"
            value={form.transcription_model}
            onChange={(e) => handleChange('transcription_model', e.target.value)}
            disabled={isPending}
          >
            {TRANSCRIPTION_MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="settings-helper">Used for voice captures in the Inbox</p>
        </div>

        {savedState === 'error' && saveError && (
          <p className="settings-field-error" role="alert">
            {saveError}
          </p>
        )}
      </div>
    </motion.section>
  )
}
