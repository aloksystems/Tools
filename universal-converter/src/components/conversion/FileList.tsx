import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { formatBytes, formatLabel } from '@/utils/format'
import { ChevronDown, ChevronUp, Trash, TriangleAlert, X } from 'lucide-react'
import type { FileProbe } from '@/types/converter'

function describe(file: FileProbe): string {
  if (file.isDirectory) return 'Folder · archived with its contents'
  const parts = [formatLabel(file.format), formatBytes(file.sizeBytes)]
  if (file.width && file.height) parts.push(`${file.width}×${file.height}`)
  if (file.pageCount) parts.push(`${file.pageCount} pages`)
  if (file.durationMs) parts.push(`${Math.round(file.durationMs / 1000)}s`)
  return parts.join(' · ')
}

/**
 * `relaxed` is for archive creation: an unknown signature is still a perfectly
 * valid file to compress, so the UI must not warn about it there.
 */
export function FileList({
  page,
  files,
  relaxed = false,
}: {
  page: string
  files: FileProbe[]
  relaxed?: boolean
}) {
  const removeFile = useWorkspaceStore((store) => store.removeFile)
  const moveFile = useWorkspaceStore((store) => store.moveFile)
  const clearFiles = useWorkspaceStore((store) => store.clearFiles)

  if (files.length === 0) return null

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm font-medium">
          {files.length} file{files.length === 1 ? '' : 's'} staged
        </p>
        <Button size="sm" variant="ghost" onClick={() => clearFiles(page)}>
          <Trash className="size-3.5" />
          Clear
        </Button>
      </header>
      <ul className="divide-y divide-border">
        {files.map((file, index) => (
          <li key={file.path} className="flex items-start gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" title={file.path}>
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">{describe(file)}</p>
              {!relaxed && file.extensionMismatch ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <TriangleAlert className="size-3.5 shrink-0" />
                  {file.extensionMismatch} — the real format is used.
                </p>
              ) : null}
              {!relaxed && file.unreadable ? (
                <p className="mt-1 text-xs text-destructive">{file.unreadable}</p>
              ) : null}
            </div>
            <Badge variant="secondary" className="mt-0.5 shrink-0">
              {file.isDirectory ? 'Folder' : relaxed && file.format === 'unknown' ? 'File' : formatLabel(file.format)}
            </Badge>
            {files.length > 1 ? (
              <div className="flex shrink-0 flex-col">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  disabled={index === 0}
                  aria-label={`Move ${file.name} up`}
                  title="Move up — merge and PDF page order follow this list"
                  onClick={() => moveFile(page, file.path, -1)}
                >
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  disabled={index === files.length - 1}
                  aria-label={`Move ${file.name} down`}
                  title="Move down"
                  onClick={() => moveFile(page, file.path, 1)}
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </div>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              aria-label={`Remove ${file.name}`}
              onClick={() => removeFile(page, file.path)}
            >
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
