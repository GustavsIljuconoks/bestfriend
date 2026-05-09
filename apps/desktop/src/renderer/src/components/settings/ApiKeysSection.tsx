import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { MaskedSettings } from '@bestfriend/core'
import { useUpdateSettings } from '@renderer/state/queries/settings'

interface ApiKeysSectionProps {
  settings: MaskedSettings
}

type SubmitState = 'idle' | 'saving' | 'error'

interface ApiKeyRowProps {
  label: string
  isSet: boolean
  onSave: (value: string) => Promise<void>
}

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.7 }

function ApiKeyRow({ label, isSet, onSave }: ApiKeyRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [keySaved, setKeySaved] = useState(isSet)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleExpand = useCallback(() => {
    setIsEditing(true)
    setSubmitState('idle')
    setErrorMsg('')
  }, [])

  const handleCollapse = useCallback(() => {
    setIsEditing(false)
    if (inputRef.current) inputRef.current.value = ''
    setSubmitState('idle')
    setErrorMsg('')
  }, [])

  const handleAnimationComplete = useCallback(
    (definition: string) => {
      if (definition === 'animate' && isEditing && inputRef.current) {
        inputRef.current.focus()
      }
    },
    [isEditing],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const value = inputRef.current?.value ?? ''
      if (!value.trim()) return

      setSubmitState('saving')
      try {
        await onSave(value)
        // Clear the uncontrolled input immediately after submitting
        if (inputRef.current) inputRef.current.value = ''
        setKeySaved(true)
        setIsEditing(false)
        setSubmitState('idle')
      } catch (err) {
        setSubmitState('error')
        setErrorMsg(err instanceof Error ? err.message : 'Save failed')
      }
    },
    [onSave],
  )

  return (
    <div className="api-key-row">
      <div className="api-key-row-top">
        <span className="settings-label">{label}</span>
        <div className="api-key-status-area">
          <AnimatePresence mode="wait">
            {!isEditing && (
              <motion.span
                key={keySaved ? 'set' : 'notset'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`api-key-badge ${keySaved ? 'api-key-badge--set' : 'api-key-badge--notset'}`}
              >
                {keySaved ? 'Set ✓' : 'Not set'}
              </motion.span>
            )}
          </AnimatePresence>
          {!isEditing && (
            <button
              type="button"
              className="settings-btn-secondary"
              onClick={handleExpand}
            >
              {keySaved ? 'Replace key' : 'Add key'}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isEditing && (
          <motion.div
            key="edit-form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            onAnimationComplete={handleAnimationComplete}
            style={{ overflow: 'hidden' }}
          >
            <form className="api-key-edit-form" onSubmit={handleSubmit} noValidate>
              <input
                ref={inputRef}
                type="password"
                className={`settings-input${submitState === 'error' ? ' settings-input--error' : ''}`}
                placeholder={`Paste ${label}`}
                autoComplete="new-password"
                spellCheck={false}
                aria-label={`New ${label}`}
              />
              <div className="api-key-form-actions">
                <button
                  type="submit"
                  className="settings-btn-primary"
                  disabled={submitState === 'saving'}
                >
                  {submitState === 'saving' ? (
                    <span className="status-spinner" aria-label="Saving…" />
                  ) : (
                    'Save'
                  )}
                </button>
                {keySaved && (
                  <button
                    type="button"
                    className="settings-btn-ghost"
                    onClick={handleCollapse}
                    disabled={submitState === 'saving'}
                  >
                    Cancel
                  </button>
                )}
              </div>
              {submitState === 'error' && errorMsg && (
                <p className="settings-field-error" role="alert">
                  {errorMsg}
                </p>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ApiKeysSection({ settings }: ApiKeysSectionProps) {
  const { mutateAsync } = useUpdateSettings()

  const saveOpenAiKey = useCallback(
    async (value: string) => {
      await mutateAsync({ openai_api_key: value })
    },
    [mutateAsync],
  )

  const savePineconeKey = useCallback(
    async (value: string) => {
      await mutateAsync({ pinecone_api_key: value })
    },
    [mutateAsync],
  )

  return (
    <motion.section
      className="settings-section"
      aria-labelledby="api-keys-heading"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.7, delay: 0.04 }}
    >
      <div className="settings-section-header">
        <h2 id="api-keys-heading" className="settings-section-title">
          API Keys
        </h2>
      </div>
      <div className="settings-fields">
        <p className="settings-helper" style={{ marginBottom: 4 }}>
          Keys are stored encrypted in macOS Keychain and never sent to the renderer.
        </p>
        <ApiKeyRow
          label="OpenAI API Key"
          isSet={settings.openai_api_key_set}
          onSave={saveOpenAiKey}
        />
        <ApiKeyRow
          label="Pinecone API Key"
          isSet={settings.pinecone_api_key_set}
          onSave={savePineconeKey}
        />
      </div>
    </motion.section>
  )
}
