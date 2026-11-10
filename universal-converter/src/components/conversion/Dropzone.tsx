import { Button } from '@/components/ui/button'
import { pickFilesWithDialog, pickFoldersWithDialog, useFilesDrop } from '@/hooks/useFilesDrop'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { formatLabel } from '@/utils/format'
import { FolderPlus, ScanLine, TriangleAlert } from 'lucide-react'
import type { FormatId } from '@/types/converter'
import { cn } from '@/lib/utils'

/**
 * Drop target plus native picker. The picker and the drop both hand absolute
 * paths to Rust, which is the only place a file is ever identified by signature.
 */
export function Dropzone({
  page,
  accepts,
  fileCount,
  allowDirectories = false,
}: {
  page: string
  accepts: FormatId[]
  fileCount: number
  /** Archive creation can include whole folders; conversion pages cannot. */
  allowDirectories?: boolean
}) {
  const { isDragging, rejectedCount, failed, unavailable } = useFilesDrop(page, accepts)
  const appendFiles = useWorkspaceStore((store) => store.appendFiles)

  return (
    <div
      className={cn(
        'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
        isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card/50',
      )}
    >
      <ScanLine className={cn('mx-auto size-6', isDragging ? 'text-primary' : 'text-muted-foreground')} />
      <p className="mt-2 text-sm font-medium">
        {isDragging ? 'Drop to add' : allowDirectories ? 'Drag files or folders here, or' : 'Drag files here, or'}
      </p>
      <div className="mt-2 flex justify-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={unavailable}
          onClick={async () => {
            const picked = await pickFilesWithDialog(accepts)
            if (picked.length > 0) appendFiles(page, picked)
          }}
        >
          Browse…
        </Button>
        {allowDirectories ? (
          <Button
            size="sm"
            variant="outline"
            disabled={unavailable}
            onClick={async () => {
              const picked = await pickFoldersWithDialog()
              if (picked.length > 0) appendFiles(page, picked)
            }}
          >
            <FolderPlus className="size-3.5" />
            Folder…
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {accepts.length > 0 ? accepts.map(formatLabel).join(' · ') : 'Any file or folder'}
        {fileCount > 0 ? ` — ${fileCount} staged` : ''}
      </p>
      {unavailable ? (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" />
          Run with <code className="rounded bg-muted px-1">npm run tauri dev</code> — a browser tab
          has no Rust backend.
        </p>
      ) : null}
      {rejectedCount > 0 && !isDragging ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {rejectedCount} file{rejectedCount === 1 ? '' : 's'} skipped: their contents are not one of the
          formats this page converts.
        </p>
      ) : null}
      {failed ? <p className="mt-2 text-xs text-destructive">{failed}</p> : null}
    </div>
  )
}
