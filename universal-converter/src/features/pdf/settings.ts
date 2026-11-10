import type { ConversionSettings } from '@/types/converter'

export type PdfOperation =
  | 'convert'
  | 'merge'
  | 'split'
  | 'rotate'
  | 'reorder'
  | 'compress'
  | 'metadata'
  | 'password'
  | 'watermark'
  | 'pageText'
  | 'annotate'

export type PageMode = 'all' | 'ranges'
export type SplitMode = 'ranges' | 'individual' | 'every'
export type PdfCompression = 'low' | 'medium' | 'high'
export type PdfPageSize = 'a4' | 'letter' | 'legal' | 'fit'
export type PdfOrientation = 'auto' | 'portrait' | 'landscape'
export type PdfPlacement = 'center' | 'top' | 'bottom'
export type PdfPasswordAction = 'set' | 'remove'

export interface PdfLayout {
  pageSize: PdfPageSize
  orientation: PdfOrientation
  marginMm: number
  placement: PdfPlacement
}

export interface PdfMetadata {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
}

export interface PdfWatermark {
  text: string
  fontSize: number
  opacity: number
  color: string
  angle: number
}

export interface PdfPageText {
  headerLeft: string
  headerCenter: string
  headerRight: string
  footerLeft: string
  footerCenter: string
  footerRight: string
  fontSize: number
  marginMm: number
  startNumber: number
}

export interface PdfAnnotation {
  text: string
  author: string
  marginMm: number
}

export type PdfSettings = {
  operation: PdfOperation
  pageMode: PageMode
  /** 1-based, comma separated, e.g. `1-3,7`. Ignored when pageMode is "all". */
  pageRanges: string
  rotation: number
  /** Raster resolution when rendering PDF pages to images. */
  dpi: number
  rasterQuality: number
  compression: PdfCompression
  /** Only used when placing images onto PDF pages. */
  layout: PdfLayout
  metadata: PdfMetadata
  /** Set once the panel or Studio has read a document's real values. */
  metadataLoaded: boolean
  /** Remove every info entry and the XMP stream instead of editing fields. */
  removeAllMetadata: boolean
  /** Password for opening an encrypted input; never saved to a preset. */
  password: string
  newPassword: string
  ownerPassword: string
  passwordAction: PdfPasswordAction
  splitMode: SplitMode
  splitEvery: number
  /** Page order typed by hand or applied from the Studio (reorder). */
  pageOrder: string
  /** Merge/combined-image output name, without an extension. */
  outputName: string
  /** Place every staged image on the pages of one PDF instead of one each. */
  combineImages: boolean
  watermark: PdfWatermark
  pageText: PdfPageText
  annotation: PdfAnnotation
}

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  operation: 'convert',
  pageMode: 'all',
  pageRanges: '',
  rotation: 90,
  dpi: 200,
  rasterQuality: 92,
  compression: 'medium',
  layout: {
    pageSize: 'a4',
    orientation: 'auto',
    marginMm: 10,
    placement: 'center',
  },
  metadata: {
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
  },
  metadataLoaded: false,
  removeAllMetadata: false,
  password: '',
  newPassword: '',
  ownerPassword: '',
  passwordAction: 'set',
  splitMode: 'ranges',
  splitEvery: 10,
  pageOrder: '',
  outputName: '',
  combineImages: true,
  watermark: {
    text: '',
    fontSize: 64,
    opacity: 0.18,
    color: '#c0392b',
    angle: 45,
  },
  pageText: {
    headerLeft: '',
    headerCenter: '',
    headerRight: '',
    footerLeft: '',
    footerCenter: 'Page {page} of {total}',
    footerRight: '',
    fontSize: 10,
    marginMm: 12,
    startNumber: 1,
  },
  annotation: {
    text: '',
    author: '',
    marginMm: 12,
  },
}

export function asPdfSettings(settings: ConversionSettings): PdfSettings {
  const raw = settings as Partial<PdfSettings>
  return {
    ...DEFAULT_PDF_SETTINGS,
    ...raw,
    layout: { ...DEFAULT_PDF_SETTINGS.layout, ...(raw.layout ?? {}) },
    metadata: { ...DEFAULT_PDF_SETTINGS.metadata, ...(raw.metadata ?? {}) },
    watermark: { ...DEFAULT_PDF_SETTINGS.watermark, ...(raw.watermark ?? {}) },
    pageText: { ...DEFAULT_PDF_SETTINGS.pageText, ...(raw.pageText ?? {}) },
    annotation: { ...DEFAULT_PDF_SETTINGS.annotation, ...(raw.annotation ?? {}) },
    // The UI no longer offers "none"; a stored preset that still has it gets
    // the balanced level instead of an operation the engine refuses.
    compression:
      raw.compression === 'low' || raw.compression === 'high' ? raw.compression : 'medium',
  }
}
