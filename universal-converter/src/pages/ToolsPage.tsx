import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Bot, Search, Sparkles, Tags, Workflow, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ComponentType } from 'react'

const TOOLS: {
  to: string
  title: string
  description: string
  keywords: string
  icon: ComponentType<{ className?: string }>
}[] = [
  {
    to: '/metadata',
    title: 'Metadata Studio',
    description:
      'Read, edit, compare and verifiably remove EXIF, GPS, PDF info and media tags. Encrypted PDFs are supported.',
    keywords: 'exif gps tags pdf info privacy strip remove edit compare camera location author',
    icon: Tags,
  },
  {
    to: '/utilities',
    title: 'File Utilities',
    description:
      'Hashes, checksum verification, byte-level comparison, duplicate finding, folder sizes, file info and image comparison.',
    keywords:
      'sha256 sha512 sha1 md5 hash checksum verify compare duplicates size folder signature magic image diff info',
    icon: Wrench,
  },
  {
    to: '/automation',
    title: 'Automation Studio',
    description:
      'Watch folders and queue conversions or OCR as files arrive. Outputs never re-trigger the watcher, originals are never deleted.',
    keywords: 'watch folder monitor automate rules ocr convert logs pause resume inbox',
    icon: Bot,
  },
  {
    to: '/workflows',
    title: 'Workflows',
    description:
      'Chain up to six conversion or OCR steps and run them over one file or a whole batch, with cancellation and temp cleanup.',
    keywords: 'pipeline multi-step batch chain sequence convert ocr run cancel',
    icon: Workflow,
  },
  {
    to: '/presets',
    title: 'Presets',
    description:
      'Manage reusable engine settings, install starters, duplicate, and import or export a validated JSON bundle.',
    keywords: 'preset settings apply import export duplicate starter default json',
    icon: Sparkles,
  },
]

export function ToolsPage() {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible =
    needle === ''
      ? TOOLS
      : TOOLS.filter((tool) =>
          `${tool.title} ${tool.description} ${tool.keywords}`.toLowerCase().includes(needle),
        )

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Wrench className="size-5" />
          Advanced Tools
        </h1>
        <p className="text-sm text-muted-foreground">
          Inspection, metadata, automation and pipelines. Every tool runs on this PC; nothing is
          uploaded.
        </p>
      </header>

      <label className="relative max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools — try “hash”, “exif”, “watch”, “pipeline”…"
          className="h-9 pl-8"
        />
      </label>

      {needle !== '' ? (
        <p className="text-xs text-muted-foreground">
          {visible.length} tool{visible.length === 1 ? '' : 's'} match “{query.trim()}”.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No tool matches that search.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map(({ to, title, description, icon: Icon }) => (
            <Link key={to} to={to} className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
              <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
                <CardContent className="flex flex-col gap-2 pt-5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <p className="text-sm font-semibold">{title}</p>
                    <Badge variant="muted" className="ml-auto">
                      Local
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
