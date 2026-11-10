import { SelectField, SettingRow, SliderField, SwitchField } from '@/components/conversion-settings/controls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { pickAnyFilesDialog, pickDirectoryDialog, pickSavePath } from '@/hooks/useFilesDrop'
import { useAppStore } from '@/stores/appStore'
import type { AppInfo, BackupPreview, EngineInfo, ShellIntegration } from '@/types/converter'
import { api } from '@/utils/api'
import { formatBytes } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { confirm } from '@tauri-apps/plugin-dialog'
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Lock,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Trash2,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'

const ENGINE_TOOLS: { key: string; label: string; hint: string; directory?: boolean }[] = [
  { key: 'ffmpeg', label: 'FFmpeg', hint: 'ffmpeg.exe' },
  { key: 'ffprobe', label: 'FFprobe', hint: 'ffprobe.exe' },
  { key: 'tesseract', label: 'Tesseract', hint: 'tesseract.exe' },
  { key: 'tessdata', label: 'OCR languages', hint: 'folder containing traineddata', directory: true },
  { key: 'libreoffice', label: 'LibreOffice', hint: 'program/soffice.com' },
  { key: '7zip', label: '7-Zip', hint: '7z.exe' },
  { key: 'qpdf', label: 'qpdf', hint: 'qpdf.exe' },
  { key: 'pdfium', label: 'PDFium', hint: 'pdfium.dll' },
]

const SUPPORT_URL = (() => {
  const raw: unknown = import.meta.env.VITE_SUPPORT_URL
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
})()

function buildSupportSummary(info: AppInfo | null, engines: EngineInfo[]): string {
  const lines = [
    `Universal Converter ${info?.version ?? 'unknown version'}${info?.debugBuild ? ' (development build)' : ''}`,
    `System: ${info?.osVersion ?? 'unknown OS'} · ${info?.architecture ?? 'unknown architecture'}`,
    `Captured: ${new Date().toISOString()}`,
    'Engines:',
  ]
  if (engines.length === 0) {
    lines.push('- none reported')
  } else {
    for (const engine of engines) {
      lines.push(
        `- ${engine.label}: ${engine.available ? engine.version ?? 'available' : 'not available'}`,
      )
    }
  }
  return lines.join('\n')
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings)
  const save = useAppStore((state) => state.saveSettings)
  const engines = useAppStore((state) => state.engines)
  const resources = useAppStore((state) => state.resources)
  const rescanEngines = useAppStore((state) => state.rescanEngines)
  const resetSettings = useAppStore((state) => state.resetSettings)
  const [notice, setNotice] = useState<string | null>(null)
  const [storage, setStorage] = useState<string | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [engineDraft, setEngineDraft] = useState<Record<string, string>>(settings.enginePaths ?? {})
  const [shell, setShell] = useState<ShellIntegration | null>(null)
  const [backup, setBackup] = useState<{ path: string; preview: BackupPreview } | null>(null)
  const [busy, setBusy] = useState<
    'none' | 'scanning' | 'purging' | 'exporting' | 'resetting' | 'shell' | 'backup' | 'restore'
  >('none')

  useEffect(() => {
    if (!isTauriRuntime()) return
    api
      .storageRoot()
      .then(setStorage)
      .catch(() => undefined)
    api
      .appInfo()
      .then(setInfo)
      .catch(() => undefined)
    api
      .shellIntegration()
      .then(setShell)
      .catch(() => setShell(null))
  }, [])

  useEffect(() => {
    setEngineDraft(settings.enginePaths ?? {})
  }, [settings.enginePaths])

  const saveEnginePaths = async (paths: Record<string, string>) => {
    setBusy('scanning')
    setNotice(null)
    try {
      await save({ ...settings, enginePaths: paths })
      await rescanEngines()
      setNotice('Engine paths saved and checked.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('none')
    }
  }

  const patch = async (partial: Partial<typeof settings>) => {
    setNotice(null)
    try {
      await save({ ...settings, ...partial })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const toggleNotifications = async (enabled: boolean) => {
    setNotice(null)
    if (!enabled) {
      await patch({ nativeNotifications: false })
      return
    }
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === 'granted'
    if (!granted) {
      setNotice('Windows did not grant notification permission, so the setting stayed off.')
      return
    }
    await patch({ nativeNotifications: true })
  }

  const toggleShell = async (enabled: boolean) => {
    const confirmed = await confirm(
      enabled
        ? 'Add “Convert with Universal Converter” to the Explorer context menu and register the app in Open With? This writes only to HKCU for this Windows account. No default file association is changed, and you can turn it off again here.'
        : 'Remove the Explorer context menu entry and the Open With registration for this account?',
      { title: 'Explorer integration', kind: enabled ? 'info' : 'warning' },
    )
    if (!confirmed) return
    setBusy('shell')
    setNotice(null)
    try {
      const next = await api.setShellIntegration(enabled)
      setShell(next)
      setNotice(
        next.enabled
          ? 'Explorer integration enabled for this account. Existing Explorer windows may need a refresh (F5).'
          : 'Explorer integration removed for this account.',
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('none')
    }
  }

  const exportBackup = async () => {
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-').replace('T', '-')
    let path = await pickSavePath(`universal-converter-backup-${stamp}.json`, 'json')
    if (!path) return
    if (!path.toLowerCase().endsWith('.json')) path += '.json'
    setBusy('backup')
    setNotice(null)
    try {
      const preview = await api.exportBackup(path)
      setNotice(
        `Backup written to ${path}. It contains ${preview.history} history row(s), ${preview.presets} preset(s), ${preview.workflows} workflow(s), ${preview.automationRules} automation rule(s) and ${preview.favorites} favorite(s). Original files are not included.`,
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('none')
    }
  }

  const chooseBackup = async () => {
    const paths = await pickAnyFilesDialog(false)
    const path = paths[0]
    if (!path) return
    setBusy('backup')
    setNotice(null)
    setBackup(null)
    try {
      const preview = await api.inspectBackup(path)
      setBackup({ path, preview })
      setNotice('Backup validated. Review the counts below; nothing has been replaced yet.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('none')
    }
  }

  const applyBackup = async () => {
    if (!backup) return
    const { preview } = backup
    const confirmed = await confirm(
      `Replace the current settings, ${preview.presets} preset(s), ${preview.workflows} workflow(s), ${preview.automationRules} automation rule(s), ${preview.favorites} favorite(s) and ${preview.history} history row(s) with this backup? Current copies are not kept. Your original files are never touched. Automation rules are only accepted when their folders still exist.`,
      { title: 'Restore backup', kind: 'warning' },
    )
    if (!confirmed) return
    setBusy('restore')
    setNotice(null)
    try {
      await api.restoreBackup(backup.path)
      setBackup(null)
      setNotice('Backup restored. Reloading the interface to apply the restored settings…')
      window.setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('none')
    }
  }

  const maxJobs = Math.max(4, resources?.recommendedConcurrency ?? 4)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Saved to the local database as you change it.</p>
      </header>

      {notice ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Throughput</CardTitle>
          <CardDescription>
            {resources
              ? `${resources.cpuCores} cores · ${Math.round(resources.availableMemoryMb / 1024)} GB free · ${resources.recommendedConcurrency} jobs recommended`
              : 'Measuring…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow label="Parallel jobs" hint="heavy engines get half of these">
            <SliderField value={settings.concurrentJobs} min={1} max={maxJobs} onChange={(concurrentJobs) => void patch({ concurrentJobs })} />
          </SettingRow>
          <SettingRow label="Largest input accepted" hint="megabytes">
            <Input
              type="number"
              min={1}
              value={settings.maxInputMb}
              onChange={(event) => void patch({ maxInputMb: Math.max(1, Number(event.target.value) || 1) })}
              className="h-8 w-32"
            />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Output</CardTitle>
          <CardDescription>Where converted files land and what happens when a name is taken.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow label="Save results">
            <SelectField
              value={settings.outputDirectoryMode}
              options={[
                { value: 'source', label: 'Next to the original' },
                { value: 'subfolder', label: 'In a “Converted” folder beside it' },
                { value: 'custom', label: 'In one fixed folder' },
              ]}
              onChange={(outputDirectoryMode) => void patch({ outputDirectoryMode })}
            />
          </SettingRow>

          {settings.outputDirectoryMode === 'custom' ? (
            <SettingRow label="Fixed folder">
              <div className="flex items-center gap-2">
                <Input
                  value={settings.customOutputDirectory ?? ''}
                  onChange={(event) => void patch({ customOutputDirectory: event.target.value })}
                  placeholder="D:/Converted"
                  className="h-8 flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isTauriRuntime()}
                  onClick={async () => {
                    const picked = await pickDirectoryDialog()
                    if (picked) await patch({ customOutputDirectory: picked })
                  }}
                >
                  <FolderOpen className="size-3.5" />
                  Browse
                </Button>
              </div>
            </SettingRow>
          ) : null}

          <SettingRow label="If the target name is taken">
            <SelectField
              value={settings.collisionPolicy}
              options={[
                { value: 'rename', label: 'Add a number: name (1).ext' },
                { value: 'overwrite', label: 'Replace the existing output' },
                { value: 'skip', label: 'Leave it and skip the job' },
              ]}
              onChange={(collisionPolicy) => void patch({ collisionPolicy })}
            />
          </SettingRow>

          <div className="mt-2 flex gap-2.5 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            <p>
              “Replace the existing output” applies to previous conversion results only. The file you
              converted from is never written to — the planner refuses that in Rust, whatever is set
              here.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Appearance &amp; temporary files</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingRow label="Theme">
            <SelectField
              value={settings.theme}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'Follow Windows' },
              ]}
              onChange={(theme) => void patch({ theme })}
            />
          </SettingRow>
          <SettingRow label="Delete temporary files on exit">
            <SwitchField checked={settings.deleteTempOnExit} onChange={(deleteTempOnExit) => void patch({ deleteTempOnExit })} />
          </SettingRow>
          <SettingRow label="Working folder" hint="leftovers older than an hour are safe to delete">
            <Button
              size="sm"
              variant="outline"
              disabled={!isTauriRuntime() || busy === 'purging'}
              onClick={async () => {
                setBusy('purging')
                try {
                  const removed = await api.purgeTempFiles()
                  setNotice(`${removed} stale temporary item${removed === 1 ? '' : 's'} removed.`)
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : String(error))
                } finally {
                  setBusy('none')
                }
              }}
            >
              Purge now
            </Button>
          </SettingRow>
          {storage ? (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{storage}</code>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Open the storage folder"
                onClick={() => void revealItemInDir(storage).catch(() => undefined)}
              >
                <FolderOpen className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Windows integration</CardTitle>
          <CardDescription>
            Opt-in only. Both switches can be turned off again here; neither changes your default
            file associations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            label="Job notifications"
            hint="a Windows toast when a job finishes while the window is in the background"
          >
            <SwitchField
              checked={settings.nativeNotifications}
              disabled={!isTauriRuntime()}
              onChange={(enabled) => void toggleNotifications(enabled)}
            />
          </SettingRow>
          <SettingRow label="Explorer menu and Open With" hint="HKCU only, per Windows account">
            <SwitchField
              checked={shell?.enabled ?? false}
              disabled={!isTauriRuntime() || !shell?.supported || busy === 'shell'}
              onChange={(enabled) => void toggleShell(enabled)}
            />
          </SettingRow>
          <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            The context menu passes the selected file to Quick Convert. Open With adds the app to
            Explorer&apos;s “Open with” list; Windows still asks you to choose. The tray icon is
            always available to reopen the window or quit.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Engines</CardTitle>
            <CardDescription>Each one is replaceable — the app calls them by argv, never through a shell.</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!isTauriRuntime() || busy === 'scanning'}
            onClick={async () => {
              setBusy('scanning')
              await rescanEngines()
              setBusy('none')
            }}
          >
            <RefreshCw className={busy === 'scanning' ? 'size-3.5 animate-spin' : 'size-3.5'} />
            Re-scan
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {engines.map((engine) => (
              <li key={engine.id} className="flex items-start gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{engine.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {engine.available ? engine.version ?? 'ready' : engine.unavailableReason ?? 'not installed'}
                  </p>
                </div>
                <Badge variant={engine.available ? 'success' : 'warning'} className="shrink-0">
                  {engine.available ? 'ready' : 'missing'}
                </Badge>
              </li>
            ))}
          </ul>

          <details className="mt-3 rounded-lg border border-border/70">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
              Use a different copy of a tool (advanced)
            </summary>
            <div className="flex flex-col gap-2 border-t border-border/70 p-3">
              <p className="text-[11px] text-muted-foreground">
                Leave a field empty to use the bundled copy. A configured path wins over the
                bundle and PATH; if it is wrong, the engine reports “missing” instead of silently
                using another build.
              </p>
              {ENGINE_TOOLS.map((tool) => (
                <div key={tool.key} className="grid grid-cols-[7rem_1fr_auto_auto] items-center gap-1.5">
                  <label htmlFor={`engine-${tool.key}`} className="text-xs">
                    {tool.label}
                  </label>
                  <Input
                    id={`engine-${tool.key}`}
                    value={engineDraft[tool.key] ?? ''}
                    onChange={(event) =>
                      setEngineDraft((current) => ({ ...current, [tool.key]: event.target.value }))
                    }
                    placeholder={tool.hint}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Browse for ${tool.label}`}
                    onClick={async () => {
                      const picked = tool.directory
                        ? await pickDirectoryDialog()
                        : (await pickAnyFilesDialog(false))[0]
                      if (picked) {
                        setEngineDraft((current) => ({ ...current, [tool.key]: picked }))
                      }
                    }}
                  >
                    <FolderOpen className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Clear the ${tool.label} path`}
                    onClick={() =>
                      setEngineDraft((current) => {
                        const next = { ...current }
                        delete next[tool.key]
                        return next
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <div className="mt-1 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isTauriRuntime() || busy === 'scanning'}
                  onClick={() => {
                    const cleaned = Object.fromEntries(
                      Object.entries(engineDraft).filter(([, value]) => value.trim().length > 0),
                    )
                    void saveEnginePaths(cleaned)
                  }}
                >
                  {busy === 'scanning' ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Wrench className="size-3.5" />
                  )}
                  Save paths &amp; re-scan
                </Button>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Backup &amp; restore</CardTitle>
          <CardDescription>
            One validated JSON file for settings, presets, workflows, automation rules, favorites
            and history. User files are never included or modified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow label="Backup" hint="save a local copy of your configuration">
            <Button
              size="sm"
              variant="outline"
              disabled={!isTauriRuntime() || busy === 'backup' || busy === 'restore'}
              onClick={() => void exportBackup()}
            >
              <Download className="size-3.5" />
              Export backup
            </Button>
          </SettingRow>
          <SettingRow label="Restore" hint="validated before anything is replaced">
            <Button
              size="sm"
              variant="outline"
              disabled={!isTauriRuntime() || busy === 'backup' || busy === 'restore'}
              onClick={() => void chooseBackup()}
            >
              <FolderOpen className="size-3.5" />
              Choose backup…
            </Button>
          </SettingRow>

          {backup ? (
            <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-medium">Validated backup from {backup.preview.appVersion}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {backup.path}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {backup.preview.history} history · {backup.preview.presets} presets ·{' '}
                {backup.preview.workflows} workflows · {backup.preview.automationRules} rules ·{' '}
                {backup.preview.favorites} favorites
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy === 'restore'}
                  onClick={() => void applyBackup()}
                >
                  {busy === 'restore' ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Restore now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBackup(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Diagnostics &amp; support</CardTitle>
          <CardDescription>
            Everything stays on this PC. A diagnostic report is only created when you export one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow label="Version">
            <span className="font-mono text-xs">
              {info?.version ?? '…'}
              {info?.debugBuild ? ' (development build)' : ''}
            </span>
          </SettingRow>
          <SettingRow label="System">
            <span className="text-xs">
              {info ? `${info.osVersion} · ${info.architecture}` : '…'}
            </span>
          </SettingRow>
          <SettingRow label="Diagnostic logs" hint="rotated, max 5 × 10 MB">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {info && info.logFiles.length > 0
                  ? `${info.logFiles.length} file${info.logFiles.length === 1 ? '' : 's'} · ${formatBytes(
                      info.logFiles.reduce((total, file) => total + file.bytes, 0),
                    )}`
                  : 'no log files yet'}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!isTauriRuntime() || !info}
                onClick={() => {
                  if (info) void revealItemInDir(info.logsRoot).catch(() => undefined)
                }}
              >
                <ScrollText className="size-3.5" />
                Open logs
              </Button>
            </div>
          </SettingRow>
          <SettingRow label="Export a report" hint="report + log copies, never file contents">
            <Button
              size="sm"
              variant="outline"
              disabled={!isTauriRuntime() || busy === 'exporting'}
              onClick={async () => {
                const directory = await pickDirectoryDialog()
                if (!directory) return
                setBusy('exporting')
                setNotice(null)
                try {
                  const result = await api.exportDiagnostics(directory)
                  setNotice(
                    `Diagnostic report saved to ${result.reportFile}${
                      result.skippedLogs.length > 0
                        ? ` (${result.skippedLogs.length} log file(s) skipped)`
                        : ''
                    }`,
                  )
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : String(error))
                } finally {
                  setBusy('none')
                }
              }}
            >
              {busy === 'exporting' ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Export report
            </Button>
          </SettingRow>
          <SettingRow
            label="Copy system summary"
            hint="version, OS and engine states; no paths or file contents"
          >
            <Button
              size="sm"
              variant="outline"
              disabled={!isTauriRuntime()}
              onClick={async () => {
                const copied = await copyToClipboard(buildSupportSummary(info, engines))
                setNotice(
                  copied
                    ? 'System and engine summary copied to the clipboard.'
                    : 'Windows did not allow copying to the clipboard.',
                )
              }}
            >
              <Copy className="size-3.5" />
              Copy summary
            </Button>
          </SettingRow>
          <SettingRow label="Support page" hint="opens in your default browser">
            {SUPPORT_URL ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!isTauriRuntime()}
                onClick={() => {
                  if (!SUPPORT_URL) return
                  void openUrl(SUPPORT_URL).catch((error: unknown) =>
                    setNotice(error instanceof Error ? error.message : String(error)),
                  )
                }}
              >
                <ExternalLink className="size-3.5" />
                Open support page
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                No support page is configured in this build.
              </span>
            )}
          </SettingRow>
          <SettingRow label="Cache" hint="derived preview data only">
            <Button
              size="sm"
              variant="outline"
              disabled={!isTauriRuntime()}
              onClick={async () => {
                try {
                  const removed = await api.clearCache()
                  setNotice(`Cache cleared: ${removed} item${removed === 1 ? '' : 's'} removed.`)
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : String(error))
                }
              }}
            >
              <Trash2 className="size-3.5" />
              Clear cache
            </Button>
          </SettingRow>
          <SettingRow label="Conversion history" hint="presets and files are kept">
            <Button
              size="sm"
              variant="outline"
              disabled={!isTauriRuntime()}
              onClick={async () => {
                const confirmed = await confirm(
                  'Delete every conversion history row? This cannot be undone. Your files and presets are not touched.',
                  { title: 'Clear conversion history', kind: 'warning' },
                )
                if (!confirmed) return
                try {
                  const removed = await api.clearHistory()
                  setNotice(`History cleared: ${removed} row${removed === 1 ? '' : 's'} removed.`)
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : String(error))
                }
              }}
            >
              <FileText className="size-3.5" />
              Clear history
            </Button>
          </SettingRow>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={!isTauriRuntime() || busy === 'resetting'}
              onClick={async () => {
                const confirmed = await confirm(
                  'Reset every setting to its default? Presets, workflows, history and files are kept.',
                  { title: 'Reset settings', kind: 'warning' },
                )
                if (!confirmed) return
                setBusy('resetting')
                setNotice(null)
                try {
                  await resetSettings()
                  setNotice('Settings reset to their defaults.')
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : String(error))
                } finally {
                  setBusy('none')
                }
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset settings
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!isTauriRuntime()}
              onClick={() => void patch({ welcomeCompleted: false })}
            >
              Show the welcome screen again
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Updates are installed manually — this build has no update server configured.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
