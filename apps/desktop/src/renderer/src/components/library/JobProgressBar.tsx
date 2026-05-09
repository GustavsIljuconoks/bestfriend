import type { JobProgress } from '@bestfriend/core'

interface JobProgressBarProps {
  progress: JobProgress
}

export function JobProgressBar({ progress }: JobProgressBarProps) {
  const pct =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="job-progress">
      <div className="job-progress-header">
        <span className="job-progress-phase">{progress.phase}</span>
        <span className="job-progress-stats">
          {progress.current}/{progress.total}
          {progress.estimated_cost_usd > 0 && (
            <> · ${progress.estimated_cost_usd.toFixed(4)}</>
          )}
        </span>
      </div>
      <div className="job-progress-track">
        <div
          className="job-progress-fill"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}
