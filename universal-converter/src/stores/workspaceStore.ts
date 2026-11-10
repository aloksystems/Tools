import type { ConversionSettings, FileProbe, FormatId } from '@/types/converter'
import { create } from 'zustand'

/**
 * One staging area per converter page. Settings are engine-specific, so the
 * image panel's options must never leak into an audio job — each page owns its
 * own files, chosen output and options.
 */
export interface PageWorkspace {
  files: FileProbe[]
  outputFormat: FormatId | null
  settings: ConversionSettings
}

interface WorkspaceState {
  pages: Record<string, PageWorkspace>
  ensurePage: (page: string, defaults: ConversionSettings) => void
  appendFiles: (page: string, files: FileProbe[]) => void
  removeFile: (page: string, path: string) => void
  /** Reorders the staged list; merge and image-to-PDF page order follow it. */
  moveFile: (page: string, path: string, direction: -1 | 1) => void
  clearFiles: (page: string) => void
  setOutputFormat: (page: string, format: FormatId | null) => void
  patchSettings: (page: string, patch: ConversionSettings) => void
  applyPreset: (page: string, settings: ConversionSettings) => void
}

const EMPTY: PageWorkspace = { files: [], outputFormat: null, settings: {} }

function dedupeByPath(existing: FileProbe[], incoming: FileProbe[]): FileProbe[] {
  const byPath = new Map(existing.map((file) => [file.path, file]))
  for (const file of incoming) byPath.set(file.path, file)
  return [...byPath.values()]
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  pages: {},
  ensurePage: (page, defaults) =>
    set((state) => {
      if (state.pages[page]) return state
      return { pages: { ...state.pages, [page]: { ...EMPTY, settings: defaults } } }
    }),
  appendFiles: (page, files) =>
    set((state) => {
      const current = state.pages[page] ?? EMPTY
      return {
        pages: {
          ...state.pages,
          [page]: { ...current, files: dedupeByPath(current.files, files) },
        },
      }
    }),
  removeFile: (page, path) =>
    set((state) => {
      const current = state.pages[page] ?? EMPTY
      const files = current.files.filter((file) => file.path !== path)
      const stillSelectable = current.outputFormat && files.length > 0
      return {
        pages: {
          ...state.pages,
          [page]: {
            ...current,
            files,
            outputFormat: stillSelectable ? current.outputFormat : null,
          },
        },
      }
    }),
  moveFile: (page, path, direction) =>
    set((state) => {
      const current = state.pages[page] ?? EMPTY
      const index = current.files.findIndex((file) => file.path === path)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.files.length) return state
      const files = [...current.files]
      const [moved] = files.splice(index, 1)
      if (!moved) return state
      files.splice(target, 0, moved)
      return { pages: { ...state.pages, [page]: { ...current, files } } }
    }),
  clearFiles: (page) =>
    set((state) => {
      const current = state.pages[page] ?? EMPTY
      return { pages: { ...state.pages, [page]: { ...current, files: [], outputFormat: null } } }
    }),
  setOutputFormat: (page, format) =>
    set((state) => {
      const current = state.pages[page] ?? EMPTY
      return { pages: { ...state.pages, [page]: { ...current, outputFormat: format } } }
    }),
  patchSettings: (page, patch) =>
    set((state) => {
      const current = state.pages[page] ?? EMPTY
      return {
        pages: {
          ...state.pages,
          [page]: { ...current, settings: { ...current.settings, ...patch } },
        },
      }
    }),
  applyPreset: (page, settings) =>
    set((state) => {
      const current = state.pages[page] ?? EMPTY
      return { pages: { ...state.pages, [page]: { ...current, settings } } }
    }),
}))

export function selectPage(state: WorkspaceState, page: string): PageWorkspace {
  return state.pages[page] ?? EMPTY
}
