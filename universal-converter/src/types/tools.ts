import type { FormatId } from '@/types/converter'

export type MetadataKind =
  | 'image'
  | 'pdf'
  | 'document'
  | 'audio'
  | 'video'
  | 'archive'
  | 'text'
  | 'other'

export interface MetadataField {
  group: string
  key: string
  value: string
}

export interface MetadataDocument {
  path: string
  name: string
  kind: MetadataKind
  format: FormatId
  formatLabel: string
  sizeBytes: number
  modifiedMs: number | null
  fields: MetadataField[]
  editable: boolean
  removable: boolean
  notes: string[]
}

export interface MetadataEditRequest {
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string
  description?: string
  copyright?: string
  artist?: string
  album?: string
  albumArtist?: string
  genre?: string
  date?: string
  comment?: string
  composer?: string
}

export interface MetadataWriteResult {
  outputPath: string
  kind: MetadataKind
  format: FormatId
  written: string[]
  ignored: string[]
  verified: boolean
  sizeBytes: number
  note: string
}

export interface MetadataRemoval {
  outputPath: string
  kind: MetadataKind
  format: FormatId
  bytesBefore: number
  bytesAfter: number
  fieldsRemoved: number
  removed: string[]
  verified: boolean
  note: string
}

export interface MetadataDifference {
  group: string
  key: string
  left: string | null
  right: string | null
}

export interface MetadataComparison {
  leftPath: string
  rightPath: string
  leftKind: MetadataKind
  rightKind: MetadataKind
  differences: MetadataDifference[]
  identical: boolean
  leftFieldCount: number
  rightFieldCount: number
}

export interface SignatureReport {
  detected: FormatId
  detectedLabel: string
  declaredExtension: string | null
  expectedForExtension: FormatId | null
  extensionMatches: boolean
  magicHex: string
  asciiPreview: string
  note: string | null
}

export interface FileInfo {
  path: string
  name: string
  extension: string | null
  sizeBytes: number
  createdMs: number | null
  modifiedMs: number | null
  accessedMs: number | null
  readOnly: boolean
  isDirectory: boolean
  format: FormatId
  formatLabel: string
  signature: SignatureReport | null
}

export interface FileHashes {
  path: string
  name: string
  sizeBytes: number
  md5: string
  sha1: string
  sha256: string
  sha512: string
  elapsedMs: number
  legacyNote: string
}

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512'

export interface ChecksumCheck {
  path: string
  fileName: string
  expected: string
  algorithm: HashAlgorithm
  algorithmLabel: string
  actual: string
  matches: boolean
  listedName: string | null
  listedNameMatches: boolean | null
  line: string | null
  note: string | null
}

export interface FileComparison {
  pathA: string
  pathB: string
  nameA: string
  nameB: string
  sizeA: number
  sizeB: number
  sameSize: boolean
  identical: boolean
  comparedBytes: number
  firstDifference: number | null
  note: string | null
}

export interface DuplicateFile {
  path: string
  name: string
  modifiedMs: number | null
}

export interface DuplicateGroup {
  sizeBytes: number
  sha256: string | null
  files: DuplicateFile[]
  wastedBytes: number
}

export interface DuplicateReport {
  roots: string[]
  scannedFiles: number
  scannedBytes: number
  groups: DuplicateGroup[]
  skipped: string[]
  elapsedMs: number
}

export interface SizeEntry {
  path: string
  name: string
  sizeBytes: number
  fileCount: number
  dirCount: number
}

export interface LargestFile {
  path: string
  name: string
  sizeBytes: number
}

export interface SizeReport {
  totalBytes: number
  totalFiles: number
  totalDirs: number
  entries: SizeEntry[]
  largest: LargestFile[]
  skipped: string[]
  elapsedMs: number
}

export interface ImageInfo {
  path: string
  name: string
  sizeBytes: number
  format: FormatId
  formatLabel: string
  mimeType: string
  extension: string | null
  width: number
  height: number
  colorType: string
  bitsPerPixel: number
  hasAlpha: boolean
  megapixels: number
}

export interface ImageComparison {
  pathA: string
  pathB: string
  nameA: string
  nameB: string
  widthA: number
  heightA: number
  widthB: number
  heightB: number
  sameDimensions: boolean
  identical: boolean
  differentPixels: number
  totalPixels: number
  differencePercent: number
  previewDataUrl: string
  note: string
}
