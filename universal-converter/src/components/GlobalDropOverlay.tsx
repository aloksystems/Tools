import { hasFilesDropTarget } from '@/hooks/useFilesDrop'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { api } from '@/utils/api'
import { isTauriRuntime } from '@/utils/tauri'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { FileDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Pages without a converter dropzone still accept a Windows drop: the files are
 * staged on Quick Convert and the app navigates there. Converter pages keep
 * their own target, so this handler stays out of the way there.
 */
export function GlobalDropOverlay() {
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const appendFiles = useWorkspaceStore((state) => state.appendFiles)
  const ensurePage = useWorkspaceStore((state) => state.ensurePage)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isTauriRuntime()) return
    let disposed = false
    let unlisten: (() => void) | undefined

    const ingest = async (paths: string[]) => {
      if (hasFilesDropTarget()) return
      try {
        const files = await api.probeFiles(paths)
        const usable = files.filter(
          (file) => !file.isDirectory && file.format !== 'unknown' && !file.unreadable,
        )
        if (usable.length === 0) {
          setMessage('Nothing in that drop can be converted by an installed engine.')
          return
        }
        ensurePage('quick', {})
        appendFiles('quick', usable)
        setMessage(
          usable.length < paths.length
            ? `${paths.length - usable.length} item(s) skipped; ${usable.length} staged on Quick Convert.`
            : null,
        )
        navigate('/quick')
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : String(reason))
      }
    }

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (disposed) return
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          if (!hasFilesDropTarget()) setDragging(true)
        } else if (event.payload.type === 'drop') {
          setDragging(false)
          void ingest(event.payload.paths)
        } else {
          setDragging(false)
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
  }, [appendFiles, ensurePage, navigate])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 6000)
    return () => window.clearTimeout(timer)
  }, [message])

  return (
    <>
      {dragging ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-primary/60 bg-background/80 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-xl">
            <FileDown className="size-6 text-primary" />
            <div>
              <p className="text-sm font-medium">Drop to open Quick Convert</p>
              <p className="text-xs text-muted-foreground">
                Images, documents, audio, video and archives are sorted automatically.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {message ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-xl"
        >
          {message}
        </div>
      ) : null}
    </>
  )
}
