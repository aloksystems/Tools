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
import { acceptsFor, fileStem, formatLabel } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { FolderOpen, Loader2, Play, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ArchiveCapabilities, FormatId } from '@/types/converter'

function archiveStem(name: string, format: FormatId | null): string {
  const trimmed = name.trim()
  const extension = format ? FORMAT_EXTENSIONS[format]?.[0] : null
  if (!extension) return trimmed
  const suffix = `.${extension}`.toLowerCase()
  return trimmed.toLowerCase().endsWith(suffix)
    ? trimmed.slice(0, trimmed.length - suffix.length)
    : trimmed
}

export function ArchiveRepackForm({
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

  const single = workspace.files.length === 1 ? (workspace.files[0] ?? null) : null
  const createFormats = useMemo(() => capabilities?.createFormats ?? [], [capabilities])

  useEffect(() => {
    if (workspace.outputFormat || createFormats.length === 0) return
    const preferred = createFormats.includes('sevenZ') ? 'sevenZ' : createFormats[0]
    if (preferred) setOutputFormat(page, preferred)
  }, [createFormats, page, setOutputFormat, workspace.outputFormat])

  const sameFormat = single !== null && workspace.outputFormat === single.format
  const blocked = !isTauriRuntime()
    ? 'Archive jobs run in the Rust core. Start the desktop app with `npm run tauri dev`.'
    : capabilitiesError
      ? capabilitiesError
      : capabilities && !capabilities.available
        ? capabilities.reason
        : workspace.files.length === 0
          ? 'Add at least one archive.'
          : !workspace.outputFormat
            ? 'Choose a target archive format.'
            : sameFormat && name.trim().length === 0
              ? 'A same-format repack needs a new name; otherwise it would replace the source.'
              : null

  const submit = async () => {
    if (!workspace.outputFormat || workspace.files.length === 0) return
    setSubmitting(true)
    setNotices([])
    setNoticeIsError(false)
    try {
      const outputFormat = workspace.outputFormat
      const options = asArchiveSettings(workspace.settings)
      const outcomes = await api.submitJobs(
        workspace.files.map((file) => {
          const fallback =
            file.format === outputFormat ? `${fileStem(file.path)}-repacked` : undefined
          const custom =
            single?.path === file.path ? archiveStem(name, outputFormat) : ''
          return {
            inputPath: file.path,
            outputFormat,
            operation: 'convert' as const,
            settings: options,
            outputDirectory: override ?? undefined,
            outputName: custom || fallback,
            password: password || undefined,
          }
        }),
      )
      const rejected = outcomes
        .filter((outcome) => !outcome.accepted)
        .map((outcome) =>
          outcome.error
            ? `${outcome.inputPath.split(/[\\/]/).pop()}: ${errorMessage(outcome.error)}`
            : `${outcome.inputPath.split(/[\\/]/).pop()}: left ${outcome.skippedPath ?? 'the existing archive'} alone (collision policy is Skip)`,
        )
      if (rejected.length > 0) {
        setNoticeIsError(true)
        setNotices(rejected)
      }
      if (outcomes.some((outcome) => outcome.accepted)) navigate('/queue')
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
          accepts={capabilities?.extractFormats ?? acceptsFor('/archives')}
          fileCount={workspace.files.length}
        />
        <FileList page={page} files={workspace.files} />
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Repacking extracts each archive into an isolated temp folder, validates every entry, then
          creates the new container. An encrypted source is read with the same password used for the
          new archive.
        </p>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">Repack</CardTitle>
          <CardDescription>
            {workspace.files.length === 0
              ? 'One job per archive; each keeps its own name.'
              : `${workspace.files.length} archive${workspace.files.length === 1 ? '' : 's'} → ${workspace.outputFormat ? formatLabel(workspace.outputFormat) : '?'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Select
            value={workspace.outputFormat ?? ''}
            onValueChange={(value) => setOutputFormat(page, value as FormatId)}
            disabled={createFormats.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={capabilities ? 'Choose a target format' : 'Checking 7-Zip…'} />
            </SelectTrigger>
            <SelectContent>
              {createFormats.map((format) => (
                <SelectItem key={format} value={format}>
                  {formatLabel(format)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {single ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  sameFormat ? `${fileStem(single.path)}-repacked` : fileStem(single.path)
                }
                className="h-8 flex-1"
                aria-label="Archive name"
              />
              <span className="shrink-0 text-xs text-muted-foreground">
                .{workspace.outputFormat ? (FORMAT_EXTENSIONS[workspace.outputFormat]?.[0] ?? workspace.outputFormat) : 'zip'}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Each archive keeps its own name; add one archive to rename the result.
            </p>
          )}

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
              <span className="text-xs text-muted-foreground">Next to each archive</span>
            )}
          </div>

          <Button className="mt-1" disabled={submitting || blocked !== null} onClick={submit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {submitting ? 'Starting…' : 'Repack'}
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
        </CardContent>
      </Card>
    </div>
  )
}
