import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { pickAnyFilesDialog, pickSavePath } from '@/hooks/useFilesDrop'
import type {
  MetadataComparison,
  MetadataDocument,
  MetadataEditRequest,
  MetadataKind,
  MetadataRemoval,
  MetadataWriteResult,
} from '@/types/tools'
import { api } from '@/utils/api'
import { formatBytes, fileName, fileStem } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import {
  Download,
  Eye,
  FileSearch,
  FolderOpen,
  GitCompareArrows,
  Loader2,
  ShieldOff,
  Tags,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'

const KIND_LABEL: Record<MetadataKind, string> = {
  image: 'Image',
  pdf: 'PDF',
  document: 'Document',
  audio: 'Audio',
  video: 'Video',
  archive: 'Archive',
  text: 'Text',
  other: 'File',
}

type EditKey = keyof MetadataEditRequest

const EDIT_FIELDS: Record<'pdf' | 'media', { key: EditKey; label: string }[]> = {
  pdf: [
    { key: 'title', label: 'Title' },
    { key: 'author', label: 'Author' },
    { key: 'subject', label: 'Subject' },
    { key: 'keywords', label: 'Keywords' },
    { key: 'creator', label: 'Creator' },
  ],
  media: [
    { key: 'title', label: 'Title' },
    { key: 'artist', label: 'Artist' },
    { key: 'album', label: 'Album' },
    { key: 'albumArtist', label: 'Album artist' },
    { key: 'genre', label: 'Genre' },
    { key: 'date', label: 'Date' },
    { key: 'composer', label: 'Composer' },
    { key: 'comment', label: 'Comment' },
    { key: 'copyright', label: 'Copyright' },
    { key: 'description', label: 'Description' },
  ],
}

function editFieldsFor(kind: MetadataKind): { key: EditKey; label: string }[] {
  if (kind === 'pdf') return EDIT_FIELDS.pdf
  if (kind === 'audio' || kind === 'video') return EDIT_FIELDS.media
  return []
}

function firstOf(document: MetadataDocument, group: string, ...keys: string[]): string {
  for (const key of keys) {
    const hit = document.fields.find(
      (entry) => entry.group === group && entry.key.toLowerCase() === key.toLowerCase(),
    )
    if (hit) return hit.value
  }
  return ''
}

function prefill(document: MetadataDocument): Record<string, string> {
  if (document.kind === 'pdf') {
    return {
      title: firstOf(document, 'PDF info', 'Title'),
      author: firstOf(document, 'PDF info', 'Author'),
      subject: firstOf(document, 'PDF info', 'Subject'),
      keywords: firstOf(document, 'PDF info', 'Keywords'),
      creator: firstOf(document, 'PDF info', 'Creator'),
    }
  }
  if (document.kind === 'audio' || document.kind === 'video') {
    return {
      title: firstOf(document, 'Tags', 'title'),
      artist: firstOf(document, 'Tags', 'artist'),
      album: firstOf(document, 'Tags', 'album'),
      albumArtist: firstOf(document, 'Tags', 'album_artist', 'album artist', 'albumartist'),
      genre: firstOf(document, 'Tags', 'genre'),
      date: firstOf(document, 'Tags', 'date', 'year'),
      composer: firstOf(document, 'Tags', 'composer'),
      comment: firstOf(document, 'Tags', 'comment'),
      copyright: firstOf(document, 'Tags', 'copyright'),
      description: firstOf(document, 'Tags', 'description'),
    }
  }
  return {}
}

function extensionOf(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1) : ''
}

function sibling(path: string, suffix: string): string {
  const name = fileName(path)
  const stem = fileStem(path)
  const extension = name.slice(stem.length)
  const folder = path.slice(0, path.length - name.length)
  return `${folder}${stem}${suffix}${extension}`
}

function reportPath(path: string): string {
  const name = fileName(path)
  const folder = path.slice(0, path.length - name.length)
  return `${folder}${fileStem(path)}.metadata.json`
}

function when(ms: number | null): string {
  return ms === null ? '—' : new Date(ms).toLocaleString()
}

export function MetadataPage() {
  const [document, setDocument] = useState<MetadataDocument | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'read' | 'export' | 'compare' | 'edit' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [overwrite, setOverwrite] = useState(false)
  const [written, setWritten] = useState<MetadataWriteResult | null>(null)
  const [removal, setRemoval] = useState<MetadataRemoval | null>(null)
  const [comparison, setComparison] = useState<MetadataComparison | null>(null)

  const source = isTauriRuntime()

  const load = async (nextPath: string, nextPassword: string) => {
    setBusy('read')
    setError(null)
    setNotice(null)
    setWritten(null)
    setRemoval(null)
    setComparison(null)
    try {
      const result = await api.readMetadata(nextPath, nextPassword)
      setDocument(result)
      setPath(nextPath)
      const initial = prefill(result)
      setValues(initial)
      setOriginal(initial)
    } catch (reason) {
      setDocument(null)
      setPath(nextPath)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const pickAndLoad = async () => {
    const [next] = await pickAnyFilesDialog()
    if (next) await load(next, password)
  }

  // A changed password on an encrypted PDF should be easy to apply without
  // re-picking the file.
  const reload = async () => {
    if (path) await load(path, password)
  }

  const groups = useMemo(() => {
    if (!document) return []
    const map = new Map<string, { key: string; value: string }[]>()
    for (const field of document.fields) {
      const rows = map.get(field.group) ?? []
      rows.push({ key: field.key, value: field.value })
      map.set(field.group, rows)
    }
    return [...map.entries()]
  }, [document])

  const editableFields = document ? editFieldsFor(document.kind) : []

  const exportJson = async () => {
    if (!document) return
    const target = await pickSavePath(reportPath(document.path), 'json')
    if (!target) return
    setBusy('export')
    setError(null)
    try {
      await api.exportText(target, JSON.stringify(document, null, 2))
      setNotice(`Metadata exported to ${target}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const compare = async () => {
    if (!document) return
    const [other] = await pickAnyFilesDialog()
    if (!other) return
    setBusy('compare')
    setError(null)
    setComparison(null)
    try {
      const result = await api.compareMetadata(document.path, password, other, password)
      setComparison(result)
      setNotice(
        result.identical
          ? 'Both files carry the same metadata (file names and timestamps are ignored).'
          : `${result.differences.length} metadata field${result.differences.length === 1 ? '' : 's'} differ.`,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!document || !path) return
    const extension = extensionOf(document.path)
    const request: MetadataEditRequest = {}
    for (const field of editableFields) {
      const value = (values[field.key] ?? '').trim()
      const had = (original[field.key] ?? '').trim()
      // An originally set field that the user emptied still has to be sent so
      // the backend can clear and verify it.
      if (value !== '' || had !== '') {
        ;(request as Record<string, string>)[field.key] = value
      }
    }
    if (Object.keys(request).length === 0) {
      setError('Fill in at least one field before writing.')
      return
    }
    const target = await pickSavePath(sibling(document.path, '-metadata'), extension)
    if (!target) return
    setBusy('edit')
    setError(null)
    setNotice(null)
    setWritten(null)
    try {
      const result = await api.editMetadata(document.path, password, target, request, overwrite)
      setWritten(result)
      setNotice(`Metadata written to ${result.outputPath}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!document || !path) return
    const target = await pickSavePath(sibling(document.path, '-clean'), extensionOf(document.path))
    if (!target) return
    setBusy('remove')
    setError(null)
    setNotice(null)
    setRemoval(null)
    try {
      const result = await api.removeMetadata(document.path, password, target, overwrite)
      setRemoval(result)
      setNotice(`Clean copy written to ${result.outputPath}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Tags className="size-5" />
          Metadata Studio
        </h1>
        <p className="text-sm text-muted-foreground">
          Read, compare, edit or strip metadata for images, PDFs, audio, video, documents and
          archives. Removal is always verified by reading the output again. Files never leave this
          PC.
        </p>
      </header>

      {!source ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Metadata reading runs in the Rust core. Start the desktop app with npm run tauri dev.
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Source file</CardTitle>
            <CardDescription>
              {document
                ? `${document.name} · ${document.formatLabel} · ${formatBytes(document.sizeBytes)}`
                : 'Choose any file. The real format is detected from its contents.'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {path ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void revealItemInDir(path).catch(() => undefined)}
              >
                <FolderOpen className="size-3.5" />
                Show in folder
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void pickAndLoad()} disabled={!source || busy !== null}>
              {busy === 'read' ? <Loader2 className="size-3.5 animate-spin" /> : <FileSearch className="size-3.5" />}
              {document ? 'Choose another file' : 'Choose a file'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Label htmlFor="metadata-password" className="mb-1.5 text-xs">
              PDF password (only for encrypted PDFs)
            </Label>
            <Input
              id="metadata-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Never stored or logged"
              disabled={!source}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!path || busy !== null}
            onClick={() => void reload()}
          >
            <Eye className="size-3.5" />
            Re-read
          </Button>
          <p className="text-xs text-muted-foreground">
            The same password is used when comparing two PDFs.
          </p>
        </CardContent>
      </Card>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="break-all">{error}</p>
        </div>
      ) : null}
      {notice ? (
        <p className="rounded-lg bg-muted/60 p-3 text-xs break-all text-muted-foreground">{notice}</p>
      ) : null}

      {document ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm">What this file carries</CardTitle>
                <CardDescription>
                  {document.fields.length} field{document.fields.length === 1 ? '' : 's'} · modified{' '}
                  {when(document.modifiedMs)}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{KIND_LABEL[document.kind]}</Badge>
                {document.editable ? <Badge variant="success">Editable</Badge> : <Badge variant="muted">Read-only</Badge>}
                {document.removable ? <Badge variant="warning">Strippable</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {document.notes.length > 0 ? (
                <ul className="flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                  {document.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No metadata fields were found.</p>
              ) : (
                groups.map(([group, rows]) => (
                  <section key={group} className="overflow-hidden rounded-lg border border-border/70">
                    <h3 className="border-b border-border/70 bg-muted/40 px-3 py-1.5 text-xs font-semibold tracking-wide uppercase">
                      {group}
                    </h3>
                    <table className="w-full text-xs">
                      <tbody>
                        {rows.map((row) => (
                          <tr key={`${group}-${row.key}`} className="border-b border-border/40 last:border-0">
                            <td className="w-2/5 px-3 py-1.5 align-top text-muted-foreground">{row.key}</td>
                            <td className="px-3 py-1.5 font-mono break-all">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Export & compare</CardTitle>
                <CardDescription>Save a JSON report or diff two files' metadata.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => void exportJson()} disabled={busy !== null}>
                  {busy === 'export' ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  Export JSON…
                </Button>
                <Button variant="outline" size="sm" onClick={() => void compare()} disabled={busy !== null}>
                  {busy === 'compare' ? <Loader2 className="size-3.5 animate-spin" /> : <GitCompareArrows className="size-3.5" />}
                  Compare with another file…
                </Button>
                {comparison ? (
                  <div className="flex flex-col gap-2 border-t border-border/70 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {comparison.leftFieldCount} vs {comparison.rightFieldCount} fields
                      </span>
                      <Badge variant={comparison.identical ? 'success' : 'warning'}>
                        {comparison.identical ? 'Identical' : `${comparison.differences.length} differences`}
                      </Badge>
                    </div>
                    {comparison.leftKind !== comparison.rightKind ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Different file kinds are being compared ({KIND_LABEL[comparison.leftKind]} vs{' '}
                        {KIND_LABEL[comparison.rightKind]}); only shared fields can match.
                      </p>
                    ) : null}
                    {comparison.differences.length > 0 ? (
                      <ul className="max-h-72 overflow-y-auto text-xs">
                        {comparison.differences.slice(0, 200).map((difference) => (
                          <li key={`${difference.group}-${difference.key}`} className="border-b border-border/40 py-1.5 last:border-0">
                            <p className="font-medium">
                              {difference.group} · {difference.key}
                            </p>
                            <p className="text-muted-foreground break-all">
                              Left: {difference.left ?? '—'}
                            </p>
                            <p className="text-muted-foreground break-all">
                              Right: {difference.right ?? '—'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {document.editable ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Edit metadata</CardTitle>
                  <CardDescription>
                    Writes a copy, reopens it and verifies every changed field before reporting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid gap-2.5">
                    {editableFields.map((field) => (
                      <div key={field.key}>
                        <Label htmlFor={`meta-${field.key}`} className="mb-1 text-xs">
                          {field.label}
                        </Label>
                        <Input
                          id={`meta-${field.key}`}
                          value={values[field.key] ?? ''}
                          onChange={(event) =>
                            setValues((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  {document.kind === 'pdf' ? (
                    <p className="text-xs text-muted-foreground">
                      PDFs store Title, Author, Subject, Keywords and Creator; other fields are
                      reported as ignored.
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="edit-overwrite" className="text-xs text-muted-foreground">
                      Replace an existing output file
                    </Label>
                    <Switch id="edit-overwrite" checked={overwrite} onCheckedChange={setOverwrite} />
                  </div>
                  <Button size="sm" onClick={() => void save()} disabled={busy !== null}>
                    {busy === 'edit' ? <Loader2 className="size-3.5 animate-spin" /> : <Tags className="size-3.5" />}
                    Write copy…
                  </Button>
                  {written ? (
                    <div className="rounded-lg bg-muted/60 p-2.5 text-xs">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant={written.verified ? 'success' : 'destructive'}>
                          {written.verified ? 'Verified' : 'Not verified'}
                        </Badge>
                        <span className="text-muted-foreground">{formatBytes(written.sizeBytes)}</span>
                      </div>
                      <p className="break-all">Written: {written.written.join(', ') || 'none'}</p>
                      {written.ignored.length > 0 ? (
                        <p className="text-muted-foreground">Ignored: {written.ignored.join(', ')}</p>
                      ) : null}
                      <p className="text-muted-foreground">{written.note}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {document.removable ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Remove metadata</CardTitle>
                  <CardDescription>
                    {document.kind === 'image'
                      ? 'Container-level strip: the pixels are copied unchanged, EXIF/XMP/IPTC blocks are dropped.'
                      : 'Writes a copy without tags, then re-reads it to prove the removal.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void remove()}
                    disabled={busy !== null}
                  >
                    {busy === 'remove' ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldOff className="size-3.5" />}
                    Write clean copy…
                  </Button>
                  {removal ? (
                    <div className="rounded-lg bg-muted/60 p-2.5 text-xs">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={removal.verified ? 'success' : 'destructive'}>
                          {removal.verified ? 'Verified clean' : 'Not verified'}
                        </Badge>
                        <span className="text-muted-foreground">
                          {formatBytes(removal.bytesBefore)} → {formatBytes(removal.bytesAfter)}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        {removal.fieldsRemoved} field{removal.fieldsRemoved === 1 ? '' : 's'} removed
                        {removal.removed.length > 0 ? `: ${removal.removed.join(', ')}` : ''}
                      </p>
                      <p className="text-muted-foreground">{removal.note}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {!document.editable && !document.removable ? (
              <Card>
                <CardContent className="flex items-start gap-2 pt-5 text-xs text-muted-foreground">
                  <ShieldOff className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    {document.kind === 'document' || document.kind === 'archive'
                      ? 'Document properties and archive headers are read-only in this build. Nothing was changed.'
                      : 'Metadata editing or removal is not offered for this format in this build.'}
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
