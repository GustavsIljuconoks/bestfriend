import type { WebContents } from 'electron'
import type { JobEvent, JobProgress } from '@bestfriend/core'

export type ProgressCallback = (progress: JobProgress) => void
export type JobFn = (onProgress: ProgressCallback) => Promise<void>

interface QueueEntry {
  jobId: string
  fn: JobFn
}

export class JobQueue {
  private readonly queue: QueueEntry[] = []
  private running = false

  constructor(private readonly getWebContents: () => WebContents | null) {}

  enqueue(jobId: string, fn: JobFn): void {
    this.queue.push({ jobId, fn })
    if (!this.running) {
      void this.drain()
    }
  }

  private emit(event: JobEvent): void {
    try {
      this.getWebContents()?.send('job:event', event)
    } catch {
      // window may have been closed
    }
  }

  private async drain(): Promise<void> {
    this.running = true
    while (this.queue.length > 0) {
      const entry = this.queue.shift()!
      try {
        await entry.fn((progress) => {
          this.emit({ job_id: entry.jobId, type: 'progress', progress })
        })
        this.emit({ job_id: entry.jobId, type: 'complete' })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        this.emit({ job_id: entry.jobId, type: 'error', error })
      }
    }
    this.running = false
  }
}

let _queue: JobQueue | null = null

export function initJobQueue(getWebContents: () => WebContents | null): void {
  _queue = new JobQueue(getWebContents)
}

export function getJobQueue(): JobQueue {
  if (!_queue) throw new Error('Job queue not initialized — call initJobQueue() first')
  return _queue
}
