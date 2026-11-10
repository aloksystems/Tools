import { ProgressBar } from '@/components/conversion-settings/controls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isFinished, useQueueStore } from '@/stores/queueStore'
import { formatBytes, formatDuration, formatLabel, formatSavings, fileName } from '@/utils/format'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { FolderOpen, RotateCcw, X } from 'lucide-react'
import type { ConversionJob, JobStatus } from '@/types/converter'

const STATUS_META: Record<
  JobStatus,
  { label: string; badge: 'muted' | 'default' | 'success' | 'destructive' | 'warning' }
> = {
  queued: { label: 'Queued', badge: 'muted' },
  processing: { label: 'Converting', badge: 'default' },
  completed: { label: 'Done', badge: 'success' },
  failed: { label: 'Failed', badge: 'destructive' },
  cancelled: { label: 'Cancelled', badge: 'warning' },
}

function percentOf(progress: number): number {
  return Math.round(Math.min(1, Math.max(0, progress)) * 100)
}

export function JobTable({ jobs }: { jobs: ConversionJob[] }) {
  const stages = useQueueStore((state) => state.stages)
  const cancel = useQueueStore((state) => state.cancel)
  const retry = useQueueStore((state) => state.retry)

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {jobs.map((job) => {
        const meta = STATUS_META[job.status]
        const percent = percentOf(job.progress)
        const elapsed =
          job.finishedAtMs && job.startedAtMs
            ? formatDuration(job.finishedAtMs - job.startedAtMs)
            : null
        const savings = formatSavings(job.inputBytes, job.outputBytes)
        return (
          <li key={job.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={job.inputPath}>
                  {fileName(job.inputPath)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatLabel(job.inputFormat)} → {formatLabel(job.outputFormat)}
                  {' · '}
                  {formatBytes(job.inputBytes)}
                  {job.outputBytes ? ` → ${formatBytes(job.outputBytes)}` : ''}
                  {savings ? ` (${savings})` : ''}
                  {elapsed ? ` · ${elapsed}` : ''}
                </p>
                {job.error ? (
                  <p className="mt-1 text-xs text-destructive" title={job.error}>
                    {job.error}
                  </p>
                ) : null}
              </div>

              <Badge variant={meta.badge} className="shrink-0">
                {meta.label}
              </Badge>

              <div className="flex shrink-0 items-center gap-1">
                {isFinished(job.status) ? null : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Cancel ${fileName(job.inputPath)}`}
                    onClick={() => void cancel(job.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
                {job.status === 'failed' || job.status === 'cancelled' ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Retry ${fileName(job.inputPath)}`}
                    onClick={() => void retry(job.id)}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                ) : null}
                {job.status === 'completed' ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Show ${fileName(job.outputPath)} in the folder`}
                    title="Show the converted file"
                    onClick={() => void revealItemInDir(job.outputPath).catch(() => undefined)}
                  >
                    <FolderOpen className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>

            {isFinished(job.status) ? null : (
              <div className="flex items-center gap-3">
                <ProgressBar
                  value={percent}
                  indicatorClassName={job.status === 'queued' ? 'bg-muted-foreground/40' : undefined}
                />
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {job.status === 'processing' ? `${percent}%` : 'waiting for a slot'} ·{' '}
                  {stages[job.id] ?? 'queued'}
                </span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
