import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/stores/appStore'
import { useQueueStore } from '@/stores/queueStore'
import { api } from '@/utils/api'
import { isTauriRuntime } from '@/utils/tauri'
import { fileName, formatLabel } from '@/utils/format'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { ChevronRight, CircleCheck, CircleDashed, FolderOpen, HardDrive, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FavoriteEntry } from '@/types/converter'

const SHORTCUTS: { to: string; label: string; blurb: string }[] = [
  { to: '/quick', label: 'Quick Convert', blurb: 'Drop mixed files and convert with defaults' },
  { to: '/image', label: 'Images', blurb: 'Resize, compress and convert raster files' },
  { to: '/pdf', label: 'PDF', blurb: 'Images to PDF, pages to images, rotate, split' },
  { to: '/ocr', label: 'OCR', blurb: 'Read text from images and scanned PDFs' },
  { to: '/documents', label: 'Documents', blurb: 'Office and text files to PDF' },
  { to: '/audio', label: 'Audio', blurb: 'Bitrate, sample rate and channel control' },
  { to: '/video', label: 'Video', blurb: 'Containers, audio extraction and GIFs' },
  { to: '/archives', label: 'Archives', blurb: 'Repack between ZIP, 7Z and TAR families' },
]

export function HomePage() {
  const engines = useAppStore((state) => state.engines)
  const resources = useAppStore((state) => state.resources)
  const loadError = useAppStore((state) => state.loadError)
  const stats = useQueueStore((state) => state.stats)
  const [recent, setRecent] = useState<string[]>([])
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([])

  useEffect(() => {
    if (!isTauriRuntime()) return
    api
      .recentFiles(6)
      .then(setRecent)
      .catch(() => undefined)
    api
      .listFavorites()
      .then(setFavorites)
      .catch(() => undefined)
  }, [])

  const ready = engines.filter((engine) => engine.available).length

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Universal Converter</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Batch file conversion that runs entirely on this machine. No account, no upload, and a
          converted file never replaces the one you started with.
        </p>
      </header>

      {loadError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <HardDrive className="size-4" />
            Engines on this machine
          </CardTitle>
          <CardDescription>
            {engines.length === 0
              ? 'Checking the tools installed on this machine…'
              : `${ready} of ${engines.length} ready. The rest need a tool you can install or drop in`}
            {engines.length === 0 ? null : (
              <code className="mx-1 rounded bg-muted px-1">resources/</code>
            )}
            {engines.length === 0 ? null : '.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {engines.map((engine) => {
              const version = engine.available ? (engine.version ?? 'ready') : 'not installed'
              return (
                <li
                  key={engine.id}
                  className="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
                >
                  {engine.available ? (
                    <CircleCheck className="size-4 shrink-0 text-success" />
                  ) : (
                    <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" title={engine.label}>
                      {engine.label}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={version}>
                      {version}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SHORTCUTS.map((shortcut) => (
          <Link key={shortcut.to} to={shortcut.to} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  {shortcut.label}
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardTitle>
                <CardDescription>{shortcut.blurb}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {favorites.length > 0 ? (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            Favourites
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {favorites.map((entry) => (
              <li key={entry.path} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm" title={entry.path}>
                  {fileName(entry.path)}
                </span>
                <Badge variant="muted" className="shrink-0">
                  {formatLabel(entry.format)}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  aria-label={`Show ${fileName(entry.path)} in the folder`}
                  onClick={() => void revealItemInDir(entry.path).catch(() => undefined)}
                >
                  <FolderOpen className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  aria-label={`Unpin ${fileName(entry.path)}`}
                  onClick={() => {
                    void api
                      .setFavorite(entry.path, entry.format, false)
                      .then(() =>
                        setFavorites((current) =>
                          current.filter((item) => item.path !== entry.path),
                        ),
                      )
                      .catch(() => undefined)
                  }}
                >
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recently converted</h2>
          <Link to="/queue">
            <Button size="sm" variant="ghost" className="h-7 text-xs">
              Queue: {stats.active}/{stats.limit} busy, {stats.queued} waiting
            </Button>
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Files show up here after their first conversion.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {recent.map((path) => (
              <li key={path} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm" title={path}>
                  {fileName(path)}
                </span>
                <Badge variant="muted" className="shrink-0">
                  recent
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  aria-label={`Show ${fileName(path)} in the folder`}
                  onClick={() => void revealItemInDir(path).catch(() => undefined)}
                >
                  <FolderOpen className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <p className="text-xs text-muted-foreground">
        {resources
          ? `${resources.cpuCores} cores · ${Math.round(resources.availableMemoryMb / 1024)} GB free of ${Math.round(resources.totalMemoryMb / 1024)} GB · up to ${resources.recommendedConcurrency} jobs at once`
          : 'Reading system resources…'}
      </p>
    </div>
  )
}
