import { EngineNotice } from '@/components/conversion-settings/EngineNotice'
import { Dropzone } from '@/components/conversion/Dropzone'
import { FileList } from '@/components/conversion/FileList'
import { PresetBar } from '@/components/conversion/PresetBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { pickDirectoryDialog } from '@/hooks/useFilesDrop'
import { useOutputChoices, type OutputChoice } from '@/hooks/useOutputChoices'
import { selectPage, useWorkspaceStore } from '@/stores/workspaceStore'
import { api, type JobRequest } from '@/utils/api'
import { formatLabel } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { FolderOpen, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ComponentType } from 'react'
import type { SettingsPanelProps, StudioProps } from '@/features/types'
import type {
  ConversionSettings,
  EngineId,
  FileProbe,
  FormatId,
} from '@/types/converter'

/** What the page-specific helpers know about the current batch. */
export interface ChoiceContext {
  files: FileProbe[]
  settings: ConversionSettings
  outputFormat: FormatId | null
}

export interface BuildContext extends ChoiceContext {
  outputDirectory?: string
}

export interface ConverterPageProps {
  page: string
  title: string
  description: string
  accepts: FormatId[]
  /** Engine the notice refers to when the format needs a sidecar. */
  engine: EngineId
  defaults: ConversionSettings
  Panel: ComponentType<SettingsPanelProps>
  /** Setting keys kept in memory for this batch only, never saved to a preset. */
  omitPresetKeys?: string[]
  /** Narrows the offered outputs after routes resolve (PDF vs raster, etc.). */
  filterChoices?: (choices: OutputChoice[], context: ChoiceContext) => OutputChoice[]
  /** Output to select automatically when the batch has one obvious answer. */
  forcedOutput?: (context: ChoiceContext) => FormatId | null
  /** A reason the batch cannot run; disables the submit button and is shown. */
  blocker?: (context: ChoiceContext) => string | null
  /** Replaces the default one-job-per-file mapping (multi-page expansion, merge). */
  buildRequests?: (context: BuildContext) => JobRequest[] | Promise<JobRequest[]>
  /** A page-specific tool rendered under the file list. */
  Studio?: ComponentType<StudioProps>
  submitLabel?: (fileCount: number) => string
}

/**
 * The one workflow every converter page shares: stage files, choose an output,
 * tune the engine's options, submit. Only the settings panel changes per page.
 */
export function ConverterPage({
  page,
  title,
  description,
  accepts,
  engine,
  defaults,
  Panel,
  omitPresetKeys,
  filterChoices,
  forcedOutput,
  blocker,
  buildRequests,
  Studio,
  submitLabel,
}: ConverterPageProps) {
  const workspace = useWorkspaceStore((state) => selectPage(state, page))
  const ensurePage = useWorkspaceStore((state) => state.ensurePage)
  const setOutputFormat = useWorkspaceStore((state) => state.setOutputFormat)
  const patchSettings = useWorkspaceStore((state) => state.patchSettings)
  const applyPreset = useWorkspaceStore((state) => state.applyPreset)
  const navigate = useNavigate()

  const [submitting, setSubmitting] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [override, setOverride] = useState<string | null>(null)

  useEffect(() => {
    ensurePage(page, defaults)
  }, [ensurePage, page, defaults])

  const inputFormats = useMemo(
    () => [...new Set(workspace.files.map((file) => file.format))],
    [workspace.files],
  )
  const { choices, loading, error, settled } = useOutputChoices(inputFormats)

  const context: ChoiceContext = {
    files: workspace.files,
    settings: workspace.settings,
    outputFormat: workspace.outputFormat,
  }
  const visibleChoices = useMemo(
    () => (filterChoices ? filterChoices(choices, context) : choices),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterChoices, choices, workspace.files, workspace.settings, workspace.outputFormat],
  )
  const forced = forcedOutput ? forcedOutput(context) : null
  const forcedAvailable =
    forced !== null && visibleChoices.some((choice) => choice.format === forced)

  // Keep the selected output honest as the operation or batch changes. Wait for
  // the batch's routes before touching it, so staging a file never clears a
  // choice that is about to become valid again.
  useEffect(() => {
    if (!settled) return
    if (forcedAvailable && forced !== workspace.outputFormat) {
      setOutputFormat(page, forced)
      return
    }
    if (
      workspace.outputFormat &&
      !visibleChoices.some((choice) => choice.format === workspace.outputFormat)
    ) {
      setOutputFormat(page, null)
    }
  }, [
    settled,
    forcedAvailable,
    forced,
    visibleChoices,
    workspace.outputFormat,
    page,
    setOutputFormat,
  ])

  const blocked = blocker ? blocker(context) : null

  const submit = async () => {
    if (!workspace.outputFormat || workspace.files.length === 0) return
    setSubmitting(true)
    setNotices([])
    try {
      const requests: JobRequest[] = buildRequests
        ? await buildRequests({ ...context, outputDirectory: override ?? undefined })
        : workspace.files.map((file) => ({
            inputPath: file.path,
            outputFormat: workspace.outputFormat!,
            settings: workspace.settings,
            outputDirectory: override ?? undefined,
          }))
      if (requests.length === 0) throw new Error('These options produced no jobs.')
      const outcomes = await api.submitJobs(requests)
      const rejected = outcomes
        .filter((outcome) => !outcome.accepted)
        .map((outcome) =>
          outcome.error
            ? `${outcome.inputPath.split(/[\\/]/).pop()}: ${outcome.error.message}`
            : `${outcome.inputPath.split(/[\\/]/).pop()}: left ${outcome.skippedPath ?? 'the existing file'} alone (collision policy is Skip)`,
        )
      setNotices(rejected)
      if (outcomes.some((outcome) => outcome.accepted)) navigate('/queue')
    } catch (reason) {
      setNotices([reason instanceof Error ? reason.message : String(reason)])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Dropzone page={page} accepts={accepts} fileCount={workspace.files.length} />
          <FileList page={page} files={workspace.files} />
          {Studio ? (
            <Studio
              files={workspace.files}
              settings={workspace.settings}
              outputFormat={workspace.outputFormat}
              onChange={(patch) => patchSettings(page, patch)}
            />
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Output</CardTitle>
            <CardDescription>
              {workspace.files.length === 0
                ? 'Add files to see the formats they can become.'
                : `${inputFormats.map(formatLabel).join(', ')} → ?`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <EngineNotice engine={engine} />

            <Select
              value={workspace.outputFormat ?? ''}
              onValueChange={(value) => setOutputFormat(page, value as FormatId)}
              disabled={visibleChoices.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loading
                      ? 'Checking what is possible…'
                      : visibleChoices.length === 0
                        ? 'No engine here can convert this batch'
                        : 'Choose an output format'
                    }
                />
              </SelectTrigger>
              <SelectContent>
                {visibleChoices.map((choice) => (
                  <SelectItem key={choice.format} value={choice.format}>
                    {formatLabel(choice.format)}
                    <span className="ml-1 text-xs text-muted-foreground">· {choice.engineLabel}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            {workspace.outputFormat ? (
              <Panel
                settings={workspace.settings}
                outputFormat={workspace.outputFormat}
                files={workspace.files}
                onChange={(patch) => patchSettings(page, patch)}
              />
            ) : null}

            {workspace.outputFormat ? (
              <PresetBar
                engine={engine}
                outputFormat={workspace.outputFormat}
                settings={workspace.settings}
                onApply={(next) => {
                  // Batch-only values (passwords) survive a preset swap; presets
                  // intentionally never store them.
                  const kept = Object.fromEntries(
                    (omitPresetKeys ?? [])
                      .filter((key) => key in workspace.settings)
                      .map((key) => [key, workspace.settings[key]]),
                  )
                  applyPreset(page, { ...next, ...kept })
                }}
                omitKeys={omitPresetKeys}
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
                  title="Click to use the default folder instead"
                >
                  {override}
                </button>
              ) : null}
            </div>

            <Button
              className="mt-1"
              disabled={
                !workspace.outputFormat ||
                submitting ||
                workspace.files.length === 0 ||
                blocked !== null
              }
              onClick={submit}
            >
              <Play className="size-4" />
              {submitting
                ? 'Starting…'
                : submitLabel
                  ? submitLabel(workspace.files.length)
                  : `Convert ${workspace.files.length || ''} file${workspace.files.length === 1 ? '' : 's'}`}
            </Button>

            {blocked ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">{blocked}</p>
            ) : null}

            {notices.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
                {notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            ) : null}

            {!isTauriRuntime() ? (
              <p className="text-xs text-muted-foreground">
                Conversions run in the Rust core. Start the desktop app with{' '}
                <code className="rounded bg-muted px-1">npm run tauri dev</code>.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
