import type Database from 'better-sqlite3'
import type { Reminder, ReminderRecurrence, ReminderStatus } from '@bestfriend/core'
import { randomUUID } from 'crypto'

interface ReminderRow {
  id: string
  title: string
  notes: string | null
  due_at: string
  timezone: string
  recurrence: string
  status: string
  snoozed_until: string | null
  eventkit_id: string | null
  created_at: string
  fired_at: string | null
}

export class ReminderRepo {
  constructor(private readonly db: Database.Database) {}

  insertScheduled(params: {
    title: string
    notes: string | null
    due_at: string
    timezone: string
    recurrence: ReminderRecurrence
  }): Reminder {
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    this.db
      .prepare(
        `
        INSERT INTO reminders (id, title, notes, due_at, timezone, recurrence, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)
      `,
      )
      .run(
        id,
        params.title,
        params.notes,
        params.due_at,
        params.timezone,
        params.recurrence,
        createdAt,
      )
    return rowToReminder({
      id,
      title: params.title,
      notes: params.notes,
      due_at: params.due_at,
      timezone: params.timezone,
      recurrence: params.recurrence,
      status: 'scheduled',
      snoozed_until: null,
      eventkit_id: null,
      created_at: createdAt,
      fired_at: null,
    })
  }
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    due_at: row.due_at,
    timezone: row.timezone,
    recurrence: row.recurrence as ReminderRecurrence,
    status: row.status as ReminderStatus,
    snoozed_until: row.snoozed_until,
    eventkit_id: row.eventkit_id,
    created_at: row.created_at,
    fired_at: row.fired_at,
  }
}
