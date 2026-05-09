import type { IndexingEstimate } from '@bestfriend/core'

interface CostEstimateDialogProps {
  estimate: IndexingEstimate
  onConfirm: () => void
  onCancel: () => void
}

export function CostEstimateDialog({ estimate, onConfirm, onCancel }: CostEstimateDialogProps) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">Confirm Indexing</h2>
        <p className="dialog-body">
          This will index{' '}
          <strong>
            {estimate.file_count} file{estimate.file_count !== 1 ? 's' : ''}
          </strong>{' '}
          into approximately{' '}
          <strong>{estimate.estimated_chunks.toLocaleString()} chunks</strong>.
        </p>
        <div className="cost-estimate-row">
          <span className="cost-estimate-label">Estimated embedding cost</span>
          <span className="cost-estimate-value">
            ≈ ${estimate.estimated_cost_usd.toFixed(4)}
          </span>
        </div>
        {estimate.exceeds_threshold && (
          <p className="cost-estimate-warning">
            This exceeds your pre-action confirmation threshold.
          </p>
        )}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            Index Files
          </button>
        </div>
      </div>
    </div>
  )
}
