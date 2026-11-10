import { useAppStore } from '@/stores/appStore'
import { useQueueStore } from '@/stores/queueStore'
import type { ConversionJob, JobEvent, JobStatus } from '@/types/converter'
import { api } from '@/utils/api'
import { fileName } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { listen } from '@tauri-apps/api/event'
import { isPermissionGranted, sendNotification } from '@tauri-apps/plugin-notification'
import { useEffect } from 'react'

/** Event channel name emitted by `src-tauri/src/queue/events.rs`. */
const JOB_EVENT = 'conversion://job'

/**
 * Loads the current queue once, then keeps it in sync from Rust events.
 * No-ops outside the Tauri runtime so a plain browser tab doesn't spam errors.
 */
export function useJobEvents(): void {
  const setJobs = useQueueStore((state) => state.setJobs)
  const setStats = useQueueStore((state) => state.setStats)
  const applyEvent = useQueueStore((state) => state.applyEvent)
  const nativeNotifications = useAppStore((state) => state.settings.nativeNotifications)

  useEffect(() => {
    if (!isTauriRuntime()) return
    let disposed = false
    let unlisten: (() => void) | undefined

    void Promise.all([api.listJobs(), api.queueStats()])
      .then(([jobs, stats]) => {
        if (disposed) return
        setJobs(jobs)
        setStats(stats)
      })
      .catch(() => undefined)

    void listen<JobEvent>(JOB_EVENT, (message) => {
      if (disposed) return
      const payload = message.payload
      if (payload.type === 'status' && isTerminal(payload.status)) {
        // Read the job before the store drops its details from the running view.
        const job = useQueueStore.getState().jobs.find((entry) => entry.id === payload.jobId)
        applyEvent(payload)
        if (nativeNotifications && document.hidden && job) {
          void notifyFinished(job, payload.status, payload.error)
        }
        return
      }
      applyEvent(payload)
    })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [applyEvent, nativeNotifications, setJobs, setStats])
}

function isTerminal(status: JobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

async function notifyFinished(
  job: ConversionJob,
  status: JobStatus,
  error?: string | null,
): Promise<void> {
  try {
    if (!(await isPermissionGranted())) return
    const name = fileName(job.inputPath)
    if (status === 'completed') {
      sendNotification({
        title: 'Conversion finished',
        body: `${name} → ${fileName(job.outputPath)}`,
      })
    } else if (status === 'failed') {
      sendNotification({
        title: 'Conversion failed',
        body: `${name}: ${error ?? 'the engine reported an error'}`,
      })
    } else {
      sendNotification({ title: 'Conversion cancelled', body: name })
    }
  } catch {
    // A toast is a convenience; a missing notification permission must never
    // disturb the queue or the window.
  }
}
