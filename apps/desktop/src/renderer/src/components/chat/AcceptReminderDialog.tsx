import { useEffect, useState } from 'react'
import type { ReminderPayload, ReminderRecurrence } from '@bestfriend/core'

const RECURRENCE_LABELS: { value: ReminderRecurrence; label: string }[] = [
  { value: 'one_off', label: 'One time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function toDatetimeLocalValue(iso: string): string {
  const t = iso.trim()
  if (t.length >= 16) return t.slice(0, 16)
  if (t.length === 10) return `${t}T09:00`
  return t
}

export interface AcceptReminderDialogProps {
  open: boolean
  payload: ReminderPayload | null
  onClose: () => void
  onConfirm: (edited: Partial<ReminderPayload>) => void
  isPending: boolean
}

export function AcceptReminderDialog({
  open,
  payload,
  onClose,
  onConfirm,
  isPending,
}: AcceptReminderDialogProps) {
  const [title, setTitle] = useState('')
  const [dueLocal, setDueLocal] = useState('')
  const [timezone, setTimezone] = useState('')
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>('one_off')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open || !payload) return
    setTitle(payload.title)
    setDueLocal(toDatetimeLocalValue(payload.due_at))
    setTimezone(payload.timezone)
    setRecurrence(payload.recurrence)
    setNotes(payload.notes ?? '')
  }, [open, payload])

  if (!open || !payload) return null

  return (
    <div className="sources-drawer-backdrop" role="presentation" onClick={onClose}>
      <div
        className="chat-reminder-dialog"
        role="dialog"
        aria-labelledby="reminder-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reminder-dialog-title" className="chat-reminder-dialog-title">
          Confirm reminder
        </h2>
        <div className="chat-reminder-fields">
          <label className="settings-label" htmlFor="reminder-title">
            Title
          </label>
          <input
            id="reminder-title"
            className="settings-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="settings-label" htmlFor="reminder-when">
            When (local)
          </label>
          <input
            id="reminder-when"
            type="datetime-local"
            className="settings-input"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
          />
          <label className="settings-label" htmlFor="reminder-tz">
            Timezone
          </label>
          <input
            id="reminder-tz"
            className="settings-input"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
          <label className="settings-label" htmlFor="reminder-recur">
            Recurrence
          </label>
          <select
            id="reminder-recur"
            className="settings-input"
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as ReminderRecurrence)}
          >
            {RECURRENCE_LABELS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="settings-label" htmlFor="reminder-notes">
            Notes
          </label>
          <textarea
            id="reminder-notes"
            className="chat-composer-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="chat-reminder-actions">
          <button type="button" className="btn btn-ghost" disabled={isPending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isPending || !title.trim() || !dueLocal.trim()}
            onClick={() => {
              onConfirm({
                title: title.trim(),
                due_at: dueLocal.trim(),
                timezone: timezone.trim(),
                recurrence,
                notes: notes.trim() === '' ? null : notes.trim(),
              })
            }}
          >
            Save reminder
          </button>
        </div>
      </div>
    </div>
  )
}
