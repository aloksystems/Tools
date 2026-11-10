import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pickSavePath } from '@/hooks/useFilesDrop'
import type { FileHashes } from '@/types/tools'
import { api } from '@/utils/api'
import { formatBytes } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { Download, Hash, Loader2 } from 'lucide-react'
import { useState } from 'react'
import {
  AddFilesButton,
  BusyButton,
  CopyButton,
  PathList,
  ToolError,
} from './shared'

const DIGESTS = [
  { key: 'sha256', label: 'SHA-256', legacy: false },
  { key: 'sha512', label: 'SHA-512', legacy: false },
  { key: 'sha1', label: 'SHA-1', legacy: true },
  { key: 'md5', label: 'MD5', legacy: true },
] as const

export function HashesTool() {
  const [paths, setPaths] = useState<string[]>([])
  const [hashes, setHashes] = useState<FileHashes[]>([])
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const add = (picked: string[]) => {
    setPaths((current) => [...new Set([...current, ...picked])])
    setHashes([])
    setNotice(null)
  }

  const remove = (path: string) => {
    setPaths((current) => current.filter((entry) => entry !== path))
    setHashes([])
  }

  const run = async () => {
    if (paths.length === 0) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setHashes(await api.hashFiles(paths))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const exportManifest = async () => {
    if (hashes.length === 0) return
    const target = await pickSavePath('checksums.sha256', 'sha256')
    if (!target) return
    setExporting(true)
    setError(null)
    try {
      const manifest = hashes.map((entry) => `${entry.sha256} *${entry.name}`).join('\n') + '\n'
      await api.exportText(target, manifest)
      setNotice(`SHA-256 manifest written to ${target}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Hashes</CardTitle>
        <CardDescription>
          One streaming read computes MD5, SHA-1, SHA-256 and SHA-512 together. Nothing is loaded
          into memory whole, so a 4 GB video is fine.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <AddFilesButton onPaths={add} />
          <BusyButton size="sm" busy={busy} onClick={() => void run()} disabled={!isTauriRuntime() || paths.length === 0}>
            {busy ? null : <Hash className="size-3.5" />}
            Hash {paths.length || ''} file{paths.length === 1 ? '' : 's'}
          </BusyButton>
          {paths.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => { setPaths([]); setHashes([]) }}>
              Clear
            </Button>
          ) : null}
        </div>

        <PathList paths={paths} onRemove={remove} emptyLabel="Add the files you want to fingerprint." />
        <ToolError error={error} />
        {notice ? <p className="rounded-lg bg-muted/60 p-2.5 text-xs break-all text-muted-foreground">{notice}</p> : null}

        {hashes.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {hashes.length} file{hashes.length === 1 ? '' : 's'} hashed
              </p>
              <Badge variant="outline">
                {formatBytes(hashes.reduce((total, entry) => total + entry.sizeBytes, 0))} read
              </Badge>
              <Button variant="outline" size="sm" onClick={() => void exportManifest()} disabled={exporting}>
                {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Export SHA-256 manifest…
              </Button>
            </div>
            <div className="flex flex-col gap-3">
              {hashes.map((entry) => (
                <div key={entry.path} className="overflow-hidden rounded-lg border border-border/70">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-3 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{entry.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground" title={entry.path}>
                        {entry.path}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="muted">{formatBytes(entry.sizeBytes)}</Badge>
                      <Badge variant="outline">{(entry.elapsedMs / 1000).toFixed(2)} s</Badge>
                    </div>
                  </div>
                  <div className="p-2.5">
                    {DIGESTS.map((digest) => (
                      <div key={digest.key} className="flex items-center gap-2 border-b border-border/40 py-1 last:border-0">
                        <span className="flex w-20 shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                          {digest.label}
                          {digest.legacy ? <Badge variant="warning">legacy</Badge> : null}
                        </span>
                        <code className="min-w-0 flex-1 overflow-x-auto text-[11px] whitespace-nowrap">
                          {entry[digest.key]}
                        </code>
                        <CopyButton text={entry[digest.key]} label={`Copy ${digest.label}`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{hashes[0]?.legacyNote}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
