import type { ConversionSettings, FileProbe, FormatId } from '@/types/converter'

/** Common props every feature settings panel receives from the workspace. */
export interface SettingsPanelProps {
  settings: ConversionSettings
  outputFormat: FormatId | null
  /** The staged batch — PDF operations depend on whether it holds PDFs or images. */
  files: FileProbe[]
  onChange: (patch: ConversionSettings) => void
}

/** Page-specific tools rendered beneath the file list (the PDF page grid). */
export type StudioProps = SettingsPanelProps
