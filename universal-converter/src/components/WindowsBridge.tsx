import { useWorkspaceStore } from '@/stores/workspaceStore'
import { api } from '@/utils/api'
import { isTauriRuntime } from '@/utils/tauri'
import { listen } from '@tauri-apps/api/event'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Connects Explorer launches to the UI: a file passed on the command line or a
 * second-instance hand-off lands on Quick Convert, and the tray's "Open queue"
 * navigates without needing a second window.
 */
export function WindowsBridge() {
  const navigate = useNavigate()
  const appendFiles = useWorkspaceStore((state) => state.appendFiles)
  const ensurePage = useWorkspaceStore((state) => state.ensurePage)

  useEffect(() => {
    if (!isTauriRuntime()) return
    let disposed = false
    const cleanups: Array<() => void> = []

    const stage = async (paths: string[]) => {
      if (paths.length === 0) return
      try {
        const files = await api.probeFiles(paths)
        const usable = files.filter(
          (file) => !file.isDirectory && file.format !== 'unknown' && !file.unreadable,
        )
        if (usable.length === 0) return
        ensurePage('quick', {})
        appendFiles('quick', usable)
        navigate('/quick')
      } catch {
        // The command line is a convenience; a bad path must not block startup.
      }
    }

    void api
      .takeOpenedFiles()
      .then((paths) => {
        if (!disposed) void stage(paths)
      })
      .catch(() => undefined)

    void listen<string[]>('converter://open-files', (event) => {
      if (!disposed) void stage(event.payload)
    })
      .then((fn) => {
        if (disposed) fn()
        else cleanups.push(fn)
      })
      .catch(() => undefined)

    void listen<string>('converter://navigate', (event) => {
      if (disposed) return
      if (event.payload.startsWith('/')) navigate(event.payload)
    })
      .then((fn) => {
        if (disposed) fn()
        else cleanups.push(fn)
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      for (const cleanup of cleanups) cleanup()
    }
  }, [appendFiles, ensurePage, navigate])

  return null
}
