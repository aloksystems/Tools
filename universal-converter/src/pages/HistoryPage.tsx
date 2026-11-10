import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatBytes, formatLabel, formatSavings, fileName } from '@/utils/format'
import { api } from '@/utils/api'
import { isTauriRuntime } from '@/utils/tauri'
import { confirm } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { FolderOpen, Star, Trash, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { FavoriteEntry, HistoryEntry, JobStatus } from '@/types/converter'

const PAGE = 50

const STATUS_LABEL: Record<JobStatus, { label: string; badge: 'success' | 'destructive' | 'warning' | 'muted' | 'default' }> = {
  completed: { label: 'Done', badge: 'success' },
  failed: { label: 'Failed', badge: 'destructive' },
  cancelled: { label: 'Cancelled', badge: 'warning' },
  queued: { label: 'Queued', badge: 'muted' },
  processing: { label: 'Running', badge: 'default' },
}

function when(ms: number): string {
  return new Date(ms).toLocaleString()
}

export function HistoryPage() {
  const [rows, setRows] = useState<HistoryEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (offset: number) => {
    if (!isTauriRuntime()) return
    try {
      const page = await api.loadHistory(PAGE, offset)
      setRows((current) => (offset === 0 ? page : [...current, ...page]))
      setHasMore(page.length === PAGE)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(0)
    if (!isTauriRuntime()) return
    api
      .listFavorites()
      .then(setFavorites)
      .catch(() => undefined)
  }, [load])

  const pinned = new Set(favorites.map((entry) => entry.path))

  const toggleFavorite = async (entry: HistoryEntry) => {
    const favorite = !pinned.has(entry.inputPath)
    try {
      await api.setFavorite(entry.inputPath, entry.inputFormat, favorite)
      setFavorites((current) =>
        favorite
          ? [
              { path: entry.inputPath, format: entry.inputFormat, addedAtMs: Date.now() },
              ...current.filter((item) => item.path !== entry.inputPath),
            ]
          : current.filter((item) => item.path !== entry.inputPath),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const forget = async (entry: HistoryEntry) => {
    const yes = await confirm(
      `Forget every record of ${fileName(entry.inputPath)}? The converted file itself is not deleted.`,
      { title: 'Forget this file', kind: 'warning' },
    )
    if (!yes) return
    await api.forgetHistory(entry.inputPath)
    setRows((current) => current.filter((row) => row.inputPath !== entry.inputPath))
    setFavorites((current) => current.filter((item) => item.path !== entry.inputPath))
  }

  const clearAll = async () => {
    const yes = await confirm('Delete the whole conversion history? Files on disk are not touched.', {
      title: 'Clear history',
      kind: 'warning',
    })
    if (!yes) return
    await api.clearHistory()
    setRows([])
    setHasMore(false)
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} record{rows.length === 1 ? '' : 's'} kept in the local database.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={rows.length === 0} onClick={() => void clearAll()}>
          <Trash className="size-3.5" />
          Clear history
        </Button>
      </header>

      {error ? (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <X className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {rows.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing converted yet. History appears here after a job finishes.
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {rows.map((entry) => {
          const meta = STATUS_LABEL[entry.status]
          const savings = formatSavings(entry.inputBytes, entry.outputBytes)
          return (
            <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={entry.inputPath}>
                  {fileName(entry.inputPath)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatLabel(entry.inputFormat)} → {formatLabel(entry.outputFormat)}
                  {' · '}
                  {formatBytes(entry.inputBytes)}
                  {entry.outputBytes ? ` → ${formatBytes(entry.outputBytes)}` : ''}
                  {savings ? ` (${savings})` : ''}
                  {' · '}
                  {when(entry.createdAtMs)}
                </p>
                {entry.status === 'completed' ? (
                  <p className="truncate text-xs text-muted-foreground" title={entry.outputPath}>
                    {entry.outputPath}
                  </p>
                ) : null}
                {entry.error ? <p className="mt-1 text-xs text-destructive">{entry.error}</p> : null}
              </div>

              <Badge variant={meta.badge} className="mt-0.5 shrink-0">
                {meta.label}
              </Badge>

              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={
                    pinned.has(entry.inputPath)
                      ? `Remove ${fileName(entry.inputPath)} from favourites`
                      : `Pin ${fileName(entry.inputPath)} to favourites`
                  }
                  aria-pressed={pinned.has(entry.inputPath)}
                  title={pinned.has(entry.inputPath) ? 'Remove from favourites' : 'Pin to favourites'}
                  onClick={() => void toggleFavorite(entry)}
                >
                  <Star
                    className={
                      pinned.has(entry.inputPath)
                        ? 'size-3.5 fill-amber-400 text-amber-400'
                        : 'size-3.5'
                    }
                  />
                </Button>
                {entry.status === 'completed' ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Show ${fileName(entry.outputPath)}`}
                    title="Show the converted file"
                    onClick={() => void revealItemInDir(entry.outputPath).catch(() => undefined)}
                  >
                    <FolderOpen className="size-3.5" />
                  </Button>
                ) : null}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Forget ${fileName(entry.inputPath)}`}
                  title="Forget this file"
                  onClick={() => void forget(entry)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {hasMore ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            void load(rows.length)
          }}
        >
          {loading ? 'Loading…' : 'Load 50 more'}
        </Button>
      ) : null}
    </div>
  )
}
