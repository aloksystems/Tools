import { ArchiveSettingsPanel } from '@/features/archives/ArchiveSettingsPanel'
import {
  asArchiveSettings,
  DEFAULT_ARCHIVE_SETTINGS,
  type ArchiveSettings as ArchiveOptions,
} from '@/features/archives/settings'
import { Dropzone } from '@/components/conversion/Dropzone'
import { FileList } from '@/components/conversion/FileList'
import { PresetBar } from '@/components/conversion/PresetBar'
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
import { pickDirectoryDialog } from '@/hooks/useFilesDrop'
import { selectPage, useWorkspaceStore } from '@/stores/workspaceStore'
import { api } from '@/utils/api'
import { errorMessage } from '@/utils/errors'
import { FORMAT_EXTENSIONS } from '@/utils/extensions'
import { fileStem, formatLabel } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { FolderOpen, Loader2, Play, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ArchiveCapabilities, FormatId } from '@/types/converter'

function extensionOf(format: FormatId | null): string {
  return format ? (FORMAT_EXTENSIONS[format]?.[0] ?? format) : 'zip'
}

/** Strips a typed extension so `bundle.zip` never becomes `bundle.zip.zip`. */
function archiveStem(name: string, format: FormatId | null): string {
  const trimmed = name.trim()
  const extension = format ? FORMAT_EXTENSIONS[format]?.[0] : null
  if (!extension) return trimmed
  const suffix = `.${extension}`.toLowerCase()
  return trimmed.toLowerCase().endsWith(suffix)
    ? trimmed.slice(0, trimmed.length - suffix.length)
    : trimmed
}

export function ArchiveCreateForm({
  page,
  capabilities,
  capabilitiesError,
}: {
  page: string
  capabilities: ArchiveCapabilities | null
  capabilitiesError: string | null
}) {
  const workspace = useWorkspaceStore((state) => selectPage(state, page))
  const ensurePage = useWorkspaceStore((state) => state.ensurePage)
  const setOutputFormat = useWorkspaceStore((state) => state.setOutputFormat)
  const patchSettings = useWorkspaceStore((state) => state.patchSettings)
  const applyPreset = useWorkspaceStore((state) => state.applyPreset)
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [override, setOverride] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [noticeIsError, setNoticeIsError] = useState(false)

  useEffect(() => {
    ensurePage(page, DEFAULT_ARCHIVE_SETTINGS)
  }, [ensurePage, page])

  const createFormats = useMemo(() => capabilities?.createFormats ?? [], [capabilities])
  useEffect(() => {
    if (workspace.outputFormat || createFormats.length === 0) return
    const preferred = createFormats.includes('zip') ? 'zip' : createFormats[0]
    if (preferred) setOutputFormat(page, preferred)
  }, [createFormats, page, setOutputFormat, workspace.outputFormat])

  const unavailableReason = capabilities && !capabilities.available ? capabilities.reason : null
  const blocked = !isTauriRuntime()
    ? 'Archive jobs run in the Rust core. Start the desktop app with `npm run tauri dev`.'
    : capabilitiesError
      ? capabilitiesError
      : unavailableReason
        ? unavailableReason
        : workspace.files.length === 0
          ? 'Add at least one file or folder.'
          : !workspace.outputFormat
            ? 'Choose an archive format.'
            : null

  const submit = async () => {
    if (!workspace.outputFormat || workspace.files.length === 0) return
    setSubmitting(true)
    setNotices([])
    setNoticeIsError(false)
    try {
      const [first, ...rest] = workspace.files
      if (!first) return
      const outcomes = await api.submitJobs([
        {
          inputPath: first.path,
          outputFormat: workspace.outputFormat,
          operation: 'createArchive',
          settings: asArchiveSettings(workspace.settings),
          outputDirectory: override ?? undefined,
          outputName: archiveStem(name, workspace.outputFormat) || undefined,
          extraInputs: rest.map((file) => file.path),
          password: password || undefined,
        },
      ])
      const outcome = outcomes[0]
      if (!outcome) throw new Error('The archive job produced no result.')
      if (!outcome.accepted) {
        setNoticeIsError(true)
        setNotices([
          outcome.error
            ? errorMessage(outcome.error)
            : `Left ${outcome.skippedPath ?? 'the existing archive'} alone (collision policy is Skip).`,
        ])
        return
      }
      navigate('/queue')
    } catch (reason) {
      setNoticeIsError(true)
      setNotices([errorMessage(reason)])
    } finally {
      setSubmitting(false)
    }
  }

  const options: ArchiveOptions = asArchiveSettings(workspace.settings)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <Dropzone
          page={page}
          accepts={[]}
          fileCount={workspace.files.length}
          allowDirectories
        />
        <FileList page={page} files={workspace.files} relaxed />
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">Create archive</CardTitle>
          <CardDescription>
            {workspace.files.length === 0
              ? 'Add files or folders. Their contents are compressed into one archive.'
              : `${workspace.files.length} source${workspace.files.length === 1 ? '' : 's'} → one archive`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Select
            value={workspace.outputFormat ?? ''}
            onValueChange={(value) => setOutputFormat(page, value as FormatId)}
            disabled={createFormats.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  capabilities ? 'Choose an archive format' : 'Checking 7-Zip…'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {createFormats.map((format) => (
                <SelectItem key={format} value={format}>
                  {formatLabel(format)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                workspace.files.length === 1 && workspace.files[0]
                  ? fileStem(workspace.files[0].path)
                  : 'archive'
              }
              className="h-8 flex-1"
              aria-label="Archive name"
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              .{extensionOf(workspace.outputFormat)}
            </span>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            The extension is added automatically. Each source keeps its own folder when preservation
            is on.
          </p>

          <ArchiveSettingsPanel
            settings={workspace.settings}
            outputFormat={workspace.outputFormat}
            files={workspace.files}
            password={password}
            onPasswordChange={setPassword}
            onChange={(patch) => patchSettings(page, patch)}
          />

          {workspace.outputFormat ? (
            <PresetBar
              engine="archive"
              outputFormat={workspace.outputFormat}
              settings={options}
              onApply={(next) => applyPreset(page, next)}
            />
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!isTauriRuntime()}
              onClick={async () => setOverride(await pickDirectoryDialog())}
            >
              <FolderOpen className="size-3.5" />
              {override ? 'Change folder' : 'Output folder…'}
            </Button>
            {override ? (
              <button
                type="button"
                className="truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setOverride(null)}
                title="Click to use the source folder instead"
              >
                {override}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">Next to the first source</span>
            )}
          </div>

          <Button className="mt-1" disabled={submitting || blocked !== null} onClick={submit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {submitting
              ? 'Starting…'
              : `Create ${workspace.outputFormat ? formatLabel(workspace.outputFormat) : 'archive'}`}
          </Button>

          {blocked ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {blocked}
            </p>
          ) : null}

          {notices.length > 0 ? (
            <ul
              className={`flex flex-col gap-1 rounded-lg p-2.5 text-xs ${
                noticeIsError
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted/60 text-muted-foreground'
              }`}
            >
              {notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          ) : null}

          <p className="text-xs text-muted-foreground">
            The archive is created under the app's temp folder, test-read by 7-Zip, then moved into
            place. A failed job leaves no partial archive.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
