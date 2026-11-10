import type { ConversionJob, JobEvent, JobStatus, QueueStats } from '@/types/converter'
import { api } from '@/utils/api'
import { create } from 'zustand'

interface QueueState {
  jobs: ConversionJob[]
  /** False until the first successful snapshot from the Rust queue. */
  loaded: boolean
  stats: QueueStats
  /** Latest stage text per job; engines that cannot measure progress still report one. */
  stages: Record<string, string>
  /** Failure of a queue command itself (cancel/retry), not of a conversion. */
  notice: string | null
  setJobs: (jobs: ConversionJob[]) => void
  setStats: (stats: QueueStats) => void
  applyEvent: (event: JobEvent) => void
  cancel: (jobId: string) => Promise<void>
  retry: (jobId: string) => Promise<void>
  clearFinished: () => Promise<void>
  dismissNotice: () => void
}

const EMPTY_STATS: QueueStats = { active: 0, queued: 0, limit: 1 }

export const useQueueStore = create<QueueState>((set) => ({
  jobs: [],
  loaded: false,
  stats: EMPTY_STATS,
  stages: {},
  notice: null,
  setJobs: (jobs) => set({ jobs, loaded: true }),
  setStats: (stats) => set({ stats }),
  applyEvent: (event) =>
    set((state) => {
      if (event.type === 'queueStats') {
        return { stats: { ...state.stats, active: event.active, queued: event.queued } }
      }
      if (event.type === 'added') {
        // Upsert: a retry re-emits the same id with its reset status.
        const rest = state.jobs.filter((job) => job.id !== event.job.id)
        return { jobs: [event.job, ...rest] }
      }
      if (event.type === 'progress') {
        const jobs = state.jobs.map((job) =>
          job.id === event.jobId ? { ...job, progress: event.progress } : job,
        )
        return { jobs, stages: { ...state.stages, [event.jobId]: event.stage } }
      }
      const jobs = state.jobs.map((job) =>
        job.id === event.jobId
          ? { ...job, status: event.status, error: event.error ?? null, errorKind: event.errorKind ?? null }
          : job,
      )
      return { jobs }
    }),
  cancel: async (jobId) => {
    try {
      await api.cancelJob(jobId)
    } catch (error) {
      set({ notice: describe(error) })
    }
  },
  retry: async (jobId) => {
    try {
      await api.retryJob(jobId)
    } catch (error) {
      set({ notice: describe(error) })
    }
  },
  clearFinished: async () => {
    try {
      await api.clearFinishedJobs()
      set((state) => ({ jobs: state.jobs.filter((job) => !isFinished(job.status)) }))
    } catch (error) {
      set({ notice: describe(error) })
    }
  },
  dismissNotice: () => set({ notice: null }),
}))

export function isFinished(status: JobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function selectCounts(jobs: ConversionJob[]): Record<JobStatus, number> & { total: number } {
  const counts = {
    total: jobs.length,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  }
  for (const job of jobs) counts[job.status] += 1
  return counts
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
