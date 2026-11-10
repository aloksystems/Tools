import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { FileProbe, FormatId } from '@/types/converter'
import { api } from '@/utils/api'
import { extensionsFor } from '@/utils/extensions'
import { isTauriRuntime } from '@/utils/tauri'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open, save } from '@tauri-apps/plugin-dialog'
import { useCallback, useEffect, useState } from 'react'

async function probe(paths: string[], accepts: FormatId[]): Promise<FileProbe[]> {
  const files = await api.probeFiles(paths)
  if (accepts.length === 0) return files
  return files.filter((file) => accepts.includes(file.format))
}

/** Native multi-select dialog. Returns nothing when a format filter hides every pick. */
export async function pickFilesWithDialog(accepts: FormatId[]): Promise<FileProbe[]> {
  if (!isTauriRuntime()) return []
  const extensions = extensionsFor(accepts)
  const selection = await open({
    multiple: true,
    directory: false,
    filters:
      extensions.length > 0
        ? [{ name: accepts.length === 1 ? accepts[0]! : 'Supported files', extensions }]
        : undefined,
  })
  if (!selection) return []
  const paths = Array.isArray(selection) ? selection : [selection]
  return probe(paths, accepts)
}

/** Native folder picker for archive creation; folders keep their tree in the archive. */
export async function pickFoldersWithDialog(): Promise<FileProbe[]> {
  if (!isTauriRuntime()) return []
  const selection = await open({ multiple: true, directory: true })
  if (!selection) return []
  const paths = Array.isArray(selection) ? selection : [selection]
  return api.probeFiles(paths)
}

export async function pickDirectoryDialog(): Promise<string | null> {
  if (!isTauriRuntime()) return null
  const selection = await open({ directory: true })
  return typeof selection === 'string' ? selection : null
}

/** Tool pages accept any file the OS picker shows; the backend sniffs the real format. */
export async function pickAnyFilesDialog(multiple = false): Promise<string[]> {
  if (!isTauriRuntime()) return []
  const selection = await open({ multiple, directory: false })
  if (!selection) return []
  return Array.isArray(selection) ? selection : [selection]
}

export async function pickSavePath(
  defaultPath: string,
  extension?: string,
): Promise<string | null> {
  if (!isTauriRuntime()) return null
  const selection = await save({
    defaultPath,
    filters:
      extension && extension.length > 0
        ? [{ name: `${extension.toUpperCase()} file`, extensions: [extension] }]
        : undefined,
  })
  return typeof selection === 'string' ? selection : null
}

interface DropState {
  isDragging: boolean
  rejectedCount: number
  failed: string | null
}

/**
 * Pages with a converter dropzone already own the current window's drop event.
 * The global handler only takes over on pages that have no file target, so one
 * drop is never ingested twice.
 */
let mountedDropTargets = 0

export function hasFilesDropTarget(): boolean {
  return mountedDropTargets > 0
}

/**
 * Windows drag-and-drop is delivered by the webview, not HTML5 file inputs, and
 * gives absolute paths — which is what the Rust engines need.
 */
export function useFilesDrop(page: string, accepts: FormatId[]): DropState & { unavailable: boolean } {
  const [state, setState] = useState<DropState>({
    isDragging: false,
    rejectedCount: 0,
    failed: null,
  })
  const appendFiles = useWorkspaceStore((store) => store.appendFiles)

  const unavailable = !isTauriRuntime()

  useEffect(() => {
    if (unavailable) return
    mountedDropTargets += 1
    return () => {
      mountedDropTargets = Math.max(0, mountedDropTargets - 1)
    }
  }, [unavailable])

  const ingest = useCallback(
    async (paths: string[]) => {
      try {
        const accepted = await probe(paths, accepts)
        appendFiles(page, accepted)
        setState((prev) => ({
          ...prev,
          rejectedCount: paths.length - accepted.length,
          failed: null,
        }))
      } catch (error) {
        setState((prev) => ({
          ...prev,
          rejectedCount: paths.length,
          failed: error instanceof Error ? error.message : String(error),
        }))
      }
    },
    [appendFiles, page, accepts],
  )

  useEffect(() => {
    if (unavailable) return
    let disposed = false
    let unlisten: (() => void) | undefined

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (disposed) return
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          setState((prev) => (prev.isDragging ? prev : { ...prev, isDragging: true }))
        } else if (event.payload.type === 'drop') {
          setState((prev) => ({ ...prev, isDragging: false }))
          void ingest(event.payload.paths)
        } else {
          setState((prev) => ({ ...prev, isDragging: false }))
        }
      })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [ingest, unavailable])

  return { ...state, unavailable }
}
