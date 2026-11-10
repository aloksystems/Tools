import { CommandPalette } from '@/components/CommandPalette'
import { FirstRunDialog } from '@/components/FirstRunDialog'
import { GlobalDropOverlay } from '@/components/GlobalDropOverlay'
import { Sidebar } from '@/components/layout/Sidebar'
import { WindowsBridge } from '@/components/WindowsBridge'
import { ArchivesPage } from '@/pages/ArchivesPage'
import { AudioPage } from '@/pages/AudioPage'
import { AutomationPage } from '@/pages/AutomationPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { HomePage } from '@/pages/HomePage'
import { ImagePage } from '@/pages/ImagePage'
import { MetadataPage } from '@/pages/MetadataPage'
import { OcrPage } from '@/pages/OcrPage'
import { PdfPage } from '@/pages/PdfPage'
import { PresetsPage } from '@/pages/PresetsPage'
import { QueuePage } from '@/pages/QueuePage'
import { QuickPage } from '@/pages/QuickPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ToolsPage } from '@/pages/ToolsPage'
import { UtilitiesPage } from '@/pages/UtilitiesPage'
import { VideoPage } from '@/pages/VideoPage'
import { WorkflowsPage } from '@/pages/WorkflowsPage'
import { useAppStore } from '@/stores/appStore'
import { useJobEvents } from '@/hooks/useJobEvents'
import { useThemeEffect } from '@/hooks/useThemeEffect'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'

function App() {
  useThemeEffect()
  useJobEvents()
  const hydrate = useAppStore((state) => state.hydrate)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  return (
    <HashRouter>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-card px-3 py-2 text-sm shadow-xl focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto focus:outline-none">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/quick" element={<QuickPage />} />
            <Route path="/image" element={<ImagePage />} />
            <Route path="/pdf" element={<PdfPage />} />
            <Route path="/ocr" element={<OcrPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/audio" element={<AudioPage />} />
            <Route path="/video" element={<VideoPage />} />
            <Route path="/archives" element={<ArchivesPage />} />
            <Route path="/metadata" element={<MetadataPage />} />
            <Route path="/utilities" element={<UtilitiesPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/automation" element={<AutomationPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/presets" element={<PresetsPage />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <FirstRunDialog />
        <GlobalDropOverlay />
        <CommandPalette />
        <WindowsBridge />
      </div>
    </HashRouter>
  )
}

export default App
