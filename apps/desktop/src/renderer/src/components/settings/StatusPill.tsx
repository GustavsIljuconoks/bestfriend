import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { ServiceStatus } from '@bestfriend/core'

export type PillState = 'idle' | 'testing' | 'ok' | 'error'

interface StatusPillProps {
  state: PillState
  status?: ServiceStatus | null
}

const TRANSITION = { duration: 0.12, ease: 'easeOut' }

export function StatusPill({ state, status }: StatusPillProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!status?.error) return
    navigator.clipboard.writeText(status.error).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [status])

  return (
    <span style={{ display: 'inline-flex', minWidth: 80, alignItems: 'center' }}>
      <AnimatePresence mode="wait">
        {state === 'idle' && (
          <motion.span
            key="idle"
            className="status-pill status-pill--idle"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={TRANSITION}
          >
            —
          </motion.span>
        )}

        {state === 'testing' && (
          <motion.span
            key="testing"
            className="status-pill status-pill--testing"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={TRANSITION}
            aria-live="polite"
          >
            <span className="status-spinner" aria-hidden="true" />
            Testing…
          </motion.span>
        )}

        {state === 'ok' && (
          <motion.span
            key="ok"
            className="status-pill status-pill--ok"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={TRANSITION}
            aria-live="polite"
          >
            <span className="status-dot status-dot--ok" aria-hidden="true" />
            Connected
            {status?.latency_ms != null && (
              <span className="status-latency">{status.latency_ms} ms</span>
            )}
          </motion.span>
        )}

        {state === 'error' && (
          <motion.span
            key="error"
            className="status-pill status-pill--error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={TRANSITION}
            aria-live="assertive"
          >
            <span className="status-dot status-dot--error" aria-hidden="true" />
            <span className="status-error-msg" title={status?.error ?? 'Error'}>
              {status?.error ?? 'Error'}
            </span>
            <button
              type="button"
              className="status-copy-btn"
              onClick={handleCopy}
              aria-label="Copy error message"
            >
              {copied ? 'Copied ✓' : 'Copy error'}
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
