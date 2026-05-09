import { GearSix } from '@phosphor-icons/react'
import { useSettings } from '@renderer/state/queries/settings'
import { SettingsLayout } from '@renderer/components/settings/SettingsLayout'

function SettingsError() {
  return (
    <div className="settings-error" role="alert">
      <GearSix size={24} weight="regular" />
      Failed to load settings. Check that the app is running correctly.
    </div>
  )
}

function SettingsLoading() {
  return (
    <div className="settings-loading" aria-label="Loading settings…">
      <span className="status-spinner" />
      Loading settings…
    </div>
  )
}

function SettingsContent() {
  const { data: settings, isLoading, isError } = useSettings()

  if (isLoading) return <SettingsLoading />
  if (isError || !settings) return <SettingsError />

  return <SettingsLayout settings={settings} />
}

export function Settings() {
  return (
    <div className="settings-route">
      <SettingsContent />
    </div>
  )
}
