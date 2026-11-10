import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pickSavePath } from '@/hooks/useFilesDrop'
import type { SizeReport } from '@/types/tools'
import { api } from '@/utils/api'
import { formatBytes, formatDuration, fileName } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { Download, FolderSearch, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { AddFilesButton, AddFolderButton, BusyButton, PathList, ToolError } from './shared'

export function SizeTool() {
  const [roots, setRoots] = useState<string[]>([])
  const [report, setReport] = useState<SizeReport | null>(null)
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
      setReport(await api.calculateSize(roots))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const exportReport = async () => {
    if (!report) return
    const target = await pickSavePath('size-report.json', 'json')
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Size calculator</CardTitle>
        <CardDescription>
          Recursively totals files and folders, and lists the largest files. Symlinked and
          unreadable entries are reported, not silently skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <AddFolderButton onPath={(path) => add([path])} />
          <AddFilesButton onPaths={add} label="Add files…" />
          <BusyButton size="sm" busy={busy} onClick={() => void run()} disabled={!isTauriRuntime() || roots.length === 0}>
            {busy ? null : <FolderSearch className="size-3.5" />}
            Calculate
          </BusyButton>
          {roots.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => { setRoots([]); setReport(null) }}>
              Clear
            </Button>
          ) : null}
        </div>

        <PathList paths={roots} onRemove={remove} emptyLabel="Add folders or files to measure." />
        <ToolError error={error} />
        {notice ? <p className="rounded-lg bg-muted/60 p-2.5 text-xs break-all text-muted-foreground">{notice}</p> : null}

        {report ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{formatBytes(report.totalBytes)}</Badge>
              <Badge variant="outline">{report.totalFiles} files</Badge>
              <Badge variant="outline">{report.totalDirs} folders</Badge>
              <Badge variant="muted">{formatDuration(report.elapsedMs)}</Badge>
              <Button variant="outline" size="sm" onClick={() => void exportReport()} disabled={exporting}>
                {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Export report…
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {report.entries.map((entry) => (
                <div key={entry.path} className="rounded-lg border border-border/70 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold" title={entry.path}>
                        {entry.name || fileName(entry.path)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground" title={entry.path}>
                        {entry.path}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatBytes(entry.sizeBytes)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {entry.fileCount} file{entry.fileCount === 1 ? '' : 's'} · {entry.dirCount} folder
                    {entry.dirCount === 1 ? '' : 's'}
                  </p>
                </div>
              ))}
            </div>

            {report.largest.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border/70">
                <p className="border-b border-border/70 bg-muted/40 px-3 py-1.5 text-xs font-semibold">
                  Largest files
                </p>
                <ul className="divide-y divide-border/40">
                  {report.largest.map((file, index) => (
                    <li key={file.path} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                      <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" title={file.path}>
                          {fileName(file.path)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground" title={file.path}>
                          {file.path}
                        </p>
                      </div>
                      <span className="tabular-nums">{formatBytes(file.sizeBytes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

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
