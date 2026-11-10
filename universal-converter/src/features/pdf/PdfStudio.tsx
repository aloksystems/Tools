import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { missingDependencyNotice, usePdfCapabilities } from '@/features/pdf/capabilities'
import { PdfTools } from '@/features/pdf/PdfTools'
import { asPdfSettings } from '@/features/pdf/settings'
import type { StudioProps } from '@/features/types'
import { api } from '@/utils/api'
import { isTauriRuntime } from '@/utils/tauri'
import { ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PdfDocumentInfo } from '@/types/converter'
import { cn } from '@/lib/utils'

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/** One lazy page preview; a 500-page PDF only renders what the user scrolls to. */
function PdfThumbnail({
  path,
  password,
  page,
  token,
}: {
  path: string
  password: string
  page: number
  token: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = container.current
    if (!element || !isTauriRuntime()) return
    let cancelled = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void api
          .pdfPagePreview(path, password, page, 200)
          .then((data) => {
            if (!cancelled) setSource(data)
          })
          .catch(() => {
            if (!cancelled) setFailed(true)
          })
      },
      { rootMargin: '240px' },
    )
    observer.observe(element)
    return () => {
      cancelled = true
      observer.disconnect()
    }
    // The password only changes after Unlock, which remounts this tile via `token`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, page, token])

  return (
    <div
      ref={container}
      className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md bg-muted"
    >
      {source ? (
        <img src={source} alt={`Page ${page}`} className="max-h-full max-w-full object-contain" draggable={false} />
      ) : failed ? (
        <span className="px-2 text-center text-[11px] text-muted-foreground">No preview</span>
      ) : (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words" title={value}>
        {value}
      </dd>
    </>
  )
}

/**
 * The page grid for one PDF: inspect metadata, drag pages into a new order,
 * hide pages from the selection, then write that order/selection into the job
 * options. It never starts a job itself.
 */
export function PdfStudio({ settings, onChange, files }: StudioProps) {
  const value = asPdfSettings(settings)
  const pdfs = files.filter((file) => file.format === 'pdf')
  const { capabilities } = usePdfCapabilities()
  const previewCapability = capabilities?.find((entry) => entry.operation === 'pdfToImages')
  const previewsAvailable = previewCapability?.available !== false

  const [focus, setFocus] = useState('')
  const active = pdfs.some((file) => file.path === focus) ? focus : (pdfs[0]?.path ?? '')
  const [info, setInfo] = useState<PdfDocumentInfo | null>(null)
  const [order, setOrder] = useState<number[]>([])
  const [included, setIncluded] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [dragging, setDragging] = useState<number | null>(null)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!active) {
      setInfo(null)
      setOrder([])
      setIncluded(new Set())
      return
    }
    if (!isTauriRuntime()) {
      setError('Run with npm run tauri dev — previews need the Rust backend.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setInfo(null)
    void api
      .inspectPdf(active, value.password)
      .then((next) => {
        if (cancelled) return
        const pages = Array.from({ length: next.pageCount }, (_, index) => index + 1)
        setInfo(next)
        setOrder(pages)
        setIncluded(new Set(pages))
        setApplied(false)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(message(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // The password only takes effect on Unlock (reloadToken), not per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reloadToken])

  if (pdfs.length === 0) return null

  const move = (from: number, to: number) => {
    if (from === to) return
    setOrder((previous) => {
      const next = [...previous]
      const [moved] = next.splice(from, 1)
      if (moved === undefined || to < 0 || to >= next.length + 1) return previous
      next.splice(to, 0, moved)
      return next
    })
    setApplied(false)
  }

  const toggle = (page: number) => {
    setIncluded((previous) => {
      const next = new Set(previous)
      if (next.has(page)) next.delete(page)
      else next.add(page)
      return next
    })
    setApplied(false)
  }

  const selection = order.filter((page) => included.has(page))

  const apply = () => {
    if (selection.length === 0) return
    onChange({
      pageOrder: selection.join(','),
      pageRanges: [...selection].sort((a, b) => a - b).join(','),
    })
    setApplied(true)
  }

  const reset = () => {
    if (!info) return
    const pages = Array.from({ length: info.pageCount }, (_, index) => index + 1)
    setOrder(pages)
    setIncluded(new Set(pages))
    setApplied(false)
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm">PDF Studio</CardTitle>
          <CardDescription>
            Inspect the document, arrange pages, and apply that order or selection to the options.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pdfs.length > 1 ? (
            <Select value={active} onValueChange={setFocus}>
              <SelectTrigger className="h-8 w-52">
                <SelectValue placeholder="Choose a PDF" />
              </SelectTrigger>
              <SelectContent>
                {pdfs.map((file) => (
                  <SelectItem key={file.path} value={file.path}>
                    {file.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Re-open the document"
            title="Re-open (retry with the current password)"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Reading the document…
          </p>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
            <p>{error}</p>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                value={value.password}
                placeholder="PDF password"
                className="h-8 flex-1 bg-background"
                onChange={(event) => onChange({ password: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setReloadToken((token) => token + 1)
                }}
              />
              <Button size="sm" onClick={() => setReloadToken((token) => token + 1)}>
                Unlock
              </Button>
            </div>
          </div>
        ) : null}

        {info ? (
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <Detail label="Pages" value={String(info.pageCount)} />
              <Detail label="PDF version" value={info.version} />
              <Detail
                label="Encryption"
                value={info.encrypted ? 'Yes — opened with the supplied password' : 'None'}
              />
              <Detail label="Title" value={info.title || '—'} />
              <Detail label="Author" value={info.author || '—'} />
              <Detail label="Subject" value={info.subject || '—'} />
              <Detail label="Creator" value={info.creator || '—'} />
              <Detail label="Producer" value={info.producer || '—'} />
            </dl>

            {!previewsAvailable && previewCapability ? (
              <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                {missingDependencyNotice(previewCapability)} Page thumbnails and drag-ordering are
                unavailable; type a page order or range in the options instead.
              </p>
            ) : null}

            {previewsAvailable ? (
              <>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {selection.length} of {info.pageCount} page
                    {info.pageCount === 1 ? '' : 's'} kept · drag or use the arrows
                  </span>
                  <Button size="sm" variant="ghost" onClick={reset}>
                    Reset
                  </Button>
                </div>

                <div className="grid max-h-[520px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                  {order.map((page, index) => {
                    const kept = included.has(page)
                    return (
                      <div
                        key={`${active}:${reloadToken}:${page}`}
                        draggable
                        onDragStart={() => setDragging(index)}
                        onDragEnd={() => setDragging(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (dragging !== null) move(dragging, index)
                          setDragging(null)
                        }}
                        className={cn(
                          'rounded-lg border p-1.5 transition-colors',
                          dragging === index
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-card',
                          kept ? '' : 'opacity-45',
                        )}
                      >
                        <div className="relative">
                          <PdfThumbnail
                            path={active}
                            password={value.password}
                            page={page}
                            token={reloadToken}
                          />
                          <span className="absolute left-1 top-1 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                            {page}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <div className="flex items-center gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              disabled={index === 0}
                              aria-label={`Move page ${page} earlier`}
                              onClick={() => move(index, index - 1)}
                            >
                              <ChevronLeft className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              disabled={index === order.length - 1}
                              aria-label={`Move page ${page} later`}
                              onClick={() => move(index, index + 1)}
                            >
                              <ChevronRight className="size-3.5" />
                            </Button>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-label={kept ? `Exclude page ${page}` : `Include page ${page}`}
                            onClick={() => toggle(page)}
                          >
                            {kept ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {applied ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      Applied to the options.
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    disabled={selection.length === 0}
                    onClick={apply}
                  >
                    Apply order &amp; selection
                  </Button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </CardContent>
      </Card>
      <PdfTools files={files} settings={settings} />
    </>
  )
}
