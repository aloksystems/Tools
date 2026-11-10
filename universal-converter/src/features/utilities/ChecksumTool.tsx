import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pickAnyFilesDialog } from '@/hooks/useFilesDrop'
import type { ChecksumCheck } from '@/types/tools'
import { api } from '@/utils/api'
import { fileName } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { CheckCircle2, ClipboardCheck, FileUp, XCircle } from 'lucide-react'
import { useState } from 'react'
import { BusyButton, CopyButton, KeyValue, ToolError } from './shared'

export function ChecksumTool() {
  const [path, setPath] = useState<string | null>(null)
  const [expected, setExpected] = useState('')
  const [check, setCheck] = useState<ChecksumCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async () => {
    const [next] = await pickAnyFilesDialog()
    if (!next) return
    setPath(next)
    setCheck(null)
    setError(null)
  }

  const verify = async () => {
    if (!path || expected.trim() === '') return
    setBusy(true)
    setError(null)
    setCheck(null)
    try {
      setCheck(await api.verifyChecksum(path, expected))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Verify a checksum</CardTitle>
        <CardDescription>
          Paste a bare hash or a whole checksum file — GNU (<code>hash *file</code>) and BSD
          (<code>SHA256 (file) = hash</code>) lines are both understood. The algorithm is detected
          from the hash length or the line prefix.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void pick()} disabled={!isTauriRuntime()}>
            <FileUp className="size-3.5" />
            Choose the file…
          </Button>
          {path ? (
            <span className="text-xs text-muted-foreground" title={path}>
              {fileName(path)}
            </span>
          ) : null}
          {check ? (
            <Badge variant={check.matches ? 'success' : 'destructive'}>
              {check.matches ? 'Matches' : 'Does not match'}
            </Badge>
          ) : null}
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Expected checksum
          <textarea
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            spellCheck={false}
            rows={4}
            placeholder="a1b2c3… or a complete .sha256 / .md5 file"
            className="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none placeholder:font-sans focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>

        <BusyButton
          size="sm"
          busy={busy}
          onClick={() => void verify()}
          disabled={!isTauriRuntime() || !path || expected.trim() === ''}
        >
          {busy ? null : <ClipboardCheck className="size-3.5" />}
          Verify
        </BusyButton>

        <ToolError error={error} />

        {check ? (
          <div className="rounded-lg border border-border/70">
            <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-3 py-2">
              {check.matches ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : (
                <XCircle className="size-4 text-destructive" />
              )}
              <span className="text-xs font-semibold">
                {check.matches
                  ? `${check.algorithmLabel} checksum matches`
                  : `${check.algorithmLabel} checksum does not match`}
              </span>
            </div>
            <div className="p-3">
              <KeyValue label="File" value={check.fileName} />
              <KeyValue label="Algorithm" value={check.algorithmLabel} />
              <KeyValue
                label="Expected"
                value={
                  <span className="inline-flex items-center gap-1">
                    {check.expected}
                    <CopyButton text={check.expected} label="Copy expected checksum" />
                  </span>
                }
              />
              <KeyValue
                label="Actual"
                value={
                  <span className="inline-flex items-center gap-1">
                    {check.actual}
                    <CopyButton text={check.actual} label="Copy actual checksum" />
                  </span>
                }
              />
              {check.listedName ? (
                <KeyValue
                  label="Name in checksum file"
                  value={
                    <span className={check.listedNameMatches === false ? 'text-amber-600 dark:text-amber-400' : ''}>
                      {check.listedName}
                      {check.listedNameMatches === false ? ' (does not match the chosen file)' : ''}
                    </span>
                  }
                />
              ) : null}
              {check.line ? (
                <KeyValue label="Matched line" value={<span className="break-all">{check.line}</span>} />
              ) : null}
              {check.note ? <p className="pt-2 text-xs text-muted-foreground">{check.note}</p> : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
