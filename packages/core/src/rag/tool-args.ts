import type { ReminderPayload, ReminderRecurrence, SuggestionPayload } from '../domain/types.js'

export interface RememberAboutUserPayload {
  content: string
  reason: string
}

const RECURRENCE: ReminderRecurrence[] = ['one_off', 'daily', 'weekly', 'monthly']

function isReminderRecurrence(s: string): s is ReminderRecurrence {
  return (RECURRENCE as readonly string[]).includes(s)
}

function parseJsonObject(rawJson: string): Record<string, string | number | boolean | null> | null {
  try {
    const parsed = JSON.parse(rawJson) as string | number | boolean | object | null
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, string | number | boolean | null>
  } catch {
    return null
  }
}

export function parseProposeReminderArguments(rawJson: string): ReminderPayload | null {
  const o = parseJsonObject(rawJson)
  if (!o) return null
  const title = o['title']
  const due_at = o['due_at']
  const timezone = o['timezone']
  const recurrence = o['recurrence']
  const confidence = o['confidence']
  if (typeof title !== 'string' || title.trim() === '') return null
  if (typeof due_at !== 'string' || due_at.trim() === '') return null
  if (typeof timezone !== 'string' || timezone.trim() === '') return null
  if (typeof recurrence !== 'string' || !isReminderRecurrence(recurrence)) return null
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1 || !Number.isFinite(confidence)) {
    return null
  }
  const notesRaw = o['notes']
  let notes: string | null = null
  if (notesRaw !== undefined && notesRaw !== null) {
    if (typeof notesRaw !== 'string') return null
    notes = notesRaw
  }
  return {
    title: title.trim(),
    due_at: due_at.trim(),
    timezone: timezone.trim(),
    recurrence,
    notes,
    confidence,
  }
}

export function parseProposeSuggestionArguments(rawJson: string): SuggestionPayload | null {
  const o = parseJsonObject(rawJson)
  if (!o) return null
  const title = o['title']
  const confidence = o['confidence']
  if (typeof title !== 'string' || title.trim() === '') return null
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1 || !Number.isFinite(confidence)) {
    return null
  }
  const detailsRaw = o['details']
  let details: string | null = null
  if (detailsRaw !== undefined && detailsRaw !== null) {
    if (typeof detailsRaw !== 'string') return null
    details = detailsRaw
  }
  return { title: title.trim(), details, confidence }
}

export function parseRememberAboutUserArguments(rawJson: string): RememberAboutUserPayload | null {
  const o = parseJsonObject(rawJson)
  if (!o) return null
  const content = o['content']
  const reason = o['reason']
  if (typeof content !== 'string' || content.trim() === '') return null
  if (typeof reason !== 'string' || reason.trim() === '') return null
  return { content: content.trim(), reason: reason.trim() }
}
