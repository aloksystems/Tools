import { useAppStore } from '@/stores/appStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { api } from '@/utils/api'
import { fileName } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { pickAnyFilesDialog } from '@/hooks/useFilesDrop'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import {
  AudioLines,
  Clock,
  Command,
  FileArchive,
  FileImage,
  FileText,
  FileType,
  Film,
  FolderSearch,
  House,
  Keyboard,
  ListOrdered,
  ScanText,
  Search,
  Settings,
  Wrench,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ComponentType } from 'react'

interface PaletteItem {
  id: string
  label: string
  group: string
  hint?: string
  icon: ComponentType<{ className?: string }>
  run: () => void
}

const PAGE_ITEMS: Array<{ to: string; label: string; icon: ComponentType<{ className?: string }> }> = [
  { to: '/', label: 'Home', icon: House },
  { to: '/quick', label: 'Quick Convert', icon: Zap },
  { to: '/image', label: 'Images', icon: FileImage },
  { to: '/pdf', label: 'PDF Studio', icon: FileText },
  { to: '/ocr', label: 'OCR', icon: ScanText },
  { to: '/documents', label: 'Documents', icon: FileType },
  { to: '/audio', label: 'Audio', icon: AudioLines },
  { to: '/video', label: 'Video', icon: Film },
  { to: '/archives', label: 'Archives', icon: FileArchive },
  { to: '/tools', label: 'Advanced Tools', icon: Wrench },
  { to: '/utilities', label: 'File Utilities', icon: Wrench },
  { to: '/metadata', label: 'Metadata Studio', icon: FileText },
  { to: '/automation', label: 'Folder Automation', icon: FolderSearch },
  { to: '/workflows', label: 'Workflows', icon: ListOrdered },
  { to: '/presets', label: 'Presets', icon: FileText },
  { to: '/queue', label: 'Queue', icon: ListOrdered },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'Ctrl K', action: 'Search pages, actions and recent files' },
  { keys: 'Ctrl O', action: 'Add files to Quick Convert' },
  { keys: 'Ctrl ,', action: 'Open Settings' },
  { keys: 'Ctrl Shift Q', action: 'Open the queue' },
  { keys: 'Ctrl Shift H', action: 'Open history' },
  { keys: 'F1 or ?', action: 'Show this shortcut list' },
  { keys: 'Esc', action: 'Close a dialog or search' },
]

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

export function CommandPalette() {
  const navigate = useNavigate()
  const rescanEngines = useAppStore((state) => state.rescanEngines)
  const appendFiles = useWorkspaceStore((state) => state.appendFiles)
  const ensurePage = useWorkspaceStore((state) => state.ensurePage)
  const [mode, setMode] = useState<'palette' | 'shortcuts' | null>(null)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    setMode(null)
    setQuery('')
    restoreFocus.current?.focus()
  }, [])

  const openPalette = useCallback(() => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setMode('palette')
    setQuery('')
    setActive(0)
    if (isTauriRuntime()) {
      void api
        .recentFiles(8)
        .then(setRecent)
        .catch(() => setRecent([]))
    }
  }, [])

  const stageQuick = useCallback(
    async (paths: string[]) => {
      const files = await api.probeFiles(paths)
      const usable = files.filter(
        (file) => !file.isDirectory && file.format !== 'unknown' && !file.unreadable,
      )
      if (usable.length === 0) return
      ensurePage('quick', {})
      appendFiles('quick', usable)
      navigate('/quick')
    },
    [appendFiles, ensurePage, navigate],
  )

  const openFiles = useCallback(async () => {
    if (!isTauriRuntime()) return
    const paths = await pickAnyFilesDialog(true)
    if (paths.length > 0) await stageQuick(paths)
  }, [stageQuick])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (mode === 'palette') close()
        else openPalette()
        return
      }
      if (mode) {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
        }
        return
      }
      if (mod && event.key === ',') {
        event.preventDefault()
        navigate('/settings')
        return
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'q') {
        event.preventDefault()
        navigate('/queue')
        return
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        navigate('/history')
        return
      }
      if (mod && event.key.toLowerCase() === 'o' && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        void openFiles()
        return
      }
      if ((event.key === 'F1' || (event.key === '?' && event.shiftKey)) && !isEditable(event.target)) {
        event.preventDefault()
        setMode('shortcuts')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, mode, navigate, openFiles, openPalette])

  useEffect(() => {
    if (mode === 'palette') inputRef.current?.focus()
  }, [mode])

  const items = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      {
        id: 'action-open',
        label: 'Add files to Quick Convert…',
        group: 'Actions',
        hint: 'Ctrl O',
        icon: Zap,
        run: () => void openFiles(),
      },
      {
        id: 'action-rescan',
        label: 'Re-scan installed engines',
        group: 'Actions',
        icon: Wrench,
        run: () => void rescanEngines(),
      },
      {
        id: 'action-shortcuts',
        label: 'Keyboard shortcuts',
        group: 'Actions',
        hint: 'F1',
        icon: Keyboard,
        run: () => setMode('shortcuts'),
      },
    ]
    const pages = PAGE_ITEMS.map((page) => ({
      id: `page-${page.to}`,
      label: page.label,
      group: 'Pages',
      icon: page.icon,
      run: () => navigate(page.to),
    }))
    const recents = recent.map((path) => ({
      id: `recent-${path}`,
      label: fileName(path),
      group: 'Recent files',
      hint: 'reveal in Explorer',
      icon: FolderSearch,
      run: () => void revealItemInDir(path).catch(() => undefined),
    }))
    return [...actions, ...pages, ...recents]
  }, [navigate, openFiles, recent, rescanEngines])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle),
    )
  }, [items, query])

  if (!mode) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      {mode === 'palette' ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="palette-title"
          className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <h2 id="palette-title" className="sr-only">
            Command palette
          </h2>
          <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActive((value) => Math.min(value + 1, filtered.length - 1))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActive((value) => Math.max(value - 1, 0))
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  const item = filtered[active]
                  if (item) {
                    close()
                    item.run()
                  }
                }
              }}
              placeholder="Search pages, actions and recent files…"
              aria-label="Search commands"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              aria-activedescendant={filtered[active] ? `palette-item-${filtered[active].id}` : undefined}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Esc
            </kbd>
          </div>
          <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing matches “{query}”.
              </li>
            ) : (
              filtered.map((item, index) => {
                const Icon = item.icon
                return (
                  <li
                    key={item.id}
                    id={`palette-item-${item.id}`}
                    role="option"
                    aria-selected={index === active}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => {
                        close()
                        item.run()
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${
                        index === active ? 'bg-accent text-accent-foreground' : 'text-foreground'
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.hint ?? item.group}
                      </span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
          <p className="flex items-center gap-1.5 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
            <Command className="size-3" />
            Ctrl K toggles this palette · arrows move · Enter runs
          </p>
        </div>
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <h2 id="shortcuts-title" className="flex items-center gap-2 text-sm font-semibold">
              <Keyboard className="size-4" />
              Keyboard shortcuts
            </h2>
            <button
              type="button"
              onClick={close}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
          <dl className="mt-3 divide-y divide-border">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between gap-3 py-2">
                <dt className="text-sm">{shortcut.action}</dt>
                <dd>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px]">
                    {shortcut.keys}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
