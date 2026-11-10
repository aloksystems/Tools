import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { asPdfSettings } from '@/features/pdf/settings'
import { pickDirectoryDialog } from '@/hooks/useFilesDrop'
import type { ConversionSettings, FileProbe, ImageExtraction, PdfComparison, PdfDeepInfo } from '@/types/converter'
import { api } from '@/utils/api'
import { isTauriRuntime } from '@/utils/tauri'
import { ArrowLeftRight, FolderSearch, Images, Loader2, ScanSearch } from 'lucide-react'
import { useState } from 'react'

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`
}

/**
 * Read-only and extraction tools that do not fit the job model: an inspector,
 * a folder of embedded images, and a pixel comparison of two documents.
 */
export function PdfTools({
  files,
  settings,
}: {
  files: FileProbe[]
  settings: ConversionSettings
}) {
  const pdfs = files.filter((file) => file.format === 'pdf')
  const value = asPdfSettings(settings)
  const [busy, setBusy] = useState<'inspect' | 'extract' | 'compare' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<PdfDeepInfo | null>(null)
  const [extraction, setExtraction] = useState<ImageExtraction | null>(null)
  const [comparison, setComparison] = useState<PdfComparison | null>(null)

  if (pdfs.length === 0) return null
  const source = pdfs[0]!
  const ranges = value.pageMode === 'all' ? '' : value.pageRanges

  const inspect = async () => {
    if (!isTauriRuntime()) {
      setError('Run with npm run tauri dev — the inspector needs the Rust backend.')
      return
    }
    setBusy('inspect')
    setError(null)
    try {
      setInfo(await api.inspectPdfDeep(source.path, value.password))
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const extract = async () => {
    if (!isTauriRuntime()) {
      setError('Run with npm run tauri dev — extraction needs the Rust backend.')
      return
    }
    const directory = await pickDirectoryDialog()
    if (!directory) return
    setBusy('extract')
    setError(null)
    setExtraction(null)
    try {
      setExtraction(await api.extractPdfImages(source.path, value.password, ranges, directory))
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const compare = async () => {
    const second = pdfs[1]
    if (!second) return
    setBusy('compare')
    setError(null)
    setComparison(null)
    try {
      setComparison(
        await api.comparePdfs(source.path, value.password, second.path, value.password),
      )
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">PDF tools</CardTitle>
        <CardDescription>
          Inspect the object graph, pull embedded images out, or compare two PDFs pixel by pixel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void inspect()}>
            {busy === 'inspect' ? <Loader2 className="size-3.5 animate-spin" /> : <ScanSearch className="size-3.5" />}
            Inspect structure
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void extract()}>
            {busy === 'extract' ? <Loader2 className="size-3.5 animate-spin" /> : <Images className="size-3.5" />}
            Extract embedded images
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || pdfs.length < 2}
            title={pdfs.length < 2 ? 'Stage at least two PDFs to compare them' : undefined}
            onClick={() => void compare()}
          >
            {busy === 'compare' ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowLeftRight className="size-3.5" />}
            Compare first two PDFs
          </Button>
        </div>

        {error ? (
          <p className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p>
        ) : null}

        {info ? (
          <div className="rounded-lg border p-3 text-xs">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">File</dt>
              <dd className="break-all">{info.path}</dd>
              <dt className="text-muted-foreground">Size</dt>
              <dd>{sizeLabel(info.fileSize)}</dd>
              <dt className="text-muted-foreground">PDF version</dt>
              <dd>{info.version}</dd>
              <dt className="text-muted-foreground">Pages</dt>
              <dd>{info.pageCount}</dd>
              <dt className="text-muted-foreground">Images</dt>
              <dd>{info.imageCount}</dd>
              <dt className="text-muted-foreground">Annotations</dt>
              <dd>{info.annotationCount}</dd>
              <dt className="text-muted-foreground">Fonts</dt>
              <dd className="break-words">{info.fonts.length > 0 ? info.fonts.join(', ') : '—'}</dd>
              <dt className="text-muted-foreground">Bookmarks</dt>
              <dd>{info.bookmarks}</dd>
              <dt className="text-muted-foreground">Form fields</dt>
              <dd>{info.formFields}</dd>
              <dt className="text-muted-foreground">Page labels</dt>
              <dd>{info.hasPageLabels ? 'Yes' : 'No'}</dd>
              <dt className="text-muted-foreground">Tagged</dt>
              <dd>{info.tagged ? 'Yes' : 'No'}</dd>
              <dt className="text-muted-foreground">Embedded files</dt>
              <dd>{info.embeddedFiles}</dd>
            </dl>
            <div className="mt-3 max-h-56 overflow-auto rounded border">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-2 py-1">Page</th>
                    <th className="px-2 py-1">Size (pt)</th>
                    <th className="px-2 py-1">Rotation</th>
                    <th className="px-2 py-1">Images</th>
                    <th className="px-2 py-1">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {info.pages.slice(0, 50).map((page) => (
                    <tr key={page.number} className="border-t">
                      <td className="px-2 py-1 tabular-nums">{page.number}</td>
                      <td className="px-2 py-1 tabular-nums">
                        {Math.round(page.widthPt)} × {Math.round(page.heightPt)}
                      </td>
                      <td className="px-2 py-1 tabular-nums">{page.rotation}°</td>
                      <td className="px-2 py-1 tabular-nums">{page.imageCount}</td>
                      <td className="px-2 py-1 tabular-nums">{page.annotationCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {info.pages.length > 50 ? (
              <p className="mt-1 text-muted-foreground">
                Showing the first 50 of {info.pages.length} pages.
              </p>
            ) : null}
          </div>
        ) : null}

        {extraction ? (
          <div className="rounded-lg border p-3 text-xs">
            <p>
              Wrote {extraction.images.length} image
              {extraction.images.length === 1 ? '' : 's'} into {extraction.directory}.
            </p>
            {extraction.images.length > 0 ? (
              <ul className="mt-2 max-h-40 overflow-auto text-muted-foreground">
                {extraction.images.map((image) => (
                  <li key={image.path} className="truncate" title={image.path}>
                    page {image.page}: {image.width} × {image.height} {image.format.toUpperCase()}
                  </li>
                ))}
              </ul>
            ) : null}
            {extraction.skipped.length > 0 ? (
              <div className="mt-2 text-amber-700 dark:text-amber-300">
                <p className="font-medium">Skipped:</p>
                <ul className="max-h-32 overflow-auto">
                  {extraction.skipped.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-2 flex items-center gap-1 text-muted-foreground">
              <FolderSearch className="size-3" /> {extraction.directory}
            </p>
          </div>
        ) : null}

        {comparison ? (
          <div className="rounded-lg border p-3 text-xs">
            <p>
              {comparison.identical
                ? 'The two documents render identically at 96 DPI.'
                : 'The documents differ.'}{' '}
              Page counts: {comparison.pageCountA} and {comparison.pageCountB}.
            </p>
            {comparison.note ? (
              <p className="mt-1 text-amber-700 dark:text-amber-300">{comparison.note}</p>
            ) : null}
            {comparison.pages.length > 0 ? (
              <div className="mt-2 max-h-48 overflow-auto rounded border">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-1">Page</th>
                      <th className="px-2 py-1">Different pixels</th>
                      <th className="px-2 py-1">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.pages.map((page) => (
                      <tr key={page.page} className="border-t">
                        <td className="px-2 py-1 tabular-nums">{page.page}</td>
                        <td className="px-2 py-1 tabular-nums">
                          {page.differentPixels.toLocaleString()} / {page.totalPixels.toLocaleString()}
                        </td>
                        <td className="px-2 py-1 tabular-nums">
                          {(page.difference * 100).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
