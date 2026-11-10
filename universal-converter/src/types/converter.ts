/**
 * Mirrors the Rust types in `src-tauri/src/core`. Keep both in sync — the Rust
 * structs are the source of truth and serialise with `rename_all = "camelCase"`.
 */

export type FormatId =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'bmp'
  | 'tiff'
  | 'gif'
  | 'ico'
  | 'svg'
  | 'heic'
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'odt'
  | 'rtf'
  | 'txt'
  | 'html'
  | 'xlsx'
  | 'xls'
  | 'ods'
  | 'csv'
  | 'pptx'
  | 'ppt'
  | 'odp'
  | 'mp3'
  | 'wav'
  | 'flac'
  | 'aac'
  | 'm4a'
  | 'wma'
  | 'aiff'
  | 'alac'
  | 'ogg'
  | 'opus'
  | 'mp4'
  | 'mkv'
  | 'mov'
  | 'avi'
  | 'webm'
  | 'wmv'
  | 'flv'
  | 'mpeg'
  | 'threeGp'
  | 'zip'
  | 'sevenZ'
  | 'tar'
  | 'gz'
  | 'bz2'
  | 'xz'
  | 'tarGz'
  | 'tarBz2'
  | 'tarXz'
  | 'wim'
  | 'cab'
  | 'unknown'

export type EngineId =
  | 'image'
  | 'imagemagick'
  | 'pdf'
  | 'media'
  | 'document'
  | 'archive'
  | 'ocr'

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

/** What a job does; every operation shares the same queue rather than a second one. */
export type JobOperation = 'convert' | 'createArchive' | 'extractArchive' | 'ocr'

export type OutputDirectoryMode = 'source' | 'subfolder' | 'custom'

export type CollisionPolicy = 'rename' | 'overwrite' | 'skip'

/** Opaque, engine-specific options. Each feature panel owns its own shape. */
export type ConversionSettings = Record<string, unknown>

export interface EngineInfo {
  id: EngineId
  label: string
  available: boolean
  version?: string | null
  /** Why the engine is unusable, phrased for the UI. Null when available. */
  unavailableReason?: string | null
}

/** One registry row, resolved against the engines installed on this machine. */
export interface FormatRoute {
  input: FormatId
  output: FormatId
  engine: EngineId
  engineLabel: string
  note?: string | null
  available: boolean
  unavailableReason?: string | null
}

export interface FileProbe {
  path: string
  name: string
  sizeBytes: number
  format: FormatId
  /** Folders can be archive sources; every other engine expects files. */
  isDirectory: boolean
  width?: number | null
  height?: number | null
  pageCount?: number | null
  durationMs?: number | null
  /** Set when the on-disk signature disagrees with the file extension. */
  extensionMismatch?: string | null
  unreadable?: string | null
}

export interface ConversionJob {
  id: string
  inputPath: string
  inputName: string
  /** Every file the job reads; multi-input jobs keep the ordered list. */
  inputs: string[]
  inputFormat: FormatId
  outputFormat: FormatId
  operation: JobOperation
  engine: EngineId
  outputPath: string
  /** Archive entries the user ticked; empty means the whole archive. */
  selectedEntries: string[]
  settings: ConversionSettings
  progress: number
  status: JobStatus
  error?: string | null
  errorKind?: string | null
  createdAtMs: number
  startedAtMs?: number | null
  finishedAtMs?: number | null
  inputBytes: number
  outputBytes?: number | null
}

/** Per-operation PDF availability on this machine, not just "the engine exists". */
export interface PdfCapability {
  operation:
    | 'imagesToPdf'
    | 'pdfToImages'
    | 'merge'
    | 'split'
    | 'rotate'
    | 'reorder'
    | 'compress'
    | 'metadata'
    | 'password'
    | 'watermark'
    | 'pageNumbers'
    | 'annotations'
    | 'extractImages'
    | 'comparePages'
    | 'inspect'
  label: string
  available: boolean
  missingDependency?: string | null
}

/** One page as the structural inspector sees it. */
export interface PdfPageReport {
  number: number
  widthPt: number
  heightPt: number
  rotation: number
  fonts: string[]
  imageCount: number
  annotationCount: number
}

export interface PdfDeepInfo {
  path: string
  fileSize: number
  version: string
  encrypted: boolean
  pageCount: number
  pages: PdfPageReport[]
  fonts: string[]
  imageCount: number
  annotationCount: number
  bookmarks: number
  formFields: number
  hasPageLabels: boolean
  tagged: boolean
  embeddedFiles: number
}

export interface ExtractedImage {
  path: string
  page: number
  width: number
  height: number
  format: string
}

export interface ImageExtraction {
  directory: string
  images: ExtractedImage[]
  skipped: string[]
}

export interface PageComparison {
  page: number
  width: number
  height: number
  differentPixels: number
  totalPixels: number
  difference: number
}

export interface PdfComparison {
  pageCountA: number
  pageCountB: number
  pages: PageComparison[]
  identical: boolean
  note?: string | null
}

/** What the PDF page can show about one document before a job runs. */
export interface PdfDocumentInfo {
  path: string
  pageCount: number
  version: string
  /** The file arrived encrypted and was opened with the supplied password. */
  encrypted: boolean
  title?: string | null
  author?: string | null
  subject?: string | null
  keywords?: string | null
  creator?: string | null
  producer?: string | null
}

/** Installed OCR languages, read from Tesseract rather than guessed by the UI. */
export interface OcrCapabilities {
  available: boolean
  version?: string | null
  reason?: string | null
  languages: string[]
  tessdataPath?: string | null
  inputFormats: FormatId[]
  outputFormats: FormatId[]
}

export interface SubmitOutcome {
  inputPath: string
  accepted: boolean
  job?: ConversionJob | null
  error?: AppError | null
  /** Set when an existing file was left alone because the collision policy is skip. */
  skippedPath?: string | null
}

/** One codec a container can carry, and whether this FFmpeg build has its encoder. */
export interface CodecSupport {
  id: string
  label: string
  available: boolean
}

/** What the installed FFmpeg build can really write for one output format. */
export interface FormatSupport {
  format: FormatId
  available: boolean
  reason?: string | null
  codecs: CodecSupport[]
  /** Audio tracks a video container can carry; empty for audio outputs. */
  audioCodecs: CodecSupport[]
}

export interface HardwareEncoder {
  /** FFmpeg encoder name, e.g. `h264_nvenc`. */
  encoder: string
  /** `h264` or `hevc`. */
  codec: string
  label: string
  available: boolean
  /** Why the test encode failed, when it did. */
  reason?: string | null
}

export interface MediaCapabilities {
  available: boolean
  ffmpegVersion?: string | null
  ffprobeVersion?: string | null
  reason?: string | null
  formats: FormatSupport[]
  hardware: HardwareEncoder[]
}

/** One entry in a declared archive listing, before anything is extracted. */
export interface ArchiveEntry {
  path: string
  size: number
  packedSize: number
  isDirectory: boolean
  encrypted: boolean
  isLink: boolean
  modified?: string | null
}

/** The listing is the security boundary: it is inspected before a destination exists. */
export interface ArchiveListing {
  format: FormatId
  encrypted: boolean
  entries: ArchiveEntry[]
  fileCount: number
  totalBytes: number
  totalPackedBytes: number
  hasLinks: boolean
}

/** What this machine's 7-Zip can create and read, not just "the engine exists". */
export interface ArchiveCapabilities {
  available: boolean
  version?: string | null
  reason?: string | null
  createFormats: FormatId[]
  extractFormats: FormatId[]
}

/** One track reported by ffprobe. */
export interface MediaStream {
  index: number
  kind: string
  codec: string
  codecLong?: string | null
  width?: number | null
  height?: number | null
  frameRate?: number | null
  sampleRate?: number | null
  channels?: number | null
  channelLayout?: string | null
  bitRate?: number | null
  durationMs?: number | null
  language?: string | null
  title?: string | null
  /** Cover art stored as a video stream, not a real video track. */
  attachedPic: boolean
}

export interface MediaInfo {
  path: string
  formatName: string
  formatLabel: string
  durationMs?: number | null
  sizeBytes: number
  bitRate?: number | null
  title?: string | null
  streams: MediaStream[]
}

export interface AppError {
  kind: string
  message: string
}

export interface QueueStats {
  active: number
  queued: number
  limit: number
}

export interface HistoryEntry {
  id: string
  inputPath: string
  outputPath: string
  inputFormat: FormatId
  outputFormat: FormatId
  engine: EngineId
  status: JobStatus
  inputBytes: number
  outputBytes?: number | null
  error?: string | null
  errorKind?: string | null
  createdAtMs: number
  finishedAtMs?: number | null
}

export interface AppSettings {
  concurrentJobs: number
  outputDirectoryMode: OutputDirectoryMode
  customOutputDirectory?: string | null
  collisionPolicy: CollisionPolicy
  theme: 'dark' | 'light' | 'system'
  maxInputMb: number
  documentTimeoutSeconds: number
  archiveTimeoutSeconds: number
  ocrTimeoutSeconds: number
  maxExtractionMb: number
  maxExtractionFiles: number
  deleteTempOnExit: boolean
  welcomeCompleted: boolean
  nativeNotifications: boolean
  enginePaths: Record<string, string>
}

export interface LogFileInfo {
  name: string
  bytes: number
  modifiedMs?: number | null
}

export interface AppInfo {
  version: string
  osVersion: string
  kernelVersion: string
  architecture: string
  debugBuild: boolean
  installRoot: string
  dataRoot: string
  databaseFile: string
  tempRoot: string
  logsRoot: string
  cacheRoot: string
  logFiles: LogFileInfo[]
}

export interface FavoriteEntry {
  path: string
  format: FormatId
  addedAtMs: number
}

export interface ShellIntegration {
  enabled: boolean
  supported: boolean
}

export interface BackupPreview {
  format: string
  version: number
  appVersion: string
  createdAtMs: number
  presets: number
  workflows: number
  automationRules: number
  favorites: number
  history: number
}

export interface DiagnosticsExport {
  directory: string
  reportFile: string
  logFiles: string[]
  skippedLogs: string[]
}

export interface Preset {
  id: string
  name: string
  engine: EngineId
  outputFormat: FormatId
  settings: ConversionSettings
}

export type JobEvent =
  | { type: 'progress'; jobId: string; progress: number; stage: string }
  | {
      type: 'status'
      jobId: string
      status: JobStatus
      error?: string | null
      errorKind?: string | null
    }
  | { type: 'added'; job: ConversionJob }
  | { type: 'queueStats'; active: number; queued: number }
