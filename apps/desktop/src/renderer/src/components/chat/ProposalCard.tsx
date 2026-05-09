import { Bell, Lightbulb } from '@phosphor-icons/react'
import type { Proposal } from '@bestfriend/core'

export interface ProposalCardProps {
  proposal: Proposal
  onAcceptReminder: (p: Proposal) => void
  onAcceptSuggestion: (p: Proposal) => void
  onReject: (proposalId: string) => void
  busy: boolean
}

export function ProposalCard({
  proposal,
  onAcceptReminder,
  onAcceptSuggestion,
  onReject,
  busy,
}: ProposalCardProps) {
  const confPct = Math.round(proposal.payload.confidence * 100)
  const isReminder = proposal.type === 'reminder'
  const title = proposal.payload.title
  const payload = proposal.payload
  const detail =
    proposal.type === 'reminder' && 'due_at' in payload
      ? payload.notes
      : 'details' in payload
        ? payload.details
        : null

  return (
    <div className="proposal-card" role="group" aria-label="Assistant proposal">
      <div className="proposal-card-header">
        {isReminder ? (
          <Bell size={18} weight="duotone" className="proposal-card-icon" aria-hidden />
        ) : (
          <Lightbulb size={18} weight="duotone" className="proposal-card-icon" aria-hidden />
        )}
        <span className="proposal-card-type">{isReminder ? 'Reminder' : 'Suggestion'}</span>
        <span className="proposal-card-confidence">{confPct}% match</span>
      </div>
      <p className="proposal-card-title">{title}</p>
      {detail ? <p className="proposal-card-detail">{detail}</p> : null}
      <div className="proposal-card-actions">
        <button
          type="button"
          className="btn btn-ghost proposal-card-btn"
          disabled={busy}
          onClick={() => onReject(proposal.id)}
        >
          Reject
        </button>
        <button
          type="button"
          className="btn btn-primary proposal-card-btn"
          disabled={busy}
          onClick={() =>
            isReminder ? onAcceptReminder(proposal) : onAcceptSuggestion(proposal)
          }
        >
          Accept
        </button>
      </div>
    </div>
  )
}
