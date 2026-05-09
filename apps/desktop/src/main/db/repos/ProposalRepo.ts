import type Database from 'better-sqlite3'
import type {
  Proposal,
  ProposalStatus,
  ProposalType,
  ReminderPayload,
  SuggestionPayload,
} from '@bestfriend/core'
import { randomUUID } from 'crypto'

interface ProposalRow {
  id: string
  message_id: string
  type: string
  payload_json: string
  status: string
  created_at: string
  decided_at: string | null
}

export class ProposalRepo {
  constructor(private readonly db: Database.Database) {}

  insertProposed(params: {
    messageId: string
    type: ProposalType
    payload: ReminderPayload | SuggestionPayload
  }): Proposal {
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    this.db
      .prepare(
        `
        INSERT INTO proposals (id, message_id, type, payload_json, status, created_at)
        VALUES (?, ?, ?, ?, 'proposed', ?)
      `,
      )
      .run(id, params.messageId, params.type, JSON.stringify(params.payload), createdAt)
    return rowToProposal({
      id,
      message_id: params.messageId,
      type: params.type,
      payload_json: JSON.stringify(params.payload),
      status: 'proposed',
      created_at: createdAt,
      decided_at: null,
    })
  }

  listPendingForConversation(
    conversationId: string,
    minConfidence: number,
  ): Proposal[] {
    const rows = this.db
      .prepare(
        `
        SELECT p.id, p.message_id, p.type, p.payload_json, p.status, p.created_at, p.decided_at
        FROM proposals p
        INNER JOIN messages m ON m.id = p.message_id
        WHERE m.conversation_id = ?
          AND p.status = 'proposed'
        ORDER BY datetime(p.created_at) ASC
      `,
      )
      .all(conversationId) as ProposalRow[]

    const out: Proposal[] = []
    for (const row of rows) {
      const proposal = rowToProposal(row)
      const c = confidenceFromPayload(proposal.payload)
      if (c >= minConfidence) out.push(proposal)
    }
    return out
  }

  getById(id: string): Proposal | null {
    const row = this.db.prepare(`SELECT * FROM proposals WHERE id = ?`).get(id) as
      | ProposalRow
      | undefined
    return row ? rowToProposal(row) : null
  }

  setStatus(id: string, status: ProposalStatus): void {
    const decidedAt = status === 'proposed' ? null : new Date().toISOString()
    this.db
      .prepare(
        `
        UPDATE proposals SET status = ?, decided_at = ?
        WHERE id = ?
      `,
      )
      .run(status, decidedAt, id)
  }

  listPendingForMessage(messageId: string, minConfidence: number): Proposal[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM proposals
        WHERE message_id = ? AND status = 'proposed'
        ORDER BY datetime(created_at) ASC
      `,
      )
      .all(messageId) as ProposalRow[]

    const out: Proposal[] = []
    for (const row of rows) {
      const proposal = rowToProposal(row)
      const c = confidenceFromPayload(proposal.payload)
      if (c >= minConfidence) out.push(proposal)
    }
    return out
  }
}

function confidenceFromPayload(payload: ReminderPayload | SuggestionPayload): number {
  return payload.confidence
}

function rowToProposal(row: ProposalRow): Proposal {
  let payload: ReminderPayload | SuggestionPayload
  try {
    payload = JSON.parse(row.payload_json) as ReminderPayload | SuggestionPayload
  } catch {
    throw new Error(`Invalid proposal payload JSON for ${row.id}`)
  }
  return {
    id: row.id,
    message_id: row.message_id,
    type: row.type as ProposalType,
    payload,
    status: row.status as ProposalStatus,
    created_at: row.created_at,
    decided_at: row.decided_at,
  }
}
