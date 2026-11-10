import { JobTable } from '@/components/conversion/JobTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isFinished, selectCounts, useQueueStore } from '@/stores/queueStore'
import { TimerReset, X } from 'lucide-react'
import { useState } from 'react'

type Filter = 'all' | 'active' | 'finished'

export function QueuePage() {
  const jobs = useQueueStore((state) => state.jobs)
  const stats = useQueueStore((state) => state.stats)
  const loaded = useQueueStore((state) => state.loaded)
  const notice = useQueueStore((state) => state.notice)
  const dismissNotice = useQueueStore((state) => state.dismissNotice)
  const clearFinished = useQueueStore((state) => state.clearFinished)
  const [filter, setFilter] = useState<Filter>('all')

  const counts = selectCounts(jobs)
  const visible = jobs.filter((job) =>
    filter === 'all' ? true : filter === 'active' ? !isFinished(job.status) : isFinished(job.status),
  )
  const finished = counts.completed + counts.failed + counts.cancelled

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Queue</h1>
          <p className="text-sm text-muted-foreground">
            {stats.active} of {stats.limit} slots busy · {counts.queued} waiting ·{' '}
            {counts.completed} done · {counts.failed} failed · {counts.cancelled} cancelled
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={finished === 0} onClick={() => void clearFinished()}>
          <TimerReset className="size-3.5" />
          Clear finished
        </Button>
      </header>

      {notice ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <X className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{notice}</p>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={dismissNotice}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
        <TabsList>
          <TabsTrigger value="all">All {counts.total > 0 ? <Badge variant="muted" className="ml-1.5">{counts.total}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="active">
            Active {counts.queued + counts.processing > 0 ? (
              <Badge variant="muted" className="ml-1.5">{counts.queued + counts.processing}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="finished">
            Finished {finished > 0 ? <Badge variant="muted" className="ml-1.5">{finished}</Badge> : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length > 0 ? (
        <JobTable jobs={visible} />
      ) : (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {loaded
            ? 'Nothing here yet. Drop files into any converter page and press Convert.'
            : 'Connecting to the conversion queue…'}
        </p>
      )}
    </div>
  )
}
