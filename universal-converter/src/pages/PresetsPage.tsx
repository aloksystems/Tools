import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SettingsJsonField, FormatSelect, formatError, parseSettingsJson, settingsText } from '@/features/tools/shared'
import { pickAnyFilesDialog, pickSavePath } from '@/hooks/useFilesDrop'
import { FORMAT_LABELS } from '@/utils/format'
import { api } from '@/utils/api'
import {
  Copy,
  Download,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EngineId, FormatId, Preset } from '@/types/converter'
import type { PresetImportReport } from '@/types/automation'

const ENGINES: { id: EngineId; label: string }[] = [
  { id: 'image', label: 'Image (built-in Rust)' },
  { id: 'imagemagick', label: 'ImageMagick' },
  { id: 'pdf', label: 'PDF core' },
  { id: 'media', label: 'FFmpeg (audio and video)' },
  { id: 'document', label: 'LibreOffice (documents)' },
  { id: 'archive', label: '7-Zip (archives)' },
  { id: 'ocr', label: 'Tesseract OCR' },
]

function engineLabel(id: EngineId): string {
  return ENGINES.find((engine) => engine.id === id)?.label ?? id
}

interface Draft {
  id: string
  name: string
  engine: EngineId | ''
  outputFormat: FormatId | ''
  settings: string
}

function emptyDraft(): Draft {
  return { id: '', name: '', engine: '', outputFormat: '', settings: '{}' }
}

function draftFrom(preset: Preset): Draft {
  return {
    id: preset.id,
    name: preset.name,
    engine: preset.engine,
    outputFormat: preset.outputFormat,
    settings: settingsText(preset.settings),
  }
}

export function PresetsPage() {
  const [presets, setPresets] = useState<Preset[]>([])
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [report, setReport] = useState<PresetImportReport | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setPresets(await api.listPresets())
    } catch (reason) {
      setError(formatError(reason))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return presets
    return presets.filter((preset) =>
      [
        preset.name,
        engineLabel(preset.engine),
        FORMAT_LABELS[preset.outputFormat],
        JSON.stringify(preset.settings),
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [presets, query])

  const save = async () => {
    if (!draft) return
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (draft.name.trim() === '') throw new Error('a preset needs a name')
      if (!draft.engine) throw new Error('choose the engine this preset belongs to')
      if (!draft.outputFormat) throw new Error('choose the output format this preset targets')
      const saved = await api.savePreset({
        id: draft.id,
        name: draft.name.trim(),
        engine: draft.engine,
        outputFormat: draft.outputFormat,
        settings: parseSettingsJson(draft.settings),
      })
      setDraft(null)
      setNotice(`Saved “${saved.name}”.`)
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async (preset: Preset) => {
    setError(null)
    try {
      const copy = await api.duplicatePreset(preset.id)
      setNotice(`Duplicated as “${copy.name}”.`)
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  const remove = async (preset: Preset) => {
    if (!window.confirm(`Delete the preset “${preset.name}”?`)) return
    try {
      await api.deletePreset(preset.id)
      if (draft?.id === preset.id) setDraft(null)
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  const exportAll = async () => {
    setError(null)
    setReport(null)
    try {
      const text = await api.exportPresets()
      const path = await pickSavePath('universal-converter-presets.json', 'json')
      if (!path) return
      await api.exportText(path, text)
      setNotice(`Exported ${presets.length} preset${presets.length === 1 ? '' : 's'}.`)
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  const importFile = async () => {
    setError(null)
    setNotice(null)
    setReport(null)
    try {
      const picked = await pickAnyFilesDialog(false)
      if (picked.length === 0) return
      const result = await api.importPresetsFile(picked[0]!)
      setReport(result)
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  const installStarters = async () => {
    setError(null)
    setNotice(null)
    try {
      const installed = await api.installDefaultPresets()
      setNotice(
        installed === 0
          ? 'Every starter preset is already installed.'
          : `Installed ${installed} starter preset${installed === 1 ? '' : 's'}.`,
      )
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Sparkles className="size-5" />
            Presets
          </h1>
          <p className="text-sm text-muted-foreground">
            Reusable engine settings. A preset appears on the conversion pages that use the same
            engine and output format. Passwords are never stored in a preset.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void installStarters()}>
            <Sparkles className="size-3.5" />
            Install starters
          </Button>
          <Button variant="outline" size="sm" onClick={() => void importFile()}>
            <Upload className="size-3.5" />
            Import…
          </Button>
          <Button variant="outline" size="sm" disabled={presets.length === 0} onClick={() => void exportAll()}>
            <Download className="size-3.5" />
            Export…
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
              New preset
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
      {report ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card p-3 text-xs">
          <p className="font-medium">
            Imported {report.imported} preset{report.imported === 1 ? '' : 's'}.
          </p>
          {report.renamed.length > 0 ? (
            <p className="text-muted-foreground">Renamed: {report.renamed.join('; ')}</p>
          ) : null}
          {report.scrubbed.length > 0 ? (
            <p className="text-muted-foreground">
              Secret-looking settings removed: {report.scrubbed.join('; ')}
            </p>
          ) : null}
          {report.skipped.length > 0 ? (
            <p className="text-destructive">Skipped: {report.skipped.join('; ')}</p>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{draft.id ? 'Edit preset' : 'New preset'}</p>
              <Button variant="ghost" size="icon-sm" aria-label="Close editor" onClick={() => setDraft(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Name</span>
                <Input
                  value={draft.name}
                  placeholder="Web images at 1600 px"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Engine</span>
                <select
                  value={draft.engine}
                  onChange={(event) =>
                    setDraft({ ...draft, engine: event.target.value as EngineId })
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="" disabled>
                    Choose the engine
                  </option>
                  {ENGINES.map((engine) => (
                    <option key={engine.id} value={engine.id}>
                      {engine.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Output format</span>
              <FormatSelect
                value={draft.outputFormat}
                onChange={(outputFormat) => setDraft({ ...draft, outputFormat })}
              />
            </label>
            <SettingsJsonField
              value={draft.settings}
              rows={6}
              onChange={(settings) => setDraft({ ...draft, settings })}
              hint="Only settings this engine understands matter; leave {} for defaults."
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void save()}>
                Save preset
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <label className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, engine, format or setting…"
          className="h-9 pl-8"
        />
      </label>

      {presets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No presets yet</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Install the four starter presets, or save the current settings from any conversion
              page. Import and export use a plain JSON file.
            </p>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
          No preset matches “{query}”.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((preset) => (
            <li key={preset.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{preset.name}</p>
                      <Badge variant="outline">{engineLabel(preset.engine)}</Badge>
                      <Badge variant="muted">→ {FORMAT_LABELS[preset.outputFormat]}</Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={JSON.stringify(preset.settings)}>
                      {JSON.stringify(preset.settings)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Duplicate ${preset.name}`}
                    onClick={() => void duplicate(preset)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${preset.name}`}
                    onClick={() => setDraft(draftFrom(preset))}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${preset.name}`}
                    onClick={() => void remove(preset)}
                  >
                    <Trash className="size-3.5" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        Imported files are validated against the preset schema. Future schema versions are refused,
        secrets are scrubbed, and name collisions are renamed instead of overwriting anything.
      </p>
    </div>
  )
}
