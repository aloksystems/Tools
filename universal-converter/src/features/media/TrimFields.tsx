import { SettingRow } from '@/components/conversion-settings/controls'
import { Input } from '@/components/ui/input'
import type { ConversionSettings } from '@/types/converter'
import { formatDuration } from '@/utils/format'

function toSeconds(value: number | null): string {
  return value === null ? '' : String(Math.round(value / 100) / 10)
}

function parseSeconds(text: string): number | null {
  if (text.trim() === '') return null
  const seconds = Number(text)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return Math.round(seconds * 1000)
}

/**
 * One trim window for a whole batch: the same start and duration are applied to
 * every staged file, which is what "clip the intro off these episodes" means.
 */
export function TrimFields({
  settings,
  onChange,
  maxMs,
}: {
  settings: ConversionSettings
  onChange: (patch: ConversionSettings) => void
  maxMs?: number | null
}) {
  const startMs = typeof settings.startMs === 'number' ? settings.startMs : null
  const durationMs = typeof settings.durationMs === 'number' ? settings.durationMs : null
  const pastEnd =
    maxMs && startMs !== null && durationMs !== null && startMs + durationMs > maxMs + 1_000

  return (
    <SettingRow label="Trim" hint={maxMs ? `source is ${formatDuration(maxMs)}` : 'seconds'}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">from</span>
          <Input
            type="number"
            min={0}
            step={0.1}
            placeholder="0"
            value={toSeconds(startMs)}
            onChange={(event) => onChange({ startMs: parseSeconds(event.target.value) })}
          />
        </div>
        <div className="flex flex-1 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">for</span>
          <Input
            type="number"
            min={0}
            step={0.1}
            placeholder="to end"
            value={toSeconds(durationMs)}
            onChange={(event) => onChange({ durationMs: parseSeconds(event.target.value) })}
          />
        </div>
      </div>
      {pastEnd ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          That window runs past the end of the file; the job will be refused.
        </p>
      ) : null}
    </SettingRow>
  )
}
