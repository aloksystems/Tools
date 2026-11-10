import type { FormatId } from '@/types/converter'

export interface NavItem {
  path: string
  label: string
  /** Formats this page seeds the dropzone with; empty means "anything". */
  accepts: FormatId[]
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Home', accepts: [] },
  { path: '/quick', label: 'Quick Convert', accepts: [] },
  {
    path: '/image',
    label: 'Image',
    accepts: [
      'jpeg',
      'png',
      'webp',
      'avif',
      'bmp',
      'tiff',
      'gif',
      'ico',
      'svg',
      'heic',
    ],
  },
  { path: '/pdf', label: 'PDF', accepts: ['pdf', 'jpeg', 'png', 'webp', 'tiff', 'bmp', 'gif'] },
  {
    path: '/ocr',
    label: 'OCR',
    accepts: ['jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'ico', 'pdf'],
  },
  {
    path: '/documents',
    label: 'Documents',
    accepts: ['docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'xlsx', 'xls', 'ods', 'csv', 'pptx', 'ppt', 'odp'],
  },
  { path: '/audio', label: 'Audio', accepts: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'wma', 'aiff', 'alac', 'ogg', 'opus'] },
  {
    path: '/video',
    label: 'Video',
    accepts: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'flv', 'mpeg', 'threeGp'],
  },
  {
    path: '/archives',
    label: 'Archives',
    accepts: ['zip', 'sevenZ', 'tar', 'tarGz', 'tarBz2', 'tarXz', 'gz', 'bz2', 'xz', 'wim', 'cab'],
  },
  { path: '/queue', label: 'Queue', accepts: [] },
  { path: '/history', label: 'History', accepts: [] },
  { path: '/settings', label: 'Settings', accepts: [] },
]

export const FORMAT_LABELS: Record<FormatId, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  avif: 'AVIF',
  bmp: 'BMP',
  tiff: 'TIFF',
  gif: 'GIF',
  ico: 'ICO',
  svg: 'SVG',
  heic: 'HEIC',
  pdf: 'PDF',
  docx: 'DOCX',
  doc: 'DOC',
  odt: 'ODT',
  rtf: 'RTF',
  txt: 'Plain text',
  html: 'HTML',
  xlsx: 'XLSX',
  xls: 'XLS',
  ods: 'ODS',
  csv: 'CSV',
  pptx: 'PPTX',
  ppt: 'PPT',
  odp: 'ODP',
  mp3: 'MP3',
  wav: 'WAV',
  flac: 'FLAC',
  aac: 'AAC',
  m4a: 'M4A',
  wma: 'WMA',
  aiff: 'AIFF',
  alac: 'ALAC',
  ogg: 'OGG',
  opus: 'Opus',
  mp4: 'MP4',
  mkv: 'MKV',
  mov: 'MOV',
  avi: 'AVI',
  webm: 'WebM',
  wmv: 'WMV',
  flv: 'FLV',
  mpeg: 'MPEG',
  threeGp: '3GP',
  zip: 'ZIP',
  sevenZ: '7Z',
  tar: 'TAR',
  gz: 'GZip',
  bz2: 'BZip2',
  xz: 'XZ',
  tarGz: 'TAR.GZ',
  tarBz2: 'TAR.BZ2',
  tarXz: 'TAR.XZ',
  wim: 'WIM',
  cab: 'CAB',
  unknown: 'Unknown',
}

export function formatLabel(format: FormatId): string {
  return FORMAT_LABELS[format] ?? format
}

/** The formats one converter page seeds its dropzone with, keyed by route path. */
export function acceptsFor(path: string): FormatId[] {
  return NAV_ITEMS.find((item) => item.path === path)?.accepts ?? []
}

const IMAGE_FORMATS: FormatId[] = [
  'jpeg',
  'png',
  'webp',
  'avif',
  'bmp',
  'tiff',
  'gif',
  'ico',
  'svg',
  'heic',
]

export function isImageFormat(format: FormatId): boolean {
  return IMAGE_FORMATS.includes(format)
}

const AUDIO_FORMATS: FormatId[] = [
  'mp3',
  'wav',
  'flac',
  'aac',
  'm4a',
  'wma',
  'aiff',
  'alac',
  'ogg',
  'opus',
]

const VIDEO_FORMATS: FormatId[] = [
  'mp4',
  'mkv',
  'mov',
  'avi',
  'webm',
  'wmv',
  'flv',
  'mpeg',
  'threeGp',
]

export function isAudioFormat(format: FormatId): boolean {
  return AUDIO_FORMATS.includes(format)
}

export function isVideoFormat(format: FormatId): boolean {
  return VIDEO_FORMATS.includes(format)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

/** "42% smaller" when the output really shrank; null when there is nothing to claim. */
export function formatSavings(inputBytes: number, outputBytes?: number | null): string | null {
  if (!outputBytes || inputBytes === 0 || outputBytes >= inputBytes) return null
  return `${Math.round((1 - outputBytes / inputBytes) * 100)}% smaller`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`
}

export function fileName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

export function fileStem(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}
