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
import { useOcrCapabilities } from '@/features/ocr/capabilities'
import { OcrSettingsPanel } from '@/features/ocr/OcrSettingsPanel'
import {
  asOcrSettings,
  DEFAULT_OCR_SETTINGS,
  ocrJobSettings,
} from '@/features/ocr/settings'
import { pickDirectoryDialog } from '@/hooks/useFilesDrop'
import { selectPage, useWorkspaceStore } from '@/stores/workspaceStore'
import { api, type JobRequest } from '@/utils/api'
import { acceptsFor } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { FolderOpen, Loader2, Play, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FormatId } from '@/types/converter'

const PAGE = 'ocr'

const OUTPUTS: { format: FormatId; label: string; blurb: string }[] = [
  {
    format: 'txt',
    label: 'Plain text',
    blurb: 'UTF-8 text; a form feed separates the pages of a PDF.',
  },
  {
    format: 'pdf',
    label: 'Searchable PDF',
    blurb: 'The page image stays, with an invisible text layer on top.',
  },
]

/**
 * OCR Studio: one file per job, every job on the shared queue. Settings are
 * Tesseract's real options, and the language list is what this machine has.
 */
export function OcrPage() {
  const workspace = useWorkspaceStore((state) => selectPage(state, PAGE))
  const ensurePage = useWorkspaceStore((state) => state.ensurePage)
  const setOutputFormat = useWorkspaceStore((state) => state.setOutputFormat)
  const patchSettings = useWorkspaceStore((state) => state.patchSettings)
  const applyPreset = useWorkspaceStore((state) => state.applyPreset)
  const navigate = useNavigate()
  const { capabilities, error, reload } = useOcrCapabilities()

  const [submitting, setSubmitting] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [override, setOverride] = useState<string | null>(null)

  useEffect(() => {
    ensurePage(PAGE, DEFAULT_OCR_SETTINGS)
  }, [ensurePage])

  // Plain text is the useful default for a first scan; the user can switch to a
  // searchable PDF without losing the OCR options.
  useEffect(() => {
    if (workspace.files.length > 0 && !workspace.outputFormat) setOutputFormat(PAGE, 'txt')
  }, [workspace.files.length, workspace.outputFormat, setOutputFormat])

  const value = asOcrSettings(workspace.settings)
  const installed = capabilities?.languages ?? []
  const missing = value.languages.filter(
    (code) => installed.length > 0 && !installed.includes(code),
  )
  const unavailableReason = !capabilities
    ? null
    : !capabilities.available
      ? capabilities.reason ?? 'Tesseract did not answer the probe.'
      : null
  const blocked = !isTauriRuntime()
    ? 'OCR runs in the Rust core. Start the desktop app with npm run tauri dev.'
    : unavailableReason ??
      (missing.length > 0
        ? `Language pack ${missing.join(', ')} is not installed.`
        : workspace.files.length === 0
          ? 'Add at least one image or PDF.'
          : null)

  const submit = async () => {
    if (!workspace.outputFormat || workspace.files.length === 0) return
    setSubmitting(true)
    setNotices([])
    try {
      const settings = ocrJobSettings(value)
      const requests: JobRequest[] = workspace.files.map((file) => ({
        inputPath: file.path,
        outputFormat: workspace.outputFormat!,
        operation: 'ocr',
        settings,
        outputDirectory: override ?? undefined,
        password: value.password || undefined,
      }))
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
        <h1 className="text-xl font-semibold tracking-tight">OCR</h1>
        <p className="text-sm text-muted-foreground">
          Read text from images and scanned PDFs with the bundled Tesseract engine. Everything runs
          on this machine; nothing is uploaded.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Dropzone page={PAGE} accepts={acceptsFor('/ocr')} fileCount={workspace.files.length} />
          <FileList page={PAGE} files={workspace.files} />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">What comes out</CardTitle>
              <CardDescription>One job per file, all on the same queue as every other tool.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {OUTPUTS.map((output) => (
                <button
                  key={output.format}
                  type="button"
                  aria-pressed={workspace.outputFormat === output.format}
                  onClick={() => setOutputFormat(PAGE, output.format)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    workspace.outputFormat === output.format
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <p className="text-sm font-medium">{output.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{output.blurb}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recognition</CardTitle>
              <CardDescription>
                Tesseract {capabilities?.version ?? '…'} ·{' '}
                {installed.length > 0 ? `${installed.length} language packs` : 'probing language data'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}
              {unavailableReason ? (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <div className="space-y-2">
                    <p>{unavailableReason}</p>
                    <Button size="sm" variant="outline" onClick={reload}>
                      <RefreshCw className="size-3.5" />
                      Re-read Tesseract
                    </Button>
                  </div>
                </div>
              ) : null}
              <OcrSettingsPanel
                settings={workspace.settings}
                outputFormat={workspace.outputFormat}
                files={workspace.files}
                languages={installed}
                onChange={(patch) => patchSettings(PAGE, patch)}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Output</CardTitle>
            <CardDescription>
              {workspace.outputFormat ? OUTPUTS.find((output) => output.format === workspace.outputFormat)?.label : 'Choose text or a searchable PDF.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <EngineNotice engine="ocr" />

            <Select
              value={workspace.outputFormat ?? ''}
              onValueChange={(next) => setOutputFormat(PAGE, next as FormatId)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an output format" />
              </SelectTrigger>
              <SelectContent>
                {OUTPUTS.map((output) => (
                  <SelectItem key={output.format} value={output.format}>
                    {output.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {workspace.outputFormat ? (
              <PresetBar
                engine="ocr"
                outputFormat={workspace.outputFormat}
                settings={workspace.settings}
                onApply={(next) => {
                  const kept = value.password ? { password: value.password } : {}
                  applyPreset(PAGE, { ...next, ...kept })
                }}
                omitKeys={['password']}
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
                !workspace.outputFormat || submitting || workspace.files.length === 0 || blocked !== null
              }
              onClick={submit}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {submitting ? 'Starting…' : `Read ${workspace.files.length || ''} file${workspace.files.length === 1 ? '' : 's'}`}
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

            <p className="text-xs text-muted-foreground">
              Progress, cancellation and results appear on the Queue page. The original file is
              never replaced.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
