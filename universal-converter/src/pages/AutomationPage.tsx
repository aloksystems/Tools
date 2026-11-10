import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SettingsJsonField, FolderField, FormatSelect, FORMAT_GROUPS, formatError, parseSettingsJson, settingsText, when } from '@/features/tools/shared'
import { FORMAT_LABELS } from '@/utils/format'
import { api } from '@/utils/api'
import {
  Bot,
  FolderSearch,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AutomationLogEntry, AutomationMode, AutomationRule, AutomationStatus } from '@/types/automation'
import type { FormatId } from '@/types/converter'

interface RuleDraft {
  id: string
  name: string
  inputDir: string
  outputDir: string
  mode: AutomationMode
  outputFormat: FormatId | ''
  inputFormats: FormatId[]
  settings: string
  enabled: boolean
}

function emptyDraft(): RuleDraft {
  return {
    id: '',
    name: '',
    inputDir: '',
    outputDir: '',
    mode: 'convert',
    outputFormat: '',
    inputFormats: [],
    settings: '{}',
    enabled: true,
  }
}

function draftFrom(rule: AutomationRule): RuleDraft {
  return {
    id: rule.id,
    name: rule.name,
    inputDir: rule.inputDir,
    outputDir: rule.outputDir,
    mode: rule.mode,
    outputFormat: rule.outputFormat,
    inputFormats: [...rule.inputFormats],
    settings: settingsText(rule.settings),
    enabled: rule.enabled,
  }
}

function modeLabel(mode: AutomationMode): string {
  return mode === 'ocr' ? 'OCR' : 'Convert'
}

export function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [logs, setLogs] = useState<AutomationLogEntry[]>([])
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [nextRules, nextStatus, nextLogs] = await Promise.all([
        api.listAutomationRules(),
        api.automationStatus(),
        api.automationLogs(200),
      ])
      setRules(nextRules)
      setStatus(nextStatus)
      setLogs(nextLogs)
    } catch (reason) {
      setError(formatError(reason))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 4000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const ruleNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const rule of rules) names.set(rule.id, rule.name)
    return names
  }, [rules])

  const toggleFormat = (format: FormatId, checked: boolean) => {
    setDraft((current) => {
      if (!current) return current
      const next = checked
        ? [...current.inputFormats, format]
        : current.inputFormats.filter((entry) => entry !== format)
      return { ...current, inputFormats: next }
    })
  }

  const save = async () => {
    if (!draft) return
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (!draft.outputFormat) throw new Error('choose an output format for this rule')
      const settings = parseSettingsJson(draft.settings)
      const saved = await api.saveAutomationRule({
        id: draft.id,
        name: draft.name.trim(),
        inputDir: draft.inputDir.trim(),
        outputDir: draft.outputDir.trim(),
        inputFormats: draft.inputFormats,
        outputFormat: draft.outputFormat,
        mode: draft.mode,
        settings,
        enabled: draft.enabled,
      })
      setDraft(null)
      setNotice(`Saved “${saved.name}”. The watcher reloaded immediately.`)
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  const toggleEnabled = async (rule: AutomationRule, enabled: boolean) => {
    setError(null)
    try {
      await api.saveAutomationRule({ ...rule, enabled })
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  const remove = async (rule: AutomationRule) => {
    if (!window.confirm(`Delete the automation rule “${rule.name}”? Watched files stay untouched.`)) {
      return
    }
    setError(null)
    try {
      await api.deleteAutomationRule(rule.id)
      if (draft?.id === rule.id) setDraft(null)
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  const setPaused = async (paused: boolean) => {
    setError(null)
    setNotice(null)
    try {
      await api.setAutomationPaused(paused)
      setNotice(paused ? 'Automation paused. New files wait until you resume.' : 'Automation resumed.')
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  const clearLogs = async () => {
    if (!window.confirm('Clear the automation log? This only removes log rows.')) return
    try {
      await api.clearAutomationLog()
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Bot className="size-5" />
            Automation Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            Convert or OCR files as they arrive in a folder. Outputs never trigger the watcher
            again, and originals are never deleted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            variant={status?.paused ? 'default' : 'outline'}
            disabled={!status}
            onClick={() => void setPaused(!status?.paused)}
          >
            {status?.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {status?.paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {status ? (
          <>
            <Badge variant={status.paused ? 'warning' : 'success'}>
              {status.paused ? 'Paused' : 'Watching'}
            </Badge>
            <Badge variant="muted">
              <FolderSearch className="size-3" />
              {status.watching} folder{status.watching === 1 ? '' : 's'} subscribed
            </Badge>
            <Badge variant="muted">
              {status.enabledRules} of {status.totalRules} rule
              {status.totalRules === 1 ? '' : 's'} enabled
            </Badge>
          </>
        ) : (
          <Badge variant="muted">Reading status…</Badge>
        )}
      </div>

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

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Rules</h2>
            {!draft ? (
              <Button size="sm" onClick={() => { setDraft(emptyDraft()); setError(null); setNotice(null) }}>
                <Plus className="size-3.5" />
                New rule
              </Button>
            ) : null}
          </div>

          {draft ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>{draft.id ? 'Edit rule' : 'New rule'}</CardTitle>
                  <CardDescription>
                    The watched and output folders must not contain each other.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Close editor" onClick={() => setDraft(null)}>
                  <X className="size-4" />
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Rule name</span>
                    <Input
                      value={draft.name}
                      placeholder="Screenshots to WebP"
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">What happens</span>
                    <select
                      value={draft.mode}
                      onChange={(event) =>
                        setDraft({ ...draft, mode: event.target.value as AutomationMode })
                      }
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <option value="convert">Convert to the chosen format</option>
                      <option value="ocr">OCR into text or a searchable PDF</option>
                    </select>
                  </label>
                </div>

                <FolderField
                  label="Watched folder"
                  value={draft.inputDir}
                  placeholder="D:\Screenshots"
                  onChange={(inputDir) => setDraft({ ...draft, inputDir })}
                />
                <FolderField
                  label="Output folder"
                  value={draft.outputDir}
                  placeholder="D:\Converted"
                  onChange={(outputDir) => setDraft({ ...draft, outputDir })}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Output format</span>
                    <FormatSelect
                      value={draft.outputFormat}
                      formats={draft.mode === 'ocr' ? ['txt', 'pdf'] : undefined}
                      onChange={(outputFormat) => setDraft({ ...draft, outputFormat })}
                    />
                  </label>
                  <label className="flex items-center gap-2 pt-5 text-sm">
                    <Switch
                      checked={draft.enabled}
                      onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
                    />
                    Enabled
                  </label>
                </div>

                <details className="rounded-lg border border-border/70 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Input formats — {draft.inputFormats.length === 0
                      ? 'all recognised formats'
                      : `${draft.inputFormats.length} selected`}
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary"
                        checked={draft.inputFormats.length === 0}
                        onChange={() => setDraft({ ...draft, inputFormats: [] })}
                      />
                      All formats
                    </label>
                    {FORMAT_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          {group.label}
                        </p>
                        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                          {group.formats.map((format) => (
                            <label key={format} className="flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                className="size-3.5 accent-primary"
                                checked={draft.inputFormats.includes(format)}
                                onChange={(event) => toggleFormat(format, event.target.checked)}
                              />
                              {FORMAT_LABELS[format]}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

                <SettingsJsonField
                  value={draft.settings}
                  onChange={(settings) => setDraft({ ...draft, settings })}
                  hint="Passed to the chosen engine. Leave {} for defaults; passwords are refused."
                />

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => void save()}>
                    Save rule
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {rules.length === 0 && !draft ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <FolderSearch className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">No automation rules yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Create a rule, drop a file into the watched folder, and it is queued once it has
                  been quiet for a moment.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex flex-col gap-2 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{rule.name}</p>
                  <Badge variant={rule.enabled ? 'success' : 'muted'}>
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <Badge variant="outline">{modeLabel(rule.mode)}</Badge>
                  <Badge variant="outline">→ {FORMAT_LABELS[rule.outputFormat]}</Badge>
                  {rule.inputFormats.length > 0 ? (
                    <Badge variant="muted">
                      {rule.inputFormats.map((format) => FORMAT_LABELS[format]).join(', ')}
                    </Badge>
                  ) : (
                    <Badge variant="muted">All inputs</Badge>
                  )}
                  <span className="flex-1" />
                  <Switch
                    checked={rule.enabled}
                    aria-label={`Enable ${rule.name}`}
                    onCheckedChange={(enabled) => void toggleEnabled(rule, enabled)}
                  />
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${rule.name}`} onClick={() => setDraft(draftFrom(rule))}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${rule.name}`} onClick={() => void remove(rule)}>
                    <Trash className="size-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {rule.inputDir} → {rule.outputDir}
                </p>
                <p className="font-mono text-[11px] break-all text-muted-foreground">
                  {JSON.stringify(rule.settings)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Activity log</h2>
            <Button variant="ghost" size="sm" onClick={() => void clearLogs()} disabled={logs.length === 0}>
              Clear
            </Button>
          </div>
          {logs.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-xs text-muted-foreground">
                Nothing logged yet. Rule saves, queued files and failures appear here.
              </CardContent>
            </Card>
          ) : (
            <ul className="flex max-h-[34rem] flex-col divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70">
              {logs.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 p-2.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.level === 'error' ? 'destructive' : 'muted'}>
                      {entry.level}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{when(entry.createdAtMs)}</span>
                  </div>
                  <p className="text-xs break-words">{entry.message}</p>
                  {entry.ruleId ? (
                    <p className="text-[11px] text-muted-foreground">
                      Rule: {ruleNames.get(entry.ruleId) ?? entry.ruleId}
                    </p>
                  ) : null}
                  {entry.path ? (
                    <p className="font-mono text-[11px] break-all text-muted-foreground">{entry.path}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">
            A file must stay unchanged for 1.5 seconds before it is queued, so copies in progress are
            never converted half-written.
          </p>
        </div>
      </div>
    </div>
  )
}
