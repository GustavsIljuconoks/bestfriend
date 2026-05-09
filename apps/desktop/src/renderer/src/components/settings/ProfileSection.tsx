import { useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import type { MaskedSettings, UserProfile, SettingsPatch } from '@bestfriend/core'
import { useUpdateSettings } from '@renderer/state/queries/settings'

interface ProfileSectionProps {
  settings: MaskedSettings
}

type SavedState = 'idle' | 'saving' | 'saved' | 'error'

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}
const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.7 }
const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

export function ProfileSection({ settings }: ProfileSectionProps) {
  const { mutateAsync, isPending } = useUpdateSettings()
  const [form, setForm] = useState<UserProfile>(settings.profile)
  const [theme, setTheme] = useState(settings.theme)
  const [savedState, setSavedState] = useState<SavedState>('idle')
  const [saveError, setSaveError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setForm(settings.profile)
    setTheme(settings.theme)
  }, [settings.profile, settings.theme])

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

  const handleBlur = useCallback(() => {
    scheduleSave({ profile: form })
  }, [form, scheduleSave])

  const handleFieldChange = useCallback(
    (field: keyof UserProfile, value: string | string[]) => {
      setForm((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const handleThemeChange = useCallback(
    async (value: 'system' | 'light' | 'dark') => {
      setTheme(value)

      // Apply immediately — don't wait for IPC roundtrip
      const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const resolved = value === 'dark' ? 'dark' : value === 'light' ? 'light' : osDark ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', resolved)

      setSavedState('saving')
      try {
        await mutateAsync({ theme: value })
        setSavedState('saved')
        setTimeout(() => setSavedState('idle'), 1200)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed')
        setSavedState('error')
      }
    },
    [mutateAsync],
  )

  return (
    <motion.section
      className="settings-section"
      aria-labelledby="profile-heading"
      variants={SECTION_VARIANTS}
      initial="hidden"
      animate="visible"
      transition={{ ...SPRING, delay: 0 }}
    >
      <div className="settings-section-header">
        <h2 id="profile-heading" className="settings-section-title">
          Profile
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
          <label className="settings-label" htmlFor="profile-name">
            Name
          </label>
          <input
            id="profile-name"
            type="text"
            className="settings-input"
            value={form.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            onBlur={handleBlur}
            disabled={isPending}
            placeholder="Your name"
            autoComplete="off"
          />
        </div>

        <div className="settings-field">
          <label className="settings-label" htmlFor="profile-role">
            Role
          </label>
          <input
            id="profile-role"
            type="text"
            className="settings-input"
            value={form.role}
            onChange={(e) => handleFieldChange('role', e.target.value)}
            onBlur={handleBlur}
            disabled={isPending}
            placeholder="e.g. Software Engineer"
            autoComplete="off"
          />
        </div>

        <div className="settings-field">
          <label className="settings-label" htmlFor="profile-timezone">
            Timezone
          </label>
          <input
            id="profile-timezone"
            type="text"
            className="settings-input"
            value={form.timezone}
            onChange={(e) => handleFieldChange('timezone', e.target.value)}
            onBlur={handleBlur}
            disabled={isPending}
            placeholder="e.g. America/New_York"
            autoComplete="off"
          />
          <p className="settings-helper">Used for scheduling reminders at the right time</p>
        </div>

        <div className="settings-field">
          <label className="settings-label" htmlFor="profile-tone">
            Tone preferences
          </label>
          <textarea
            id="profile-tone"
            className="settings-input settings-textarea"
            value={form.tone_preferences}
            onChange={(e) => handleFieldChange('tone_preferences', e.target.value)}
            onBlur={handleBlur}
            disabled={isPending}
            placeholder="e.g. Concise, direct, technical"
            rows={3}
          />
          <p className="settings-helper">How the assistant should communicate with you</p>
        </div>

        <div className="settings-field">
          <label className="settings-label" htmlFor="profile-projects">
            Current projects
          </label>
          <input
            id="profile-projects"
            type="text"
            className="settings-input"
            value={form.current_projects.join(', ')}
            onChange={(e) =>
              handleFieldChange(
                'current_projects',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            onBlur={handleBlur}
            disabled={isPending}
            placeholder="Project A, Project B"
            autoComplete="off"
          />
          <p className="settings-helper">Comma-separated list of active projects</p>
        </div>

        <div className="settings-field">
          <span className="settings-label">Theme</span>
          <div className="theme-options" role="radiogroup" aria-label="Color theme">
            {THEME_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                className={`theme-option${theme === value ? ' theme-option--active' : ''}`}
                onClick={() => handleThemeChange(value)}
                disabled={isPending}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {savedState === 'error' && saveError && (
          <p className="settings-field-error">{saveError}</p>
        )}
      </div>
    </motion.section>
  )
}
