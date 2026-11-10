import type {
  AppInfo,
  AppSettings,
  ArchiveCapabilities,
  ArchiveListing,
  BackupPreview,
  ConversionJob,
  ConversionSettings,
  DiagnosticsExport,
  EngineInfo,
  FavoriteEntry,
  FileProbe,
  FormatId,
  FormatRoute,
  HistoryEntry,
  ImageExtraction,
  JobOperation,
  MediaCapabilities,
  MediaInfo,
  OcrCapabilities,
  PdfCapability,
  PdfComparison,
  PdfDeepInfo,
  PdfDocumentInfo,
  Preset,
  QueueStats,
  ShellIntegration,
  SubmitOutcome,
} from '@/types/converter'
import type {
  AutomationLogEntry,
  AutomationRule,
  AutomationStatus,
  PresetImportReport,
  WorkflowDefinition,
  WorkflowRequest,
  WorkflowRun,
} from '@/types/automation'
import type {
  ChecksumCheck,
  DuplicateReport,
  FileComparison,
  FileHashes,
  FileInfo,
  ImageComparison,
  ImageInfo,
  MetadataComparison,
  MetadataDocument,
  MetadataEditRequest,
  MetadataRemoval,
  MetadataWriteResult,
  SignatureReport,
  SizeReport,
} from '@/types/tools'
import { call } from './tauri'

export interface JobRequest {
  inputPath: string
  outputFormat: FormatId
  settings: ConversionSettings
  /** Defaults to a plain conversion when omitted. */
  operation?: JobOperation
  /** Overrides the directory derived from app settings for this one job. */
  outputDirectory?: string
  /** Extra inputs for a multi-file operation; `inputPath` stays the first. */
  extraInputs?: string[]
  /** Stem for the produced file — the engine appends the extension. */
  outputName?: string
  /** Archive entries to extract; empty means the whole archive. */
  selectedEntries?: string[]
  /** Sent to Rust but never stored in history, presets or logs. */
  password?: string
}

export interface SystemResources {
  totalMemoryMb: number
  availableMemoryMb: number
  cpuCores: number
  /** Suggested ceiling for simultaneous jobs, based on free memory. */
  recommendedConcurrency: number
}

export const api = {
  probeFiles: (paths: string[]) => call<FileProbe[]>('probe_files', { paths }),
  listEngines: () => call<EngineInfo[]>('list_engines'),
  /** Re-detects engine binaries after the user installs or moves one. */
  rescanEngines: () => call<EngineInfo[]>('rescan_engines'),
  listCapabilities: (input: FormatId) => call<FormatRoute[]>('list_capabilities', { input }),
  pdfCapabilities: () => call<PdfCapability[]>('pdf_capabilities'),
  /** Tesseract's version and installed language packs. */
  ocrCapabilities: () => call<OcrCapabilities>('ocr_capabilities'),
  /** Reads metadata and page count; an encrypted file needs its password. */
  inspectPdf: (path: string, password: string) =>
    call<PdfDocumentInfo>('inspect_pdf', { path, password }),
  /** Structural report: page boxes, fonts, images, annotations, forms, bookmarks. */
  inspectPdfDeep: (path: string, password: string) =>
    call<PdfDeepInfo>('inspect_pdf_deep', { path, password }),
  /** Writes every embedded image into the chosen folder. */
  extractPdfImages: (path: string, password: string, pageRanges: string, outputDirectory: string) =>
    call<ImageExtraction>('extract_pdf_images', { path, password, pageRanges, outputDirectory }),
  /** Pixel comparison of two PDFs at the same resolution. */
  comparePdfs: (pathA: string, passwordA: string, pathB: string, passwordB: string) =>
    call<PdfComparison>('compare_pdfs', { pathA, passwordA, pathB, passwordB }),
  /** One page as a PNG data URL, asked for lazily by the Studio grid. */
  pdfPagePreview: (path: string, password: string, page: number, width = 220) =>
    call<string>('pdf_page_preview', { path, password, page, width }),
  /** What the bundled FFmpeg build can really encode, hardware tests included. */
  mediaCapabilities: () => call<MediaCapabilities>('media_capabilities'),
  /** Structured ffprobe metadata for one file. */
  inspectMedia: (path: string) => call<MediaInfo>('inspect_media', { path }),
  /** Container formats this 7-Zip can create and read. */
  archiveCapabilities: () => call<ArchiveCapabilities>('archive_capabilities'),
  /** Declared contents of one archive; an encrypted archive needs its password. */
  inspectArchive: (path: string, password?: string) =>
    call<ArchiveListing>('inspect_archive', { path, password: password || null }),
  /** Ordered sheet names for the CSV sheet picker. */
  documentSheets: (path: string) => call<string[]>('document_sheets', { path }),
  /** One poster frame as a PNG data URL. */
  mediaThumbnail: (path: string, atMs = 0, width = 320) =>
    call<string>('media_thumbnail', { path, atMs, width }),
  /** A short, small GIF rendered with the real palette chain. */
  gifPreview: (
    path: string,
    startMs: number | null,
    durationMs: number | null,
    fps: number,
    width: number,
    height: number,
  ) => call<string>('gif_preview', { path, startMs, durationMs, fps, width, height }),
  submitJobs: (requests: JobRequest[]) => call<SubmitOutcome[]>('submit_jobs', { requests }),
  listJobs: () => call<ConversionJob[]>('list_jobs'),
  queueStats: () => call<QueueStats>('queue_stats'),
  cancelJob: (jobId: string) => call<void>('cancel_job', { jobId }),
  retryJob: (jobId: string) => call<void>('retry_job', { jobId }),
  clearFinishedJobs: () => call<void>('clear_finished_jobs'),
  loadHistory: (limit: number, offset: number) =>
    call<HistoryEntry[]>('load_history', { limit, offset }),
  clearHistory: () => call<number>('clear_history'),
  recentFiles: (limit: number) => call<string[]>('recent_files', { limit }),
  listFavorites: () => call<FavoriteEntry[]>('list_favorites'),
  setFavorite: (path: string, format: FormatId, favorite: boolean) =>
    call<void>('set_favorite', { path, format, favorite }),
  shellIntegration: () => call<ShellIntegration>('shell_integration'),
  setShellIntegration: (enabled: boolean) =>
    call<ShellIntegration>('set_shell_integration', { enabled }),
  takeOpenedFiles: () => call<string[]>('take_opened_files'),
  getSettings: () => call<AppSettings>('get_settings'),
  saveSettings: (settings: AppSettings) => call<void>('save_settings', { settings }),
  resetSettings: () => call<AppSettings>('reset_settings'),
  appInfo: () => call<AppInfo>('app_info'),
  diagnosticsReport: () => call<string>('diagnostics_report'),
  exportDiagnostics: (directory: string) =>
    call<DiagnosticsExport>('export_diagnostics', { directory }),
  exportBackup: (path: string) => call<BackupPreview>('export_backup', { path }),
  /** Parses and validates only; nothing is replaced. */
  inspectBackup: (path: string) => call<BackupPreview>('inspect_backup', { path }),
  /** Replaces presets, workflows, rules, favorites, history and settings. */
  restoreBackup: (path: string) => call<BackupPreview>('restore_backup', { path }),
  clearCache: () => call<number>('clear_cache'),
  listPresets: () => call<Preset[]>('list_presets'),
  savePreset: (preset: Preset) => call<Preset>('save_preset', { preset }),
  deletePreset: (presetId: string) => call<void>('delete_preset', { presetId }),
  /** Copy of one preset with a fresh id and a unique "copy" name. */
  duplicatePreset: (presetId: string) => call<Preset>('duplicate_preset', { presetId }),
  /** Pretty JSON bundle; secrets are scrubbed in Rust before it is returned. */
  exportPresets: () => call<string>('export_presets'),
  importPresets: (json: string) => call<PresetImportReport>('import_presets', { json }),
  importPresetsFile: (path: string) =>
    call<PresetImportReport>('import_presets_file', { path }),
  installDefaultPresets: () => call<number>('install_default_presets'),
  listAutomationRules: () => call<AutomationRule[]>('list_automation_rules'),
  /** Validates and stores a rule; the returned rule carries its generated id. */
  saveAutomationRule: (rule: AutomationRule) =>
    call<AutomationRule>('save_automation_rule', { rule }),
  deleteAutomationRule: (ruleId: string) => call<void>('delete_automation_rule', { ruleId }),
  automationStatus: () => call<AutomationStatus>('automation_status'),
  setAutomationPaused: (paused: boolean) => call<void>('set_automation_paused', { paused }),
  automationLogs: (limit: number) => call<AutomationLogEntry[]>('automation_logs', { limit }),
  clearAutomationLog: () => call<number>('clear_automation_log'),
  listWorkflows: () => call<WorkflowDefinition[]>('list_workflows'),
  saveWorkflow: (workflow: WorkflowDefinition) =>
    call<WorkflowDefinition>('save_workflow', { workflow }),
  deleteWorkflow: (workflowId: string) => call<void>('delete_workflow', { workflowId }),
  startWorkflow: (request: WorkflowRequest) => call<WorkflowRun>('start_workflow', { request }),
  workflowRuns: () => call<WorkflowRun[]>('workflow_runs'),
  cancelWorkflowRun: (runId: string) => call<void>('cancel_workflow_run', { runId }),
  clearWorkflowRuns: () => call<number>('clear_workflow_runs'),
  systemResources: () => call<SystemResources>('system_resources'),
  purgeTempFiles: () => call<number>('purge_temp_files'),
  /** Removes a file's history rows and its Recents entry; never touches the file. */
  forgetHistory: (path: string) => call<number>('forget_history', { path }),
  storageRoot: () => call<string>('storage_root'),
  /** Image header values: dimensions, colour model, alpha, bit depth. */
  imageInfo: (path: string) => call<ImageInfo>('image_info', { path }),
  /** Full-resolution pixel comparison plus a downscaled difference preview. */
  compareImages: (pathA: string, pathB: string) =>
    call<ImageComparison>('compare_images', { pathA, pathB }),
  /** Reads EXIF, GPS, PDF info, media tags, document properties or archive facts. */
  readMetadata: (path: string, password = '') =>
    call<MetadataDocument>('read_metadata', { path, password }),
  editMetadata: (
    path: string,
    password: string,
    outputPath: string,
    edit: MetadataEditRequest,
    overwrite = false,
  ) =>
    call<MetadataWriteResult>('edit_metadata', {
      path,
      password,
      outputPath,
      edit,
      overwrite,
    }),
  /** Writes a copy without metadata and verifies the result before reporting. */
  removeMetadata: (path: string, password: string, outputPath: string, overwrite = false) =>
    call<MetadataRemoval>('remove_metadata', { path, password, outputPath, overwrite }),
  compareMetadata: (pathA: string, passwordA: string, pathB: string, passwordB: string) =>
    call<MetadataComparison>('compare_metadata', { pathA, passwordA, pathB, passwordB }),
  fileInfo: (path: string) => call<FileInfo>('file_info', { path }),
  /** Streams one read through MD5, SHA-1, SHA-256 and SHA-512. */
  hashFiles: (paths: string[]) => call<FileHashes[]>('hash_files', { paths }),
  verifyChecksum: (path: string, expected: string) =>
    call<ChecksumCheck>('verify_checksum', { path, expected }),
  compareFiles: (pathA: string, pathB: string) =>
    call<FileComparison>('compare_files', { pathA, pathB }),
  findDuplicates: (paths: string[]) => call<DuplicateReport>('find_duplicates', { paths }),
  calculateSize: (paths: string[]) => call<SizeReport>('calculate_size', { paths }),
  inspectSignature: (path: string) => call<SignatureReport>('inspect_signature', { path }),
  /** Writes an export to a path chosen in the native save dialog. */
  exportText: (path: string, contents: string) => call<void>('export_text', { path, contents }),
}
