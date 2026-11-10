import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pickAnyFilesDialog } from '@/hooks/useFilesDrop'
import type { FileInfo } from '@/types/tools'
import { api } from '@/utils/api'
import { formatBytes, fileName } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { FileSearch, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Field, KeyValue, ToolError, when } from './shared'

export function FileInfoTool() {
  const [path, setPath] = useState<string | null>(null)
  const [info, setInfo] = useState<FileInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inspect = async (next: string) => {
    setPath(next)
    setBusy(true)
    setError(null)
    try {
      setInfo(await api.fileInfo(next))
    } catch (reason) {
      setInfo(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const pick = async () => {
    const [next] = await pickAnyFilesDialog()
    if (next) await inspect(next)
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm">File info & signature</CardTitle>
          <CardDescription>
            Real size, timestamps and the magic bytes the file actually starts with — compared with
            its declared extension.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => void pick()} disabled={!isTauriRuntime() || busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSearch className="size-3.5" />}
          Choose a file…
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToolError error={error} />
        {!info ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {path ? 'File could not be read.' : 'Choose any file to inspect it.'}
          </p>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name">{info.name}</Field>
              <Field label="Detected format">
                {info.formatLabel}
                {info.extension ? ` (.${info.extension})` : ' (no extension)'}
              </Field>
              <Field label="Size">{formatBytes(info.sizeBytes)}</Field>
              <Field label="Created">{when(info.createdMs)}</Field>
              <Field label="Modified">{when(info.modifiedMs)}</Field>
              <Field label="Accessed">{when(info.accessedMs)}</Field>
              <Field label="Attributes">
                {info.isDirectory ? 'Folder' : 'File'}
                {info.readOnly ? ' · read-only' : ''}
              </Field>
              <Field label="Full path">
                <span className="font-mono text-xs">{info.path}</span>
              </Field>
            </dl>

            <div className="rounded-lg border border-border/70">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-3 py-2">
                <p className="text-xs font-semibold tracking-wide uppercase">Signature</p>
                {info.signature ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{info.signature.detectedLabel}</Badge>
                    <Badge variant={info.signature.extensionMatches ? 'success' : 'warning'}>
                      {info.signature.extensionMatches
                        ? 'Extension matches contents'
                        : 'Extension does not match contents'}
                    </Badge>
                  </div>
                ) : null}
              </div>
              <div className="p-3">
                {info.signature ? (
                  <>
                    <KeyValue label="Magic bytes" value={info.signature.magicHex || '—'} />
                    <KeyValue
                      label="ASCII preview"
                      value={info.signature.asciiPreview || '—'}
                    />
                    <KeyValue
                      label="Expected for extension"
                      value={info.signature.expectedForExtension ?? 'no mapping'}
                    />
                    {info.signature.note ? (
                      <p className="pt-2 text-xs text-muted-foreground">{info.signature.note}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The first bytes did not match any known file signature.
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Inspected {fileName(info.path)} without modifying it.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
