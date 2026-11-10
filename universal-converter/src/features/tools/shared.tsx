import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { pickDirectoryDialog } from '@/hooks/useFilesDrop'
import { isTauriRuntime } from '@/utils/tauri'
import { FORMAT_LABELS } from '@/utils/format'
import { FolderOpen } from 'lucide-react'
import type { ConversionSettings, FormatId } from '@/types/converter'

/** Every output a studio may offer, grouped the way the sidebar groups inputs. */
export const FORMAT_GROUPS: { label: string; formats: FormatId[] }[] = [
  {
    label: 'Images',
    formats: ['jpeg', 'png', 'webp', 'avif', 'bmp', 'tiff', 'gif', 'ico', 'svg', 'heic'],
  },
  { label: 'PDF', formats: ['pdf'] },
  {
    label: 'Documents',
    formats: ['docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'xlsx', 'xls', 'ods', 'csv', 'pptx', 'ppt', 'odp'],
  },
  { label: 'Audio', formats: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'wma', 'aiff', 'alac', 'ogg', 'opus'] },
  { label: 'Video', formats: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'flv', 'mpeg', 'threeGp'] },
  {
    label: 'Archives',
    formats: ['zip', 'sevenZ', 'tar', 'gz', 'bz2', 'xz', 'tarGz', 'tarBz2', 'tarXz', 'wim', 'cab'],
  },
]

export const ALL_FORMATS: FormatId[] = FORMAT_GROUPS.flatMap((group) => group.formats)

export function FormatSelect({
  value,
  onChange,
  formats = ALL_FORMATS,
  placeholder = 'Choose a format',
  className,
}: {
  value: FormatId | ''
  onChange: (format: FormatId) => void
  formats?: FormatId[]
  placeholder?: string
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as FormatId)}
      className={
        className ??
        'h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
      }
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {FORMAT_GROUPS.map((group) => {
        const visible = group.formats.filter((format) => formats.includes(format))
        if (visible.length === 0) return null
        return (
          <optgroup key={group.label} label={group.label}>
            {visible.map((format) => (
              <option key={format} value={format}>
                {FORMAT_LABELS[format]}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}

/** Settings are JSON on purpose: every engine reads its own shape, and this keeps
 *  one editor honest instead of dozens of half-mirrored controls. */
export function settingsText(settings: ConversionSettings | null | undefined): string {
  if (!settings || Object.keys(settings).length === 0) return '{}'
  return JSON.stringify(settings, null, 2)
}

export function parseSettingsJson(text: string): ConversionSettings {
  const trimmed = text.trim()
  if (trimmed === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw new Error(
      `settings are not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('settings must be a JSON object, for example {"quality": 82}')
  }
  return parsed as ConversionSettings
}

export function SettingsJsonField({
  value,
  onChange,
  label = 'Engine settings (JSON, optional)',
  hint = 'Leave {} to use the engine defaults.',
  rows = 4,
}: {
  value: string
  onChange: (text: string) => void
  label?: string
  hint?: string
  rows?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-2 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </label>
  )
}

export function FolderField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (path: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-8 font-mono text-xs"
          title={value}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!isTauriRuntime()}
          onClick={async () => {
            const picked = await pickDirectoryDialog()
            if (picked) onChange(picked)
          }}
        >
          <FolderOpen className="size-3.5" />
          Browse…
        </Button>
      </div>
    </div>
  )
}

export function formatError(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'string') return reason
  return JSON.stringify(reason)
}

export function when(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}
