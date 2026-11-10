import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { StudioProps } from '@/features/types'
import type { MediaStream } from '@/types/converter'
import { api } from '@/utils/api'
import { fileName, formatBytes, formatDuration } from '@/utils/format'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMediaInfo } from './useMediaInfo'

function streamSummary(stream: MediaStream): string {
  if (stream.kind === 'video') {
    const size =
      stream.width && stream.height ? `${stream.width}×${stream.height}` : 'unknown size'
    const rate =
      stream.frameRate === null || stream.frameRate === undefined
        ? ''
        : ` · ${stream.frameRate.toFixed(stream.frameRate % 1 === 0 ? 0 : 2)} fps`
    return `${stream.codec.toUpperCase()} · ${size}${rate}`
  }
  if (stream.kind === 'audio') {
    const rate =
      stream.sampleRate === null || stream.sampleRate === undefined
        ? ''
        : ` · ${(stream.sampleRate / 1000).toFixed(stream.sampleRate % 1000 === 0 ? 0 : 1)} kHz`
    const channels =
      stream.channels === 1 ? 'mono' : stream.channels === 2 ? 'stereo' : stream.channels ? `${stream.channels} ch` : ''
    const bitrate =
      stream.bitRate === null || stream.bitRate === undefined
        ? ''
        : ` · ${Math.round(stream.bitRate / 1000)} kbps`
    return `${stream.codec.toUpperCase()}${rate}${channels ? ` · ${channels}` : ''}${bitrate}`
  }
  return stream.codec
}

function label(stream: MediaStream): string {
  const parts = [stream.kind === 'video' && stream.attachedPic ? 'cover art' : stream.kind]
  if (stream.language) parts.push(stream.language)
  if (stream.title) parts.push(stream.title)
  return parts.join(' · ')
}

/**
 * What ffprobe says about the first staged file, plus a poster frame and — when
 * the output is a GIF — a short preview rendered through the real palette chain.
 */
export function MediaInspector({ files, settings, outputFormat }: StudioProps) {
  const file = files[0]
  const { info, loading, error, reload } = useMediaInfo(file?.path)

  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [thumbnailError, setThumbnailError] = useState<string | null>(null)
  const [thumbnailLoading, setThumbnailLoading] = useState(false)

  const [gif, setGif] = useState<string | null>(null)
  const [gifError, setGifError] = useState<string | null>(null)
  const [gifLoading, setGifLoading] = useState(false)

  const hasRealVideo = Boolean(
    info?.streams.some((stream) => stream.kind === 'video' && !stream.attachedPic),
  )
  const path = file?.path

  useEffect(() => {
    setGif(null)
    setGifError(null)
    if (!path || !hasRealVideo) {
      setThumbnail(null)
      setThumbnailError(null)
      return
    }
    let active = true
    setThumbnailLoading(true)
    setThumbnailError(null)
    void api
      .mediaThumbnail(path, 0, 360)
      .then((url) => {
        if (active) setThumbnail(url)
      })
      .catch((reason: unknown) => {
        if (active) {
          setThumbnail(null)
          setThumbnailError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .finally(() => {
        if (active) setThumbnailLoading(false)
      })
    return () => {
      active = false
    }
  }, [path, hasRealVideo])

  if (!file) return null

  const startMs = typeof settings.startMs === 'number' ? settings.startMs : null
  const durationMs = typeof settings.durationMs === 'number' ? settings.durationMs : null
  const gifFps = typeof settings.gifFps === 'number' ? settings.gifFps : 12
  const gifWidthPx = typeof settings.gifWidthPx === 'number' ? settings.gifWidthPx : 640
  const gifHeightPx = typeof settings.gifHeightPx === 'number' ? settings.gifHeightPx : 0

  const previewGif = async () => {
    setGifLoading(true)
    setGifError(null)
    const previewWidth = Math.min(gifWidthPx, 360)
    const previewHeight =
      gifHeightPx > 0
        ? Math.max(120, Math.round((gifHeightPx * previewWidth) / gifWidthPx))
        : 0
    try {
      setGif(
        await api.gifPreview(
          file.path,
          startMs,
          durationMs,
          gifFps,
          previewWidth,
          previewHeight,
        ),
      )
    } catch (reason) {
      setGif(null)
      setGifError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setGifLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Media info</CardTitle>
            <CardDescription>
              {fileName(file.path)}
              {files.length > 1 ? ` · first of ${files.length} files` : ''}
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" disabled={loading} onClick={reload}>
            <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading && !info ? (
          <p className="text-xs text-muted-foreground">Reading metadata with ffprobe…</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {info ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Container</dt>
                <dd className="truncate text-right">{info.formatLabel}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Duration</dt>
                <dd>{info.durationMs ? formatDuration(info.durationMs) : 'unknown'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Size</dt>
                <dd>{formatBytes(info.sizeBytes)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Bitrate</dt>
                <dd>{info.bitRate ? `${Math.round(info.bitRate / 1000)} kbps` : 'unknown'}</dd>
              </div>
              {info.title ? (
                <div className="col-span-2 flex justify-between gap-2">
                  <dt className="text-muted-foreground">Title</dt>
                  <dd className="truncate text-right">{info.title}</dd>
                </div>
              ) : null}
            </dl>

            {thumbnail ? (
              <img
                src={thumbnail}
                alt={`Poster frame of ${fileName(file.path)}`}
                className="max-h-52 w-full rounded-md border border-border/60 object-contain"
              />
            ) : null}
            {thumbnailLoading ? (
              <p className="text-xs text-muted-foreground">Rendering a poster frame…</p>
            ) : null}
            {thumbnailError ? (
              <p className="text-xs text-destructive">{thumbnailError}</p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              {info.streams.map((stream) => (
                <div
                  key={stream.index}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
                >
                  <span className="shrink-0 font-medium capitalize">{label(stream)}</span>
                  <span className="truncate text-right text-muted-foreground">
                    {streamSummary(stream)}
                  </span>
                </div>
              ))}
            </div>

            {outputFormat === 'gif' ? (
              <div className="flex flex-col gap-2 rounded-md border border-border/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Real palette preview, capped at 3 s and 360 px. GIF output is limited to 30 s.
                  </p>
                  <Button size="sm" variant="outline" disabled={gifLoading} onClick={previewGif}>
                    {gifLoading ? 'Rendering…' : 'Preview'}
                  </Button>
                </div>
                {gif ? (
                  <img
                    src={gif}
                    alt="GIF preview"
                    className="max-h-52 w-full rounded-md object-contain"
                  />
                ) : null}
                {gifError ? <p className="text-xs text-destructive">{gifError}</p> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
