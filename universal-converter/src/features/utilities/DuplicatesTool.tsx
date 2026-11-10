import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pickSavePath } from '@/hooks/useFilesDrop'
import type { DuplicateReport } from '@/types/tools'
import { api } from '@/utils/api'
import { formatBytes, formatDuration, fileName } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { CopyCheck, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { AddFilesButton, AddFolderButton, BusyButton, PathList, ToolError, when } from './shared'

export function DuplicatesTool() {
  const [roots, setRoots] = useState<string[]>([])
  const [report, setReport] = useState<DuplicateReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const add = (picked: string[]) => {
    setRoots((current) => [...new Set([...current, ...picked])])
    setReport(null)
    setNotice(null)
  }

  const remove = (path: string) => {
    setRoots((current) => current.filter((entry) => entry !== path))
    setReport(null)
  }

  const run = async () => {
    if (roots.length === 0) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setReport(await api.findDuplicates(roots))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const exportReport = async () => {
    if (!report) return
    const target = await pickSavePath('duplicates.json', 'json')
    if (!target) return
    setExporting(true)
    setError(null)
    try {
      await api.exportText(target, JSON.stringify(report, null, 2))
      setNotice(`Report written to ${target}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setExporting(false)
    }
  }

  const wasted = report?.groups.reduce((total, group) => total + group.wastedBytes, 0) ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Duplicate files</CardTitle>
        <CardDescription>
          Groups by size first, then confirms with SHA-256, so only real duplicates are reported.
          Nothing is deleted — this tool is strictly read-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <AddFilesButton onPaths={add} label="Add files…" />
          <AddFolderButton onPath={(path) => add([path])} />
          <BusyButton size="sm" busy={busy} onClick={() => void run()} disabled={!isTauriRuntime() || roots.length === 0}>
            {busy ? null : <CopyCheck className="size-3.5" />}
            Scan for duplicates
          </BusyButton>
          {roots.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => { setRoots([]); setReport(null) }}>
              Clear
            </Button>
          ) : null}
        </div>

        <PathList paths={roots} onRemove={remove} emptyLabel="Add files or folders to scan." />
        <ToolError error={error} />
        {notice ? <p className="rounded-lg bg-muted/60 p-2.5 text-xs break-all text-muted-foreground">{notice}</p> : null}

        {report ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{report.scannedFiles} files scanned</Badge>
              <Badge variant="outline">{formatBytes(report.scannedBytes)}</Badge>
              <Badge variant={report.groups.length > 0 ? 'warning' : 'success'}>
                {report.groups.length} duplicate group{report.groups.length === 1 ? '' : 's'}
              </Badge>
              <Badge variant="muted">{formatBytes(wasted)} recoverable</Badge>
              <Badge variant="muted">{formatDuration(report.elapsedMs)}</Badge>
              <Button variant="outline" size="sm" onClick={() => void exportReport()} disabled={exporting}>
                {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Export report…
              </Button>
            </div>

            {report.groups.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No duplicate contents found in {report.scannedFiles} file
                {report.scannedFiles === 1 ? '' : 's'}.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {report.groups.map((group) => (
                  <li key={`${group.sizeBytes}-${group.sha256 ?? 'empty'}`} className="overflow-hidden rounded-lg border border-border/70">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-3 py-2">
                      <div>
                        <p className="text-xs font-semibold">
                          {group.files.length} identical copies · {formatBytes(group.sizeBytes)} each
                        </p>
                        <p className="font-mono text-[11px] break-all text-muted-foreground">
                          {group.sha256 ?? 'empty files (no content hash)'}
                        </p>
                      </div>
                      <Badge variant="warning">{formatBytes(group.wastedBytes)} wasted</Badge>
                    </div>
                    <ul className="divide-y divide-border/40">
                      {group.files.map((file) => (
                        <li key={file.path} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium" title={file.path}>
                              {fileName(file.path)}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground" title={file.path}>
                              {file.path}
                            </p>
                          </div>
                          <span className="text-[11px] text-muted-foreground">modified {when(file.modifiedMs)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}

            {report.skipped.length > 0 ? (
              <details className="rounded-lg border border-border/70 p-2.5 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  {report.skipped.length} item{report.skipped.length === 1 ? '' : 's'} could not be read
                </summary>
                <ul className="mt-1.5 flex max-h-40 flex-col gap-0.5 overflow-y-auto font-mono text-[11px] break-all text-muted-foreground">
                  {report.skipped.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
