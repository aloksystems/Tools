import { ArchiveContentBrowser } from '@/features/archives/ArchiveContentBrowser'
import { Dropzone } from '@/components/conversion/Dropzone'
import { FileList } from '@/components/conversion/FileList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { pickDirectoryDialog } from '@/hooks/useFilesDrop'
import { selectPage, useWorkspaceStore } from '@/stores/workspaceStore'
import { api } from '@/utils/api'
import { errorMessage } from '@/utils/errors'
import { acceptsFor, fileStem, formatLabel } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { FolderOpen, Loader2, Lock, Play, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ArchiveCapabilities, ArchiveListing } from '@/types/converter'

const EMPTY_SETTINGS = {}

function passwordShaped(message: string | null): boolean {
  return message !== null && /password|encrypted|break signaled/i.test(message)
}

export function ArchiveExtractForm({
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
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [inspectSecret, setInspectSecret] = useState('')
  const [inspectToken, setInspectToken] = useState(0)
  const [listing, setListing] = useState<ArchiveListing | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [override, setOverride] = useState<string | null>(null)
  const [folderName, setFolderName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [noticeIsError, setNoticeIsError] = useState(false)

  useEffect(() => {
    ensurePage(page, EMPTY_SETTINGS)
  }, [ensurePage, page])

  const single = workspace.files.length === 1 ? (workspace.files[0] ?? null) : null
  const activePath = single?.path ?? ''

  useEffect(() => {
    setPassword('')
    setInspectSecret('')
    setListing(null)
    setSelected(new Set())
    setInspectError(null)
    setFolderName('')
  }, [activePath])

  useEffect(() => {
    if (!activePath || !isTauriRuntime()) return
    let cancelled = false
    setInspecting(true)
    setInspectError(null)
    setListing(null)
    setSelected(new Set())
    void api
      .inspectArchive(activePath, inspectSecret || undefined)
      .then((next) => {
        if (!cancelled) setListing(next)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setInspectError(errorMessage(reason))
      })
      .finally(() => {
        if (!cancelled) setInspecting(false)
      })
    return () => {
      cancelled = true
    }
  }, [activePath, inspectSecret, inspectToken])

  const extractFormats = capabilities?.extractFormats ?? acceptsFor('/archives')
  const unavailableReason = capabilities && !capabilities.available ? capabilities.reason : null
  const needsPassword =
    (listing?.encrypted === true || passwordShaped(inspectError)) && password.trim().length === 0

  const blocked = !isTauriRuntime()
    ? 'Archive jobs run in the Rust core. Start the desktop app with `npm run tauri dev`.'
    : capabilitiesError
      ? capabilitiesError
      : unavailableReason
        ? unavailableReason
        : workspace.files.length === 0
          ? 'Add at least one archive.'
          : needsPassword
            ? 'This archive is encrypted. Enter its password, then press Unlock.'
            : null

  const selectedEntries = useMemo(
    () => (single && selected.size > 0 ? [...selected] : []),
    [single, selected],
  )

  const submit = async () => {
    if (workspace.files.length === 0) return
    setSubmitting(true)
    setNotices([])
    setNoticeIsError(false)
    try {
      const outcomes = await api.submitJobs(
        workspace.files.map((file) => ({
          inputPath: file.path,
          outputFormat: file.format,
          operation: 'extractArchive' as const,
          settings: EMPTY_SETTINGS,
          outputDirectory: override ?? undefined,
          outputName: folderName.trim() || undefined,
          selectedEntries: single?.path === file.path ? selectedEntries : [],
          password: password || undefined,
        })),
      )
      const rejected = outcomes
        .filter((outcome) => !outcome.accepted)
        .map((outcome) =>
          outcome.error
            ? `${outcome.inputPath.split(/[\\/]/).pop()}: ${errorMessage(outcome.error)}`
            : `${outcome.inputPath.split(/[\\/]/).pop()}: left ${outcome.skippedPath ?? 'the existing folder'} alone (collision policy is Skip)`,
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

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <Dropzone page={page} accepts={extractFormats} fileCount={workspace.files.length} />
        <FileList page={page} files={workspace.files} />

        {single && inspecting ? (
          <section className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Reading the declared archive listing…
          </section>
        ) : null}

        {single && listing ? (
          <ArchiveContentBrowser
            entries={listing.entries}
            fileCount={listing.fileCount}
            totalBytes={listing.totalBytes}
            hasLinks={listing.hasLinks}
            encrypted={listing.encrypted}
            selected={selected}
            onSelectedChange={setSelected}
          />
        ) : null}

        {single && !listing && !inspecting && inspectError ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            <p className="flex items-start gap-1.5 font-medium">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              The archive could not be listed yet.
            </p>
            <p className="mt-1 break-words opacity-90">{inspectError}</p>
            <p className="mt-1 opacity-90">
              {passwordShaped(inspectError)
                ? 'Enter the password below and unlock the archive.'
                : 'Extraction is still validated by the engine before anything is written.'}
            </p>
          </section>
        ) : null}

        {workspace.files.length > 1 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            Batch extraction unpacks each archive in full. Add exactly one archive to browse its
            contents and pick individual entries. All archives in one batch must share the same
            password.
          </p>
        ) : null}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">Extract</CardTitle>
          <CardDescription>
            {single
              ? `${formatLabel(single.format)} · ${selectedEntries.length > 0 ? `${selectedEntries.length} selected` : 'whole archive'}`
              : workspace.files.length === 0
                ? 'Add an archive to see its declared contents.'
                : `${workspace.files.length} archives → one full extraction each`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <Input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && password) setInspectSecret(password)
              }}
              placeholder="Archive password, if any"
              className="h-8 flex-1"
              aria-label="Archive password"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!single || inspecting || !isTauriRuntime()}
              onClick={() => {
                setInspectSecret(password)
                setInspectToken((value) => value + 1)
              }}
              title="Re-read the listing with this password"
            >
              {inspecting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Unlock
            </Button>
          </div>
          {listing?.encrypted ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <Lock className="size-3.5" />
              Entry names are visible, but extraction needs the password.
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!isTauriRuntime()}
                onClick={async () => setOverride(await pickDirectoryDialog())}
              >
                <FolderOpen className="size-3.5" />
                {override ? 'Change folder' : 'Destination folder…'}
              </Button>
              {override ? (
                <button
                  type="button"
                  className="truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setOverride(null)}
                  title="Click to extract next to the archive instead"
                >
                  {override}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">Next to the archive</span>
              )}
            </div>
            <Input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder={
                single ? `${fileStem(single.path)} (folder)` : 'Archive name (folder)'
              }
              className="h-8"
              aria-label="Destination folder name"
            />
            <p className="text-xs text-muted-foreground">
              A new folder is always created. An existing folder is never merged into or replaced.
            </p>
          </div>

          <Button className="mt-1" disabled={submitting || blocked !== null} onClick={submit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {submitting
              ? 'Starting…'
              : `Extract ${workspace.files.length || ''} archive${workspace.files.length === 1 ? '' : 's'}`}
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
            Extraction is staged in an isolated temp folder and every declared path is validated
            before anything is written. Progress and errors appear in the queue.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
