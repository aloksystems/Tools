import { SettingRow, SelectField } from '@/components/conversion-settings/controls'
import { Input } from '@/components/ui/input'
import { asOcrSettings, OCR_PSM_OPTIONS } from '@/features/ocr/settings'
import { cn } from '@/lib/utils'
import type { ConversionSettings, FileProbe, FormatId } from '@/types/converter'

/**
 * Tesseract's own knobs. The language list is what the bundled engine reports,
 * so the panel can never offer a pack that is not installed.
 */
export function OcrSettingsPanel({
  settings,
  outputFormat,
  files,
  languages,
  onChange,
}: {
  settings: ConversionSettings
  outputFormat: FormatId | null
  files: FileProbe[]
  languages: string[]
  onChange: (patch: ConversionSettings) => void
}) {
  const value = asOcrSettings(settings)
  const hasPdf = files.some((file) => file.format === 'pdf')
  const missing = value.languages.filter(
    (code) => languages.length > 0 && !languages.includes(code),
  )

  const toggleLanguage = (code: string) => {
    const selected = value.languages.includes(code)
    const next = selected
      ? value.languages.filter((entry) => entry !== code)
      : [...value.languages, code]
    if (next.length > 0) onChange({ languages: next })
  }

  return (
    <div className="flex flex-col">
      <SettingRow
        label="Languages"
        hint={languages.length === 0 ? 'reading installed packs…' : `${languages.length} installed`}
      >
        {languages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Install language data in the Tesseract tessdata folder, then rescan engines.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {languages.map((code) => {
              const selected = value.languages.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleLanguage(code)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {code}
                </button>
              )
            })}
          </div>
        )}
        {missing.length > 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {missing.join(', ')} {missing.length === 1 ? 'is' : 'are'} selected but not installed.
            Choose an available pack, or add the traineddata file.
          </p>
        ) : null}
      </SettingRow>

      <SettingRow label="Segmentation" hint={outputFormat === 'pdf' ? 'invisible text layer' : 'plain text'}>
        <SelectField
          value={String(value.psm)}
          options={OCR_PSM_OPTIONS.map((option) => ({ ...option }))}
          onChange={(psm) => onChange({ psm: Number(psm) })}
        />
      </SettingRow>

      <SettingRow label="PDF resolution" hint="72–600 dpi · images keep their own pixels">
        <Input
          type="number"
          min={72}
          max={600}
          value={value.dpi}
          onChange={(event) => {
            const dpi = Math.round(Number(event.target.value))
            if (Number.isFinite(dpi)) onChange({ dpi: Math.min(600, Math.max(72, dpi)) })
          }}
        />
      </SettingRow>

      {hasPdf ? (
        <>
          <SettingRow label="Pages" hint="PDF only — empty means every page">
            <Input
              value={value.pageRanges}
              placeholder="e.g. 1-3,7"
              onChange={(event) => onChange({ pageRanges: event.target.value })}
            />
          </SettingRow>
          <SettingRow label="Unlock password" hint="kept in memory for this batch only">
            <Input
              type="password"
              autoComplete="off"
              value={value.password}
              placeholder="Only for encrypted PDFs"
              onChange={(event) => onChange({ password: event.target.value })}
            />
          </SettingRow>
        </>
      ) : null}
    </div>
  )
}
