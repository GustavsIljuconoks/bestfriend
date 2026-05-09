import { Tray } from '@phosphor-icons/react'

export function Inbox() {
  return (
    <div className="route-placeholder">
      <Tray size={64} weight="thin" />
      <h1>Your Inbox</h1>
      <p>Captured thoughts and voice notes land here for quick triage.</p>
    </div>
  )
}
