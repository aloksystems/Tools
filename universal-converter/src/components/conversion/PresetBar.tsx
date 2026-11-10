import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/utils/api'
import { formatLabel } from '@/utils/format'
import { Plus, RotateCcw, Trash } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ConversionSettings, EngineId, FormatId, Preset } from '@/types/converter'

/**
 * Named option sets, stored in the local SQLite `presets` table. A preset is
 * bound to one engine + output format pair, because that is what its settings
 * mean to.
 */
export function PresetBar({
  engine,
  outputFormat,
  settings,
  onApply,
  omitKeys = [],
}: {
  engine: EngineId
  outputFormat: FormatId | null
  settings: ConversionSettings
  onApply: (settings: ConversionSettings) => void
  /** Settings keys held only for this batch — passwords must not reach SQLite. */
  omitKeys?: string[]
}) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPresets(await api.listPresets())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [])

  useEffect(() => {
    if (outputFormat) void refresh()
  }, [outputFormat, refresh])

  const matching = presets.filter(
    (preset) => preset.engine === engine && preset.outputFormat === outputFormat,
  )
  const active = matching.find((preset) => preset.id === selected) ?? null

  if (!outputFormat) return null

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">Presets</p>
        <Select
          value={selected ?? ''}
          onValueChange={(id) => {
            setSelected(id)
            const preset = matching.find((entry) => entry.id === id)
            if (preset) onApply(preset.settings)
          }}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder={matching.length === 0 ? 'No presets for this output yet' : 'Choose a preset'} />
          </SelectTrigger>
          <SelectContent>
            {matching.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={!active}
          onClick={() => active && onApply(active.settings)}
        >
          <RotateCcw className="size-3.5" />
          Re-apply
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!active}
          aria-label={`Delete preset ${active?.name ?? ''}`}
          onClick={async () => {
            if (!active) return
            await api.deletePreset(active.id)
            setSelected(null)
            await refresh()
          }}
        >
          <Trash className="size-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`Name this ${formatLabel(outputFormat)} preset`}
          className="h-8 flex-1"
        />
        <Button
          size="sm"
          disabled={name.trim().length === 0}
          onClick={async () => {
            setError(null)
            try {
              await api.savePreset({
                id: crypto.randomUUID(),
                name: name.trim(),
                engine,
                outputFormat,
                settings: Object.fromEntries(
                  Object.entries(settings).filter(([key]) => !omitKeys.includes(key)),
                ),
              })
              setName('')
              await refresh()
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : String(reason))
            }
          }}
        >
          <Plus className="size-3.5" />
          Save current
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
