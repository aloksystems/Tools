import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pickAnyFilesDialog } from '@/hooks/useFilesDrop'
import type { ImageComparison, ImageInfo } from '@/types/tools'
import { api } from '@/utils/api'
import { formatBytes, fileName } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { FileImage, GitCompareArrows, Image as ImageIcon } from 'lucide-react'
import { useState } from 'react'
import { BusyButton, Field, ToolError } from './shared'

export function ImageToolsPanel() {
  const [pathA, setPathA] = useState<string | null>(null)
  const [pathB, setPathB] = useState<string | null>(null)
  const [info, setInfo] = useState<ImageInfo | null>(null)
  const [comparison, setComparison] = useState<ImageComparison | null>(null)
  const [busy, setBusy] = useState<'info' | 'compare' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pick = async (slot: 'a' | 'b') => {
    const [next] = await pickAnyFilesDialog()
    if (!next) return
    if (slot === 'a') {
      setPathA(next)
      setInfo(null)
      setComparison(null)
      setBusy('info')
      setError(null)
      try {
        setInfo(await api.imageInfo(next))
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setBusy(null)
      }
    } else {
      setPathB(next)
      setComparison(null)
    }
  }

  const inspect = async () => {
    if (!pathA) return
    setBusy('info')
    setError(null)
    try {
      setInfo(await api.imageInfo(pathA))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const compare = async () => {
    if (!pathA || !pathB) return
    setBusy('compare')
    setError(null)
    setComparison(null)
    try {
      setComparison(await api.compareImages(pathA, pathB))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Image info & pixel comparison</CardTitle>
        <CardDescription>
          Header values are read without decoding the pixels. Comparison decodes both images at full
          resolution and tolerates ±8 per channel before flagging a pixel as different.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 p-2.5">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] tracking-wide text-muted-foreground uppercase">
              <ImageIcon className="size-3" /> Image A
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => void pick('a')} disabled={!isTauriRuntime()}>
              <FileImage className="size-3.5" />
              {pathA ? 'Change…' : 'Choose an image…'}
            </Button>
            {pathA ? (
              <p className="mt-1.5 truncate text-xs" title={pathA}>
                {fileName(pathA)}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-border/70 p-2.5">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] tracking-wide text-muted-foreground uppercase">
              <ImageIcon className="size-3" /> Image B (optional)
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => void pick('b')} disabled={!isTauriRuntime()}>
              <FileImage className="size-3.5" />
              {pathB ? 'Change…' : 'Choose an image…'}
            </Button>
            {pathB ? (
              <p className="mt-1.5 truncate text-xs" title={pathB}>
                {fileName(pathB)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <BusyButton size="sm" variant="outline" busy={busy === 'info'} onClick={() => void inspect()} disabled={!isTauriRuntime() || !pathA}>
            <ImageIcon className="size-3.5" />
            Inspect A
          </BusyButton>
          <BusyButton size="sm" busy={busy === 'compare'} onClick={() => void compare()} disabled={!isTauriRuntime() || !pathA || !pathB}>
            <GitCompareArrows className="size-3.5" />
            Compare pixels
          </BusyButton>
        </div>

        <ToolError error={error} />

        {info ? (
          <dl className="grid gap-3 rounded-lg border border-border/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Format">
              {info.formatLabel} · {info.mimeType}
            </Field>
            <Field label="Dimensions">
              {info.width} × {info.height} px
            </Field>
            <Field label="Colour">
              {info.colorType} · {info.bitsPerPixel} bit/px
            </Field>
            <Field label="Alpha">{info.hasAlpha ? 'Yes' : 'No'}</Field>
            <Field label="Megapixels">{info.megapixels.toFixed(2)} MP</Field>
            <Field label="File size">{formatBytes(info.sizeBytes)}</Field>
            <Field label="Extension">{info.extension ?? 'none'}</Field>
          </dl>
        ) : null}

        {comparison ? (
          <div className="rounded-lg border border-border/70">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-3 py-2">
              <span className="text-xs font-semibold">
                {comparison.identical
                  ? 'The pixels are identical within tolerance'
                  : `${comparison.differentPixels.toLocaleString()} pixels differ`}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={comparison.identical ? 'success' : 'warning'}>
                  {comparison.identical ? 'Identical' : `${comparison.differencePercent.toFixed(2)}% changed`}
                </Badge>
                <Badge variant={comparison.sameDimensions ? 'outline' : 'destructive'}>
                  {comparison.sameDimensions
                    ? `${comparison.widthA} × ${comparison.heightA}`
                    : `${comparison.widthA}×${comparison.heightA} vs ${comparison.widthB}×${comparison.heightB}`}
                </Badge>
              </div>
            </div>
            <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_260px]">
              <div>
                <p className="text-xs break-all text-muted-foreground">
                  {comparison.nameA} → {comparison.nameB}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {comparison.differentPixels.toLocaleString()} of{' '}
                  {comparison.totalPixels.toLocaleString()} pixels changed.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{comparison.note}</p>
              </div>
              <figure>
                <img
                  src={comparison.previewDataUrl}
                  alt="Differences between the two images, changed pixels highlighted in red"
                  className="max-h-60 w-full rounded-md border border-border/70 object-contain"
                />
                <figcaption className="mt-1 text-center text-[11px] text-muted-foreground">
                  Changed pixels highlighted in red
                </figcaption>
              </figure>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
