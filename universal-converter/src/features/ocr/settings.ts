import type { ConversionSettings } from '@/types/converter'

export type OcrSettings = {
  /** Tesseract language codes; several are joined with `+` by the engine. */
  languages: string[]
  /** 1-based pages for PDF input, e.g. `1-3,7`. Empty means every page. */
  pageRanges: string
  /** Tesseract page-segmentation mode. */
  psm: number
  /** Raster resolution used to render PDF pages before OCR. */
  dpi: number
  /** Batch-only: never captured by a preset. */
  password: string
}

export const DEFAULT_OCR_SETTINGS: OcrSettings = {
  languages: ['eng'],
  pageRanges: '',
  psm: 3,
  dpi: 300,
  password: '',
}

export function asOcrSettings(settings: ConversionSettings): OcrSettings {
  const raw = settings as Partial<OcrSettings>
  const languages = Array.isArray(raw.languages)
    ? raw.languages.filter((code): code is string => typeof code === 'string' && code.length > 0)
    : DEFAULT_OCR_SETTINGS.languages
  return {
    languages: languages.length > 0 ? languages : DEFAULT_OCR_SETTINGS.languages,
    pageRanges: typeof raw.pageRanges === 'string' ? raw.pageRanges : '',
    psm: typeof raw.psm === 'number' ? raw.psm : DEFAULT_OCR_SETTINGS.psm,
    dpi: typeof raw.dpi === 'number' ? raw.dpi : DEFAULT_OCR_SETTINGS.dpi,
    password: typeof raw.password === 'string' ? raw.password : '',
  }
}

/** Only the engine's own options; the password travels beside the job. */
export function ocrJobSettings(value: OcrSettings): ConversionSettings {
  return {
    languages: value.languages,
    pageRanges: value.pageRanges,
    psm: value.psm,
    dpi: value.dpi,
  }
}

export const OCR_PSM_OPTIONS = [
  { value: '3', label: 'Automatic page segmentation' },
  { value: '4', label: 'Single column of text' },
  { value: '6', label: 'Single uniform block' },
  { value: '7', label: 'Single line' },
  { value: '8', label: 'Single word' },
  { value: '11', label: 'Sparse text' },
  { value: '13', label: 'Raw line (no layout analysis)' },
] as const
