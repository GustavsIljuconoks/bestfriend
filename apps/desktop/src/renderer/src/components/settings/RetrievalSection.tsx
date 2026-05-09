import { useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import type { MaskedSettings, RetrievalSettings, SettingsPatch } from '@bestfriend/core'
import { useUpdateSettings } from '@renderer/state/queries/settings'

interface RetrievalSectionProps {
  settings: MaskedSettings
}

type SavedState = 'idle' | 'saving' | 'saved' | 'error'

interface NumberFieldProps {
  id: string
  label: string
  helper?: string
  value: number
  min?: number
  max?: number
  disabled: boolean
  onChange: (value: number) => void
  onBlur: () => void
}

function NumberField({
  id,
  label,
  helper,
  value,
  min,
  max,
  disabled,
  onChange,
  onBlur,
}: NumberFieldProps) {
  return (
    <div className="settings-field">
      <label className="settings-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="settings-input-number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={onBlur}
        style={{ width: 120 }}
      />
      {helper && <p className="settings-helper">{helper}</p>}
    </div>
  )
}

export function RetrievalSection({ settings }: RetrievalSectionProps) {
  const { mutateAsync, isPending } = useUpdateSettings()
  const [form, setForm] = useState<RetrievalSettings>(settings.retrieval)
  const [savedState, setSavedState] = useState<SavedState>('idle')
  const [saveError, setSaveError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setForm(settings.retrieval)
  }, [settings.retrieval])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const scheduleSave = useCallback(
    (patch: SettingsPatch) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        setSavedState('saving')
        try {
          await mutateAsync(patch)
          setSavedState('saved')
          setTimeout(() => setSavedState('idle'), 1200)
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : 'Save failed')
          setSavedState('error')
        }
      }, 300)
    },
    [mutateAsync],
  )

  const handleChange = useCallback(
    (field: keyof RetrievalSettings, value: number) => {
      setForm((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const handleBlur = useCallback(() => {
    scheduleSave({ retrieval: form })
  }, [form, scheduleSave])

  return (
    <motion.section
      className="settings-section"
      aria-labelledby="retrieval-heading"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.7, delay: 0.12 }}
    >
      <div className="settings-section-header">
        <h2 id="retrieval-heading" className="settings-section-title">
          Retrieval
        </h2>
        <div
          aria-live="polite"
          className={`settings-saved-indicator${savedState === 'saved' ? ' settings-saved-indicator--visible' : ''}`}
        >
          {savedState === 'saved' ? 'Saved' : ''}
        </div>
      </div>

      <div className="settings-fields">
        <div className="settings-number-row">
          <NumberField
            id="top-k-docs"
            label="Top-K documents"
            helper="Max document chunks retrieved per query"
            value={form.top_k_docs}
            min={1}
            max={50}
            disabled={isPending}
            onChange={(v) => handleChange('top_k_docs', v)}
            onBlur={handleBlur}
          />
          <NumberField
            id="top-k-chat"
            label="Top-K chat history"
            helper="Max chat history chunks retrieved"
            value={form.top_k_chat}
            min={0}
            max={20}
            disabled={isPending}
            onChange={(v) => handleChange('top_k_chat', v)}
            onBlur={handleBlur}
          />
        </div>

        <div className="settings-number-row">
          <NumberField
            id="chunk-size"
            label="Chunk size (tokens)"
            helper="Tokens per document chunk"
            value={form.chunk_size_tokens}
            min={64}
            max={2048}
            disabled={isPending}
            onChange={(v) => handleChange('chunk_size_tokens', v)}
            onBlur={handleBlur}
          />
          <NumberField
            id="chunk-overlap"
            label="Chunk overlap (tokens)"
            helper="Overlap between adjacent chunks"
            value={form.chunk_overlap_tokens}
            min={0}
            max={512}
            disabled={isPending}
            onChange={(v) => handleChange('chunk_overlap_tokens', v)}
            onBlur={handleBlur}
          />
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
