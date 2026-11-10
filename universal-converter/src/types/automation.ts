import type { ConversionSettings, FormatId, Preset } from './converter'

export type AutomationMode = 'convert' | 'ocr'

export interface AutomationRule {
  id: string
  name: string
  inputDir: string
  outputDir: string
  /** Empty means every format the converter recognises. */
  inputFormats: FormatId[]
  outputFormat: FormatId
  mode: AutomationMode
  settings: ConversionSettings
  enabled: boolean
}

export interface AutomationStatus {
  paused: boolean
  /** Folders the live watcher is subscribed to. */
  watching: number
  enabledRules: number
  totalRules: number
}

export interface AutomationLogEntry {
  id: number
  ruleId?: string | null
  level: string
  message: string
  path?: string | null
  createdAtMs: number
}

export interface PresetBundle {
  schema: string
  version: number
  exportedAtMs: number
  presets: Preset[]
}

export interface PresetImportReport {
  imported: number
  renamed: string[]
  scrubbed: string[]
  skipped: string[]
}

export type WorkflowOperation = 'convert' | 'ocr'

export interface WorkflowStep {
  operation: WorkflowOperation
  outputFormat: FormatId
  settings: ConversionSettings
}

export interface WorkflowDefinition {
  id: string
  name: string
  steps: WorkflowStep[]
}

export interface WorkflowRequest {
  workflowId: string
  inputPaths: string[]
  outputDir: string
  /** Single-file runs only; a batch names each output after its input. */
  outputName?: string | null
}

export type WorkflowRunStatus =
  | 'running'
  | 'completed'
  | 'completedWithErrors'
  | 'failed'
  | 'cancelled'

export interface WorkflowRun {
  id: string
  workflowId: string
  workflowName: string
  status: WorkflowRunStatus
  total: number
  completed: number
  failed: number
  totalSteps: number
  /** 1-based step in progress; 0 between steps. */
  currentStep: number
  currentInput?: string | null
  activeJobId?: string | null
  outputs: string[]
  errors: string[]
  startedAtMs: number
  finishedAtMs?: number | null
}
