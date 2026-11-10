import type { ConversionSettings } from '@/types/converter'

export type DocumentSettings = {
  /** LibreOffice PDF export page range, e.g. "1-3,7". Empty means every page. */
  pageRange: string
  /** JPEG quality for lossy PDF images, 1–100. */
  imageQuality: number
  /** Keep images lossless (larger PDF, no JPEG artefacts). */
  lossless: boolean
  /** Export comments, notes and speaker notes where the component supports it. */
  exportNotes: boolean
  /** 1-based sheet for CSV output. Other formats keep every sheet. */
  sheet: number
  /** Per-batch output stems keyed by input path; never saved to a preset. */
  outputNames: Record<string, string>
}

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  pageRange: '',
  imageQuality: 90,
  lossless: false,
  exportNotes: false,
  sheet: 1,
  outputNames: {},
}

export function asDocumentSettings(settings: ConversionSettings): DocumentSettings {
  return { ...DEFAULT_DOCUMENT_SETTINGS, ...settings }
}
