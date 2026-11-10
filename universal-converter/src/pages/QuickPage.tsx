import { Dropzone } from '@/components/conversion/Dropzone'
import { FileList } from '@/components/conversion/FileList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEFAULT_ARCHIVE_SETTINGS } from '@/features/archives/settings'
import { DEFAULT_AUDIO_SETTINGS } from '@/features/audio/settings'
import { DEFAULT_DOCUMENT_SETTINGS } from '@/features/documents/settings'
import { DEFAULT_IMAGE_SETTINGS } from '@/features/images/settings'
import { DEFAULT_VIDEO_SETTINGS } from '@/features/video/settings'
import { useOutputChoices } from '@/hooks/useOutputChoices'
import { selectPage, useWorkspaceStore } from '@/stores/workspaceStore'
import type { JobRequest } from '@/utils/api'
import { api } from '@/utils/api'
import { formatLabel, isAudioFormat, isImageFormat, isVideoFormat } from '@/utils/format'
import { Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  ConversionSettings,
  FileProbe,
  FormatId,
} from '@/types/converter'

const DOCUMENT_FORMATS: FormatId[] = [
  'docx',
  'doc',
  'odt',
  'rtf',
  'txt',
  'html',
  'xlsx',
  'xls',
  'ods',
  'csv',
  'pptx',
  'ppt',
  'odp',
]

const ARCHIVE_FORMATS: FormatId[] = [
  'zip',
  'sevenZ',
  'tar',
  'tarGz',
  'tarBz2',
  'tarXz',
  'gz',
  'bz2',
  'xz',
  'wim',
  'cab',
]

type Category = 'image' | 'document' | 'audio' | 'video' | 'archive'

interface Group {
  id: Category
  label: string
  files: FileProbe[]
  settings: ConversionSettings
  preferred: FormatId
  page: string
}

function categoryOf(format: FormatId): Category | 'pdf' | 'other' {
  if (format === 'pdf') return 'pdf'
  if (isImageFormat(format)) return 'image'
  if (isAudioFormat(format)) return 'audio'
  if (isVideoFormat(format)) return 'video'
  if (DOCUMENT_FORMATS.includes(format)) return 'document'
  if (ARCHIVE_FORMATS.includes(format)) return 'archive'
  return 'other'
}

const GROUP_META: Record<Category, { label: string; settings: ConversionSettings; preferred: FormatId; page: string }> = {
  image: {
    label: 'Images',
    settings: DEFAULT_IMAGE_SETTINGS,
    preferred: 'webp',
    page: '/image',
  },
  document: {
    label: 'Documents',
    settings: DEFAULT_DOCUMENT_SETTINGS,
    preferred: 'pdf',
    page: '/documents',
  },
  audio: {
    label: 'Audio',
    settings: DEFAULT_AUDIO_SETTINGS,
    preferred: 'mp3',
    page: '/audio',
  },
  video: {
    label: 'Video',
    settings: DEFAULT_VIDEO_SETTINGS,
    preferred: 'mp4',
    page: '/video',
  },
  archive: {
    label: 'Archives',
    settings: DEFAULT_ARCHIVE_SETTINGS,
    preferred: 'zip',
    page: '/archives',
  },
}

/**
 * Quick Convert keeps the default settings of each engine and lets a mixed drop
 * run in one click. Anything that needs real options (PDF page operations, OCR,
 * encryption, trim) stays on its dedicated page, linked from here.
 */
export function QuickPage() {
  const workspace = useWorkspaceStore((state) => selectPage(state, 'quick'))
  const ensurePage = useWorkspaceStore((state) => state.ensurePage)
  const appendFiles = useWorkspaceStore((state) => state.appendFiles)
  const navigate = useNavigate()

  useEffect(() => {
    ensurePage('quick', {})
  }, [ensurePage])

  const groups = useMemo<Group[]>(() => {
    const buckets = new Map<Category, FileProbe[]>()
    for (const file of workspace.files) {
      if (file.isDirectory || file.format === 'unknown') continue
      const category = categoryOf(file.format)
      if (category === 'pdf' || category === 'other') continue
      const bucket = buckets.get(category) ?? []
      bucket.push(file)
      buckets.set(category, bucket)
    }
    return (Object.keys(GROUP_META) as Category[])
      .filter((id) => (buckets.get(id)?.length ?? 0) > 0)
      .map((id) => ({
        id,
        label: GROUP_META[id].label,
        files: buckets.get(id) ?? [],
        settings: GROUP_META[id].settings,
        preferred: GROUP_META[id].preferred,
        page: GROUP_META[id].page,
      }))
  }, [workspace.files])

  const pdfFiles = workspace.files.filter((file) => file.format === 'pdf' && !file.isDirectory)
  const otherFiles = workspace.files.filter(
    (file) => !file.isDirectory && categoryOf(file.format) === 'other',
  )

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Zap className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Quick convert</h1>
          <p className="text-sm text-muted-foreground">
            Drop anything and each group converts with its engine&apos;s defaults. For page
            ranges, encryption, trimming or OCR, open the dedicated page instead.
          </p>
        </div>
      </header>

      <Dropzone page="quick" accepts={[]} fileCount={workspace.files.length} />
      <FileList page="quick" files={workspace.files} />

      {groups.map((group) => (
        <QuickGroup key={group.id} group={group} />
      ))}

      {pdfFiles.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">PDF · {pdfFiles.length} file(s)</CardTitle>
            <CardDescription>
              PDF work is page-level: merge, split, rotate, compress, passwords and rendering.
              Choose the operation in the PDF Studio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                appendFiles('pdf', pdfFiles)
                navigate('/pdf')
              }}
            >
              Open in PDF Studio
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {otherFiles.length > 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {otherFiles.length} file(s) have no conversion route on this machine — their contents
          are not a format any installed engine can read.
        </p>
      ) : null}
    </div>
  )
}

function QuickGroup({ group }: { group: Group }) {
  const inputFormats = useMemo(
    () => [...new Set(group.files.map((file) => file.format))],
    [group.files],
  )
  const { choices, loading, error } = useOutputChoices(inputFormats)
  const [output, setOutput] = useState<FormatId | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const navigate = useNavigate()

  const selected = useMemo(() => {
    if (output && choices.some((choice) => choice.format === output)) return output
    if (choices.some((choice) => choice.format === group.preferred)) return group.preferred
    return choices[0]?.format ?? null
  }, [choices, group.preferred, output])

  const submit = async () => {
    if (!selected) return
    setBusy(true)
    setNotice(null)
    try {
      const requests: JobRequest[] = group.files.map((file) => ({
        inputPath: file.path,
        outputFormat: selected,
        settings: group.settings,
      }))
      const outcomes = await api.submitJobs(requests)
      const rejected = outcomes.filter((outcome) => !outcome.accepted)
      if (rejected.length > 0) {
        setNotice(
          rejected
            .map(
              (outcome) =>
                `${outcome.inputPath.split(/[\\/]/).pop()}: ${outcome.error?.message ?? 'left the existing file alone'}`,
            )
            .join(' · '),
        )
      }
      if (outcomes.some((outcome) => outcome.accepted)) navigate('/queue')
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {group.label} · {group.files.length} file{group.files.length === 1 ? '' : 's'}
        </CardTitle>
        <CardDescription>
          {inputFormats.map(formatLabel).join(', ')} → {selected ? formatLabel(selected) : '?'} with
          default settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selected ?? ''}
            onValueChange={(value) => setOutput(value as FormatId)}
            disabled={choices.length === 0}
          >
            <SelectTrigger className="w-56">
              <SelectValue
                placeholder={
                  loading ? 'Checking…' : choices.length === 0 ? 'No shared output' : 'Output format'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {choices.map((choice) => (
                <SelectItem key={choice.format} value={choice.format}>
                  {formatLabel(choice.format)}
                  <span className="ml-1 text-xs text-muted-foreground">· {choice.engineLabel}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!selected || busy} onClick={submit}>
            {busy ? 'Starting…' : `Convert ${group.files.length} file(s)`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(group.page)}>
            Options
          </Button>
        </div>
        {choices.length === 0 && !loading ? (
          <p className="text-xs text-muted-foreground">
            These files share no available output. Open the dedicated page to choose a different
            operation.
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
      </CardContent>
    </Card>
  )
}
