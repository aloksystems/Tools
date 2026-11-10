import { resetMediaCapabilities } from '@/features/media/capabilities'
import { resetPdfCapabilities } from '@/features/pdf/capabilities'
import { api, type SystemResources } from '@/utils/api'
import type { AppSettings, EngineInfo, FormatId, FormatRoute } from '@/types/converter'
import { create } from 'zustand'

export const DEFAULT_SETTINGS: AppSettings = {
  concurrentJobs: 2,
  outputDirectoryMode: 'subfolder',
  customOutputDirectory: null,
  collisionPolicy: 'rename',
  theme: 'dark',
  maxInputMb: 4096,
  documentTimeoutSeconds: 300,
  archiveTimeoutSeconds: 600,
  ocrTimeoutSeconds: 300,
  maxExtractionMb: 20 * 1024,
  maxExtractionFiles: 100_000,
  deleteTempOnExit: true,
  welcomeCompleted: true,
  nativeNotifications: false,
  enginePaths: {},
}

interface AppState {
  settings: AppSettings
  engines: EngineInfo[]
  resources: SystemResources | null
  /** Available-output cache keyed by input format id. */
  routes: Partial<Record<FormatId, FormatRoute[]>>
  loadError: string | null
  hydrated: boolean
  hydrate: () => Promise<void>
  saveSettings: (next: AppSettings) => Promise<void>
  resetSettings: () => Promise<void>
  rescanEngines: () => Promise<void>
  loadRoutes: (input: FormatId) => Promise<FormatRoute[]>
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  engines: [],
  resources: null,
  routes: {},
  loadError: null,
  hydrated: false,
  hydrate: async () => {
    // Settings and resources are local and quick. Engines need process probes,
    // so fetch them separately: waiting for them here would hold the whole UI
    // on its defaults for as long as LibreOffice takes to answer.
    try {
      const [settings, resources] = await Promise.all([api.getSettings(), api.systemResources()])
      set({ settings, resources, loadError: null, hydrated: true })
    } catch (error) {
      set({ loadError: message(error), hydrated: true })
      return
    }
    try {
      const engines = await api.listEngines()
      set({ engines, loadError: null })
    } catch (error) {
      set({ loadError: message(error) })
    }
  },
  saveSettings: async (next) => {
    // Optimistic write so the settings page feels instant, then roll back on failure.
    const previous = get().settings
    set({ settings: next })
    try {
      await api.saveSettings(next)
    } catch (error) {
      set({ settings: previous, loadError: message(error) })
      throw error
    }
  },
  resetSettings: async () => {
    const settings = await api.resetSettings()
    set({ settings, routes: {} })
    await get().rescanEngines()
  },
  rescanEngines: async () => {
    try {
      const engines = await api.rescanEngines()
      // Routes and per-operation PDF availability both depend on the binaries;
      // so do the codecs and hardware encoders FFmpeg reports.
      resetPdfCapabilities()
      resetMediaCapabilities()
      set({ engines, routes: {} })
    } catch (error) {
      set({ loadError: message(error) })
    }
  },
  loadRoutes: async (input) => {
    const cached = get().routes[input]
    if (cached) return cached
    const list = await api.listCapabilities(input)
    set((state) => ({ routes: { ...state.routes, [input]: list } }))
    return list
  },
}))

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
