import type { ConversionSettings } from '@/types/converter'

export type ArchiveCompression = 'store' | 'fast' | 'normal' | 'maximum'

export type ArchiveSettings = {
  compression: ArchiveCompression
  /** `auto`, or a codec supported by the chosen container. */
  method: string
  /** Keep the directory tree instead of flattening entries. */
  preservePaths: boolean
  /** 7Z only: better ratio, slower random extraction. */
  solid: boolean
  /** 7Z only: hide entry names until the password is supplied. */
  encryptHeaders: boolean
}

export const DEFAULT_ARCHIVE_SETTINGS: ArchiveSettings = {
  compression: 'normal',
  method: 'auto',
  preservePaths: true,
  solid: true,
  encryptHeaders: true,
}

export function asArchiveSettings(settings: ConversionSettings): ArchiveSettings {
  return { ...DEFAULT_ARCHIVE_SETTINGS, ...settings }
}

export const COMPRESSION_OPTIONS: Array<{ value: ArchiveCompression; label: string }> = [
  { value: 'store', label: 'Store (no compression)' },
  { value: 'fast', label: 'Fast' },
  { value: 'normal', label: 'Normal' },
  { value: 'maximum', label: 'Maximum' },
]

export function methodOptions(outputFormat: string | null): Array<{ value: string; label: string }> {
  if (outputFormat === 'sevenZ') {
    return [
      { value: 'auto', label: 'Automatic' },
      { value: 'lzma2', label: 'LZMA2' },
      { value: 'lzma', label: 'LZMA' },
      { value: 'ppmd', label: 'PPMd' },
      { value: 'bzip2', label: 'BZip2' },
      { value: 'copy', label: 'Copy (no compression)' },
    ]
  }
  if (outputFormat === 'zip') {
    return [
      { value: 'auto', label: 'Automatic' },
      { value: 'deflate', label: 'Deflate' },
      { value: 'deflate64', label: 'Deflate64' },
      { value: 'bzip2', label: 'BZip2' },
      { value: 'lzma', label: 'LZMA' },
      { value: 'ppmd', label: 'PPMd' },
      { value: 'copy', label: 'Copy (no compression)' },
    ]
  }
  return [{ value: 'auto', label: 'No method (TAR container)' }]
}

/** Containers that accept a password in this build. */
export function supportsPassword(outputFormat: string | null): boolean {
  return outputFormat === 'zip' || outputFormat === 'sevenZ'
}
