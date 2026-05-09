import { ipcMain } from 'electron'
import type { Proposal, ReminderPayload, ReminderRecurrence, SuggestionPayload } from '@bestfriend/core'
import { parseProposeReminderArguments } from '@bestfriend/core'
import { getDb } from '../db/index.js'
import { ProposalRepo } from '../db/repos/ProposalRepo.js'
import { ReminderRepo } from '../db/repos/ReminderRepo.js'
import { SettingsRepo } from '../db/repos/SettingsRepo.js'

function validateId(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value.trim()
}

const RECURRENCE: ReminderRecurrence[] = ['one_off', 'daily', 'weekly', 'monthly']

function isRecurrence(s: string): s is ReminderRecurrence {
  return (RECURRENCE as readonly string[]).includes(s)
}

function extractReminderEdit(raw: object): Partial<ReminderPayload> {
  const o = raw as Record<string, string | null | undefined>
  const e: Partial<ReminderPayload> = {}
  if (typeof o['title'] === 'string') e.title = o['title'].trim()
  if (typeof o['due_at'] === 'string') e.due_at = o['due_at'].trim()
  if (typeof o['timezone'] === 'string') e.timezone = o['timezone'].trim()
  if (typeof o['recurrence'] === 'string' && isRecurrence(o['recurrence'])) {
    e.recurrence = o['recurrence']
  }
  if ('notes' in o) {
    if (o['notes'] === null) e.notes = null
    else if (typeof o['notes'] === 'string') e.notes = o['notes']
  }
  return e
}

function isReminderPayload(p: ReminderPayload | SuggestionPayload): p is ReminderPayload {
  return 'due_at' in p
}

function mergeReminderPayload(
  base: ReminderPayload,
  edited: Partial<ReminderPayload>,
): ReminderPayload {
  const merged: ReminderPayload = {
    title: edited.title ?? base.title,
    due_at: edited.due_at ?? base.due_at,
    timezone: edited.timezone ?? base.timezone,
    recurrence: edited.recurrence ?? base.recurrence,
    notes: edited.notes !== undefined ? edited.notes : base.notes,
    confidence: base.confidence,
  }
  const reparsed = parseProposeReminderArguments(JSON.stringify(merged))
  if (!reparsed) throw new Error('Invalid edited reminder fields')
  return reparsed
}

export function registerProposalHandlers(): void {
  ipcMain.handle(
    'proposals:list',
    async (_e, rawConvId: unknown): Promise<Proposal[]> => {
      const conversationId = validateId(rawConvId, 'conversationId')
      const db = getDb()
      const { retrieval } = new SettingsRepo(db).loadNonSecretSettings()
      const threshold = retrieval.proposal_confidence_threshold
      return new ProposalRepo(db).listPendingForConversation(conversationId, threshold)
    },
  )

  ipcMain.handle(
    'proposals:accept',
    async (_e, rawProposalId: unknown, rawEdited: unknown): Promise<void> => {
      const proposalId = validateId(rawProposalId, 'proposalId')
      const db = getDb()
      const repo = new ProposalRepo(db)
      const proposal = repo.getById(proposalId)
      if (!proposal) throw new Error(`Proposal ${proposalId} not found`)
      if (proposal.status !== 'proposed') throw new Error('Proposal is no longer pending')

      if (proposal.type === 'reminder') {
        let patch: Partial<ReminderPayload> = {}
        if (rawEdited !== undefined && rawEdited !== null) {
          if (typeof rawEdited !== 'object' || Array.isArray(rawEdited)) {
            throw new Error('edited reminder must be an object')
          }
          patch = extractReminderEdit(rawEdited)
        }
        if (!isReminderPayload(proposal.payload)) {
          throw new Error('Corrupt reminder proposal')
        }
        const payload = mergeReminderPayload(proposal.payload, patch)
        new ReminderRepo(db).insertScheduled({
          title: payload.title,
          notes: payload.notes,
          due_at: payload.due_at,
          timezone: payload.timezone,
          recurrence: payload.recurrence,
        })
        repo.setStatus(proposalId, 'accepted')
        return
      }

      repo.setStatus(proposalId, 'accepted')
    },
  )

  ipcMain.handle('proposals:reject', async (_e, rawProposalId: unknown): Promise<void> => {
    const proposalId = validateId(rawProposalId, 'proposalId')
    const repo = new ProposalRepo(getDb())
    const proposal = repo.getById(proposalId)
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`)
    if (proposal.status !== 'proposed') throw new Error('Proposal is no longer pending')
    repo.setStatus(proposalId, 'rejected')
  })
}
