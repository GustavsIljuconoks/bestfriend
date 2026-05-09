import { useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import type { MaskedSettings, SpendSettings, SettingsPatch } from '@bestfriend/core'
import { useUpdateSettings } from '@renderer/state/queries/settings'

interface SpendSectionProps {
  settings: MaskedSettings
}

type SavedState = 'idle' | 'saving' | 'saved' | 'error'

export function SpendSection({ settings }: SpendSectionProps) {
  const { mutateAsync, isPending } = useUpdateSettings()
  const [form, setForm] = useState<SpendSettings>(settings.spend)
  const [savedState, setSavedState] = useState<SavedState>('idle')
  const [saveError, setSaveError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setForm(settings.spend)
  }, [settings.spend])

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

  const handleChange = useCallback((field: keyof SpendSettings, value: number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleBlur = useCallback(() => {
    scheduleSave({ spend: form })
  }, [form, scheduleSave])

  // Also save reminders mirroring when toggled
  const [mirroringEnabled, setMirroringEnabled] = useState(
    settings.reminders_mirroring.enabled,
  )
  const [mirroringListName, setMirroringListName] = useState(
    settings.reminders_mirroring.list_name,
  )

  useEffect(() => {
    setMirroringEnabled(settings.reminders_mirroring.enabled)
    setMirroringListName(settings.reminders_mirroring.list_name)
  }, [settings.reminders_mirroring])

  const handleMirroringToggle = useCallback(
    async (enabled: boolean) => {
      setMirroringEnabled(enabled)
      try {
        await mutateAsync({
          reminders_mirroring: { enabled, list_name: mirroringListName },
        })
      } catch {
        setMirroringEnabled(!enabled)
      }
    },
    [mutateAsync, mirroringListName],
  )

  const handleMirroringListBlur = useCallback(() => {
    scheduleSave({
      reminders_mirroring: { enabled: mirroringEnabled, list_name: mirroringListName },
    })
  }, [mirroringEnabled, mirroringListName, scheduleSave])

  return (
    <motion.section
      className="settings-section"
      aria-labelledby="spend-heading"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.7, delay: 0.16 }}
    >
      <div className="settings-section-header">
        <h2 id="spend-heading" className="settings-section-title">
          Spend
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
          <div className="settings-field">
            <label className="settings-label" htmlFor="daily-cap">
              Daily cap (USD)
            </label>
            <input
              id="daily-cap"
              type="number"
              className="settings-input-number"
              value={form.daily_cap_usd}
              min={0}
              step={0.5}
              disabled={isPending}
              onChange={(e) => handleChange('daily_cap_usd', Number(e.target.value))}
              onBlur={handleBlur}
              style={{ width: 120 }}
            />
            <p className="settings-helper">Max OpenAI spend per calendar day</p>
          </div>

          <div className="settings-field">
            <label className="settings-label" htmlFor="confirm-threshold">
              Confirm above (USD)
            </label>
            <input
              id="confirm-threshold"
              type="number"
              className="settings-input-number"
              value={form.confirm_threshold_usd}
              min={0}
              step={0.01}
              disabled={isPending}
              onChange={(e) => handleChange('confirm_threshold_usd', Number(e.target.value))}
              onBlur={handleBlur}
              style={{ width: 120 }}
            />
            <p className="settings-helper">Ask before operations exceeding this cost</p>
          </div>
        </div>

        <div className="settings-field">
          <div className="toggle-row">
            <div>
              <div className="settings-label">Mirror to macOS Reminders</div>
              <p className="settings-helper" style={{ marginTop: 2 }}>
                Push accepted reminders to the Reminders app (push-only)
              </p>
            </div>
            <label className="toggle-switch" aria-label="Mirror to macOS Reminders">
              <input
                type="checkbox"
                checked={mirroringEnabled}
                onChange={(e) => handleMirroringToggle(e.target.checked)}
                disabled={isPending}
              />
              <span className="toggle-track" aria-hidden="true" />
              <span className="toggle-thumb" aria-hidden="true" />
            </label>
          </div>
        </div>

        {mirroringEnabled && (
          <div className="settings-field">
            <label className="settings-label" htmlFor="reminders-list">
              Reminders list name
            </label>
            <input
              id="reminders-list"
              type="text"
              className="settings-input"
              value={mirroringListName}
              onChange={(e) => setMirroringListName(e.target.value)}
              onBlur={handleMirroringListBlur}
              disabled={isPending}
              placeholder="Bestfriend"
              autoComplete="off"
              style={{ maxWidth: 240 }}
            />
          </div>
        )}

        {savedState === 'error' && saveError && (
          <p className="settings-field-error" role="alert">
            {saveError}
          </p>
        )}
      </div>
    </motion.section>
  )
}
