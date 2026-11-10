import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AddFilesButton, PathList } from '@/features/utilities/shared'
import {
  FolderField,
  FormatSelect,
  SettingsJsonField,
  formatError,
  parseSettingsJson,
  settingsText,
  when,
} from '@/features/tools/shared'
import { fileName, FORMAT_LABELS } from '@/utils/format'
import { api } from '@/utils/api'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import {
  ArrowDown,
  ArrowUp,
  CircleStop,
  FolderOpen,
  ListChecks,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash,
  Workflow,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  WorkflowDefinition,
  WorkflowOperation,
  WorkflowRun,
  WorkflowRunStatus,
} from '@/types/automation'
import type { FormatId } from '@/types/converter'

interface StepDraft {
  operation: WorkflowOperation
  outputFormat: FormatId | ''
  settings: string
}

interface Draft {
  id: string
  name: string
  steps: StepDraft[]
}

function emptyStep(): StepDraft {
  return { operation: 'convert', outputFormat: '', settings: '{}' }
}

function emptyDraft(): Draft {
  return { id: '', name: '', steps: [emptyStep()] }
}

function draftFrom(workflow: WorkflowDefinition): Draft {
  return {
    id: workflow.id,
    name: workflow.name,
    steps: workflow.steps.map((step) => ({
      operation: step.operation,
      outputFormat: step.outputFormat,
      settings: settingsText(step.settings),
    })),
  }
}

const RUN_VARIANT: Record<
  WorkflowRunStatus,
  'default' | 'success' | 'warning' | 'destructive' | 'muted'
> = {
  running: 'default',
  completed: 'success',
  completedWithErrors: 'warning',
  failed: 'destructive',
  cancelled: 'muted',
}

function runLabel(status: WorkflowRunStatus): string {
  switch (status) {
    case 'running':
      return 'Running'
    case 'completed':
      return 'Completed'
    case 'completedWithErrors':
      return 'Completed with errors'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
  }
}

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [runWorkflowId, setRunWorkflowId] = useState('')
  const [runPaths, setRunPaths] = useState<string[]>([])
  const [runOutputDir, setRunOutputDir] = useState('')
  const [runOutputName, setRunOutputName] = useState('')

  const refreshWorkflows = useCallback(async () => {
    try {
      setWorkflows(await api.listWorkflows())
    } catch (reason) {
      setError(formatError(reason))
    }
  }, [])

  const refreshRuns = useCallback(async () => {
    try {
      setRuns(await api.workflowRuns())
    } catch (reason) {
      setError(formatError(reason))
    }
  }, [])

  useEffect(() => {
    void refreshWorkflows()
    void refreshRuns()
    const timer = window.setInterval(() => void refreshRuns(), 1200)
    return () => window.clearInterval(timer)
  }, [refreshWorkflows, refreshRuns])

  useEffect(() => {
    if (workflows.length === 0) return
    setRunWorkflowId((current) =>
      workflows.some((workflow) => workflow.id === current) ? current : workflows[0]!.id,
    )
  }, [workflows])

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === runWorkflowId) ?? null,
    [workflows, runWorkflowId],
  )

  const addPaths = (paths: string[]) => {
    setRunPaths((current) => {
      const merged = [...current]
      for (const path of paths) if (!merged.includes(path)) merged.push(path)
      return merged
    })
  }

  const save = async () => {
    if (!draft) return
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (draft.name.trim() === '') throw new Error('give the workflow a name')
      if (draft.steps.length === 0) throw new Error('add at least one step')
      const steps = draft.steps.map((step, index) => {
        if (!step.outputFormat) throw new Error(`step ${index + 1} needs an output format`)
        return {
          operation: step.operation,
          outputFormat: step.outputFormat,
          settings: parseSettingsJson(step.settings),
        }
      })
      const saved = await api.saveWorkflow({ id: draft.id, name: draft.name.trim(), steps })
      setDraft(null)
      setNotice(`Saved “${saved.name}”.`)
      await refreshWorkflows()
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (workflow: WorkflowDefinition) => {
    if (
      !window.confirm(
        `Delete the workflow “${workflow.name}”? Files it already produced are untouched.`,
      )
    ) {
      return
    }
    try {
      await api.deleteWorkflow(workflow.id)
      if (draft?.id === workflow.id) setDraft(null)
      await refreshWorkflows()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  const startRun = async () => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (!selectedWorkflow) throw new Error('choose a workflow to run')
      if (runPaths.length === 0) throw new Error('add at least one file')
      if (runOutputDir.trim() === '') throw new Error('choose a folder for the finished files')
      const run = await api.startWorkflow({
        workflowId: selectedWorkflow.id,
        inputPaths: runPaths,
        outputDir: runOutputDir.trim(),
        outputName: runPaths.length === 1 ? runOutputName.trim() || null : null,
      })
      setNotice(`Started “${run.workflowName}” with ${run.total} file${run.total === 1 ? '' : 's'}.`)
      await refreshRuns()
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  const cancelRun = async (run: WorkflowRun) => {
    try {
      await api.cancelWorkflowRun(run.id)
      await refreshRuns()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Workflow className="size-5" />
            Workflows
          </h1>
          <p className="text-sm text-muted-foreground">
            Chain up to six conversions. Each file runs through every step in order; intermediate
            files stay in the app's temp folder and are removed afterwards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refreshRuns()}>
            <RefreshCw className="size-3.5" />
            Refresh runs
          </Button>
          {!draft ? (
            <Button
              size="sm"
              onClick={() => {
                setDraft(emptyDraft())
                setError(null)
                setNotice(null)
              }}
            >
              <Plus className="size-3.5" />
              New workflow
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs break-all text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-success/30 bg-success/10 p-2.5 text-xs text-success">
          {notice}
        </p>
      ) : null}

      {draft ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>{draft.id ? 'Edit workflow' : 'New workflow'}</CardTitle>
              <CardDescription>
                A step's output becomes the next step's input. The last format is what lands in your
                folder.
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Close editor" onClick={() => setDraft(null)}>
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Workflow name</span>
              <Input
                value={draft.name}
                placeholder="Scan to searchable PDF"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>

            <div className="flex flex-col gap-2">
              {draft.steps.map((step, index) => (
                <div key={index} className="rounded-lg border border-border/70 p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted-foreground">Operation</span>
                      <select
                        value={step.operation}
                        onChange={(event) => {
                          const operation = event.target.value as WorkflowOperation
                          const next = [...draft.steps]
                          next[index] = {
                            ...step,
                            operation,
                            outputFormat:
                              operation === 'ocr' && step.outputFormat !== 'txt' && step.outputFormat !== 'pdf'
                                ? ''
                                : step.outputFormat,
                          }
                          setDraft({ ...draft, steps: next })
                        }}
                        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="convert">Convert</option>
                        <option value="ocr">OCR</option>
                      </select>
                    </label>
                    <label className="flex min-w-40 flex-col gap-1">
                      <span className="text-[11px] text-muted-foreground">Output format</span>
                      <FormatSelect
                        value={step.outputFormat}
                        formats={step.operation === 'ocr' ? ['txt', 'pdf'] : undefined}
                        onChange={(outputFormat) => {
                          const next = [...draft.steps]
                          next[index] = { ...step, outputFormat }
                          setDraft({ ...draft, steps: next })
                        }}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      />
                    </label>
                    <span className="flex-1" />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move step ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...draft.steps]
                        ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                        setDraft({ ...draft, steps: next })
                      }}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move step ${index + 1} down`}
                      disabled={index === draft.steps.length - 1}
                      onClick={() => {
                        const next = [...draft.steps]
                        ;[next[index + 1], next[index]] = [next[index]!, next[index + 1]!]
                        setDraft({ ...draft, steps: next })
                      }}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove step ${index + 1}`}
                      disabled={draft.steps.length === 1}
                      onClick={() =>
                        setDraft({ ...draft, steps: draft.steps.filter((_, at) => at !== index) })
                      }
                    >
                      <Trash className="size-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2">
                    <SettingsJsonField
                      value={step.settings}
                      rows={3}
                      label="Step settings (JSON)"
                      onChange={(settings) => {
                        const next = [...draft.steps]
                        next[index] = { ...step, settings }
                        setDraft({ ...draft, steps: next })
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={draft.steps.length >= 6}
                onClick={() => setDraft({ ...draft, steps: [...draft.steps, emptyStep()] })}
              >
                <Plus className="size-3.5" />
                Add step
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void save()}>
                  Save workflow
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Saved workflows</h2>
          {workflows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <ListChecks className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">No workflows yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Build a pipeline such as PNG → JPEG → WebP, or OCR straight into a searchable PDF.
                </p>
              </CardContent>
            </Card>
          ) : null}
          {workflows.map((workflow) => (
            <Card key={workflow.id}>
              <CardContent className="flex flex-col gap-2 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{workflow.name}</p>
                  <span className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRunWorkflowId(workflow.id)
                      setNotice(null)
                    }}
                  >
                    <Play className="size-3.5" />
                    Run
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${workflow.name}`}
                    onClick={() => setDraft(draftFrom(workflow))}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${workflow.name}`}
                    onClick={() => void remove(workflow)}
                  >
                    <Trash className="size-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {workflow.steps.map((step, index) => (
                    <span key={index} className="flex items-center gap-1.5">
                      <Badge variant="outline">
                        {step.operation === 'ocr' ? 'OCR' : 'Convert'} →{' '}
                        {FORMAT_LABELS[step.outputFormat]}
                      </Badge>
                      {index < workflow.steps.length - 1 ? (
                        <span className="text-xs text-muted-foreground">→</span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Run a workflow</CardTitle>
            <CardDescription>Outputs go to the folder you choose.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Workflow</span>
              <select
                value={runWorkflowId}
                onChange={(event) => setRunWorkflowId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
              >
                {workflows.length === 0 ? <option value="">No workflows saved</option> : null}
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Files</span>
              <AddFilesButton onPaths={addPaths} label="Add files…" />
            </div>
            <PathList
              paths={runPaths}
              onRemove={(path) => setRunPaths((current) => current.filter((entry) => entry !== path))}
              emptyLabel="Add the files this workflow should process."
            />

            <FolderField
              label="Output folder"
              value={runOutputDir}
              placeholder="D:\Finished"
              onChange={setRunOutputDir}
            />
            {runPaths.length === 1 ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Output name (optional)
                </span>
                <Input
                  value={runOutputName}
                  placeholder="Leave empty to reuse the input name"
                  onChange={(event) => setRunOutputName(event.target.value)}
                  className="h-8 text-xs"
                />
              </label>
            ) : null}

            <Button disabled={busy || workflows.length === 0} onClick={() => void startRun()}>
              <Play className="size-4" />
              Start workflow
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Originals stay where they are. Intermediate step files are written to the app temp
              folder and deleted when the run ends.
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent runs</h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={runs.every((run) => run.status === 'running')}
            onClick={async () => {
              await api.clearWorkflowRuns()
              await refreshRuns()
            }}
          >
            Clear finished
          </Button>
        </div>

        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
            No runs in this session. Start one above.
          </p>
        ) : null}

        {runs.map((run) => (
          <Card key={run.id}>
            <CardContent className="flex flex-col gap-2 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{run.workflowName}</p>
                <Badge variant={RUN_VARIANT[run.status]}>{runLabel(run.status)}</Badge>
                <span className="text-xs text-muted-foreground">
                  {run.completed + run.failed} of {run.total} file
                  {run.total === 1 ? '' : 's'}
                  {run.failed > 0 ? ` · ${run.failed} failed` : ''}
                </span>
                <span className="flex-1" />
                <span className="text-[11px] text-muted-foreground">
                  Started {when(run.startedAtMs)}
                </span>
                {run.status === 'running' ? (
                  <Button variant="outline" size="sm" onClick={() => void cancelRun(run)}>
                    <CircleStop className="size-3.5" />
                    Cancel
                  </Button>
                ) : null}
              </div>

              {run.status === 'running' ? (
                <p className="text-xs text-muted-foreground">
                  {run.currentInput
                    ? `${fileName(run.currentInput)} · step ${run.currentStep} of ${run.totalSteps}`
                    : 'Preparing the next file…'}
                </p>
              ) : null}

              {run.outputs.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {run.outputs.map((path) => (
                    <li key={path} className="flex items-center gap-2 text-xs">
                      <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono" title={path}>
                        {path}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Show ${fileName(path)} in folder`}
                        onClick={() => void revealItemInDir(path).catch(() => undefined)}
                      >
                        <FolderOpen className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {run.errors.length > 0 ? (
                <ul className="flex flex-col gap-1 rounded-md border border-destructive/25 bg-destructive/5 p-2">
                  {run.errors.map((message, index) => (
                    <li key={index} className="text-xs break-words text-destructive">
                      {message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
