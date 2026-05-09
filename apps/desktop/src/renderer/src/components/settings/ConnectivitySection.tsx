import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { EMBEDDING_MODEL_CATALOG } from '@bestfriend/core'
import type { MaskedSettings, TestConnectionsResult, ServiceStatus } from '@bestfriend/core'
import { useTestConnections, useCreatePineconeIndex } from '@renderer/state/queries/settings'
import { StatusPill } from './StatusPill'
import type { PillState } from './StatusPill'

interface ConnectivitySectionProps {
  settings: MaskedSettings
}

interface ServiceRowProps {
  name: string
  pillState: PillState
  status: ServiceStatus | null
}

function ServiceRow({ name, pillState, status }: ServiceRowProps) {
  return (
    <div className="connectivity-service-row">
      <span className="connectivity-service-name">{name}</span>
      <StatusPill state={pillState} status={status} />
    </div>
  )
}

export function ConnectivitySection({ settings }: ConnectivitySectionProps) {
  const { mutate: testConnections, isPending: isTesting } = useTestConnections()
  const { mutate: createIndex, isPending: isCreating } = useCreatePineconeIndex()

  const [result, setResult] = useState<TestConnectionsResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [indexResult, setIndexResult] = useState<{
    message: string
    isError: boolean
  } | null>(null)

  const openaiState: PillState = isTesting
    ? 'testing'
    : result
      ? result.openai.ok
        ? 'ok'
        : 'error'
      : 'idle'

  const pineconeState: PillState = isTesting
    ? 'testing'
    : result
      ? result.pinecone.ok
        ? 'ok'
        : 'error'
      : 'idle'

  const pineconeTestPassed = result?.pinecone.ok ?? false
  const canCreateIndex =
    settings.pinecone_api_key_set && pineconeTestPassed && !isCreating && !isTesting

  const embeddingEntry =
    EMBEDDING_MODEL_CATALOG.find((e) => e.id === settings.models.embeddings_model) ??
    EMBEDDING_MODEL_CATALOG[0]

  const handleTest = useCallback(() => {
    setResult(null)
    setTestError(null)
    setIndexResult(null)
    testConnections(undefined, {
      onSuccess: (data) => setResult(data),
      onError: (err) => setTestError(err.message),
    })
  }, [testConnections])

  const handleCreateIndex = useCallback(() => {
    setIndexResult(null)
    createIndex(undefined, {
      onSuccess: (data) => {
        if (data.error) {
          setIndexResult({ message: data.error, isError: true })
        } else if (data.created) {
          setIndexResult({
            message: `Created index "bestfriend" (${data.dimension}d) in us-east-1.`,
            isError: false,
          })
        } else if (data.existed) {
          setIndexResult({
            message: `Index "bestfriend" already exists (${data.dimension}d).`,
            isError: false,
          })
        }
      },
      onError: (err) => setIndexResult({ message: err.message, isError: true }),
    })
  }, [createIndex])

  return (
    <motion.section
      className="settings-section"
      aria-labelledby="connectivity-heading"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.7, delay: 0.2 }}
      style={{ borderBottom: 'none' }}
    >
      <div className="settings-section-header">
        <h2 id="connectivity-heading" className="settings-section-title">
          Connectivity
        </h2>
      </div>

      <div className="settings-fields">
        <ServiceRow
          name="OpenAI"
          pillState={openaiState}
          status={result?.openai ?? null}
        />
        <ServiceRow
          name="Pinecone"
          pillState={pineconeState}
          status={result?.pinecone ?? null}
        />

        <div className="connectivity-actions">
          <button
            type="button"
            className="settings-btn-primary"
            onClick={handleTest}
            disabled={isTesting}
          >
            {isTesting ? (
              <>
                <span className="status-spinner" aria-hidden="true" />
                Testing…
              </>
            ) : (
              'Test connections'
            )}
          </button>

          <button
            type="button"
            className="settings-btn-secondary"
            onClick={handleCreateIndex}
            disabled={!canCreateIndex}
            title={
              !settings.pinecone_api_key_set
                ? 'Add a Pinecone API key first'
                : !pineconeTestPassed
                  ? 'Run a successful connection test first'
                  : undefined
            }
          >
            {isCreating ? (
              <>
                <span className="status-spinner" aria-hidden="true" />
                Creating…
              </>
            ) : (
              'Auto-create Pinecone index'
            )}
          </button>
        </div>

        <p className="connectivity-index-helper">
          Will create a serverless index named "bestfriend" in us-east-1 with{' '}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-11)' }}>
            {embeddingEntry.dimension}
          </span>{' '}
          dimensions ({embeddingEntry.id}).
        </p>

        <AnimatePresence>
          {testError && (
            <motion.div
              key="test-error"
              className="connectivity-error-block"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              style={{ overflow: 'hidden' }}
              role="alert"
            >
              Test failed: {testError}
            </motion.div>
          )}

          {indexResult && (
            <motion.div
              key="index-result"
              className="connectivity-error-block"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              style={{
                overflow: 'hidden',
                color: indexResult.isError ? 'var(--danger)' : 'var(--success)',
                background: indexResult.isError
                  ? undefined
                  : 'color-mix(in srgb, var(--success) 8%, var(--surface-1))',
                borderColor: indexResult.isError
                  ? undefined
                  : 'color-mix(in srgb, var(--success) 30%, transparent)',
              }}
              role={indexResult.isError ? 'alert' : 'status'}
            >
              {indexResult.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
