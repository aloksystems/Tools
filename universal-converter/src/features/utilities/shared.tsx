import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { pickAnyFilesDialog, pickDirectoryDialog } from '@/hooks/useFilesDrop'
import { formatBytes, fileName } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { Check, Copy, FolderOpen, Loader2, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'

export function ToolError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs break-all text-destructive">
      {error}
    </p>
  )
}

export function BusyButton({
  busy,
  children,
  ...props
}: ComponentProps<typeof Button> & { busy: boolean }) {
  return (
    <Button {...props} disabled={props.disabled || busy}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {children}
    </Button>
  )
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </Button>
  )
}

export function PathList({
  paths,
  onRemove,
  emptyLabel,
}: {
  paths: string[]
  onRemove: (path: string) => void
  emptyLabel: string
}) {
  if (paths.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">{emptyLabel}</p>
  }
  return (
    <ul className="flex max-h-56 flex-col divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/70">
      {paths.map((path) => (
        <li key={path} className="flex items-center gap-2 px-2.5 py-1.5">
          <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{fileName(path)}</p>
            <p className="truncate text-[11px] text-muted-foreground" title={path}>
              {path}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${fileName(path)}`} onClick={() => onRemove(path)}>
            <X className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm break-all">{children}</dd>
    </div>
  )
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5 text-xs last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-mono break-all">{value}</span>
    </div>
  )
}

export function SizeBadge({ bytes }: { bytes: number }) {
  return <Badge variant="muted">{formatBytes(bytes)}</Badge>
}

export function AddFilesButton({ onPaths, label = 'Add files…' }: { onPaths: (paths: string[]) => void; label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!isTauriRuntime()}
      onClick={async () => {
        const picked = await pickAnyFilesDialog(true)
        if (picked.length > 0) onPaths(picked)
      }}
    >
      <Plus className="size-3.5" />
      {label}
    </Button>
  )
}

export function AddFolderButton({ onPath }: { onPath: (path: string) => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!isTauriRuntime()}
      onClick={async () => {
        const picked = await pickDirectoryDialog()
        if (picked) onPath(picked)
      }}
    >
      <FolderOpen className="size-3.5" />
      Add folder…
    </Button>
  )
}

export function when(ms: number | null): string {
  return ms === null ? '—' : new Date(ms).toLocaleString()
}
