import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pickAnyFilesDialog } from '@/hooks/useFilesDrop'
import type { FileComparison } from '@/types/tools'
import { api } from '@/utils/api'
import { fileName, formatBytes } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { FileUp, GitCompareArrows } from 'lucide-react'
import { useState } from 'react'
import { BusyButton, KeyValue, ToolError } from './shared'

export function FileCompareTool() {
  const [pathA, setPathA] = useState<string | null>(null)
  const [pathB, setPathB] = useState<string | null>(null)
  const [comparison, setComparison] = useState<FileComparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (slot: 'a' | 'b') => {
    const [next] = await pickAnyFilesDialog()
    if (!next) return
    if (slot === 'a') setPathA(next)
    else setPathB(next)
    setComparison(null)
    setError(null)
  }

  const run = async () => {
    if (!pathA || !pathB) return
    setBusy(true)
    setError(null)
    setComparison(null)
    try {
      setComparison(await api.compareFiles(pathA, pathB))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Compare two files</CardTitle>
        <CardDescription>
          Streams both files side by side and reports the first differing byte. Byte-identical
          copies of different names are recognised as equal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {(['a', 'b'] as const).map((slot) => {
            const path = slot === 'a' ? pathA : pathB
            return (
              <div key={slot} className="rounded-lg border border-border/70 p-2.5">
                <p className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
                  File {slot.toUpperCase()}
                </p>
                <Button variant="outline" size="sm" className="w-full" onClick={() => void pick(slot)} disabled={!isTauriRuntime()}>
                  <FileUp className="size-3.5" />
                  {path ? 'Change…' : 'Choose a file…'}
                </Button>
                {path ? (
                  <p className="mt-1.5 truncate text-xs" title={path}>
                    {fileName(path)}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>

        <BusyButton
          size="sm"
          busy={busy}
          onClick={() => void run()}
          disabled={!isTauriRuntime() || !pathA || !pathB}
        >
          {busy ? null : <GitCompareArrows className="size-3.5" />}
          Compare
        </BusyButton>

        <ToolError error={error} />

        {comparison ? (
          <div className="rounded-lg border border-border/70">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-3 py-2">
              <span className="text-xs font-semibold">
                {comparison.identical ? 'The files are byte-identical' : 'The files differ'}
              </span>
              <Badge variant={comparison.identical ? 'success' : 'warning'}>
                {comparison.identical ? 'Identical' : 'Different'}
              </Badge>
            </div>
            <div className="p-3">
              <KeyValue label="File A" value={`${comparison.nameA} · ${formatBytes(comparison.sizeA)}`} />
              <KeyValue label="File B" value={`${comparison.nameB} · ${formatBytes(comparison.sizeB)}`} />
              <KeyValue
                label="Same size"
                value={comparison.sameSize ? `Yes · ${formatBytes(comparison.sizeA)}` : 'No'}
              />
              <KeyValue label="Compared bytes" value={formatBytes(comparison.comparedBytes)} />
              {comparison.firstDifference !== null ? (
                <KeyValue
                  label="First difference"
                  value={`byte ${comparison.firstDifference.toLocaleString()} (0-based)`}
                />
              ) : null}
              {comparison.note ? (
                <p className="pt-2 text-xs text-muted-foreground">{comparison.note}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
