import { SelectField, SettingRow, SliderField, SwitchField } from '@/components/conversion-settings/controls'
import { EngineNotice } from '@/components/conversion-settings/EngineNotice'
import { Input } from '@/components/ui/input'
import { asDocumentSettings } from '@/features/documents/settings'
import type { SettingsPanelProps } from '@/features/types'
import { api } from '@/utils/api'
import { fileName, fileStem } from '@/utils/format'
import { isTauriRuntime } from '@/utils/tauri'
import { Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormatId } from '@/types/converter'

const SPREADSHEET_FORMATS: FormatId[] = ['xlsx', 'xls', 'ods']

export function DocumentSettingsPanel({ settings, outputFormat, files, onChange }: SettingsPanelProps) {
  const value = asDocumentSettings(settings)
  const outputNames = value.outputNames ?? {}
  const spreadsheet = files.find((file) => SPREADSHEET_FORMATS.includes(file.format))
  const [sheets, setSheets] = useState<string[]>([])
  const [loadingSheets, setLoadingSheets] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)

  const wantsSheet = outputFormat === 'csv' && spreadsheet !== undefined

  useEffect(() => {
    if (!wantsSheet || !spreadsheet || !isTauriRuntime()) {
      setSheets([])
      return
    }
    let cancelled = false
    setLoadingSheets(true)
    setSheetError(null)
    void api
      .documentSheets(spreadsheet.path)
      .then((names) => {
        if (!cancelled) setSheets(names)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setSheetError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSheets(false)
      })
    return () => {
      cancelled = true
    }
  }, [wantsSheet, spreadsheet?.path])

  return (
    <div className="flex flex-col">
      <EngineNotice engine="document" />

      {outputFormat === 'pdf' ? (
        <>
          <SettingRow label="Page range" hint="empty means every page">
            <Input
              value={value.pageRange}
              onChange={(event) => onChange({ pageRange: event.target.value })}
              placeholder="e.g. 1-3,7"
              className="h-8"
            />
          </SettingRow>

          <SettingRow
            label="Image quality"
            hint={value.lossless ? 'lossless images' : `${value.imageQuality}% JPEG`}
          >
            <SliderField
              value={value.imageQuality}
              min={1}
              max={100}
              suffix="%"
              onChange={(imageQuality) => onChange({ imageQuality })}
            />
          </SettingRow>

          <SettingRow label="Lossless images" hint="larger PDF, no JPEG artefacts">
            <SwitchField
              checked={value.lossless}
              onChange={(lossless) => onChange({ lossless })}
            />
          </SettingRow>

          <SettingRow label="Export comments and notes">
            <SwitchField
              checked={value.exportNotes}
              onChange={(exportNotes) => onChange({ exportNotes })}
            />
          </SettingRow>
        </>
      ) : null}

      {wantsSheet ? (
        <SettingRow
          label="Sheet"
          hint={spreadsheet ? fileName(spreadsheet.path) : 'first workbook'}
        >
          {loadingSheets ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Reading sheet names…
            </p>
          ) : sheetError ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {sheetError}
            </p>
          ) : sheets.length > 0 ? (
            <SelectField
              value={String(Math.min(Math.max(value.sheet, 1), sheets.length))}
              options={sheets.map((name, index) => ({
                value: String(index + 1),
                label: `${index + 1}. ${name}`,
              }))}
              onChange={(sheet) => onChange({ sheet: Number(sheet) })}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              CSV writes sheet {value.sheet}. Other output formats keep every sheet.
            </p>
          )}
        </SettingRow>
      ) : null}

      {outputFormat && outputFormat !== 'pdf' && outputFormat !== 'csv' ? (
        <p className="py-2 text-xs text-muted-foreground">
          {outputFormat === 'txt' || outputFormat === 'html'
            ? 'Text exports flatten the document; complex layout, embedded objects and images may not survive.'
            : 'LibreOffice preserves the document structure it can represent in the target format; unsupported formatting is reported by the engine rather than silently dropped.'}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Output names</p>
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
            {files.map((file) => (
              <div key={file.path} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={file.path}>
                  {fileName(file.path)}
                </span>
                <Input
                  value={outputNames[file.path] ?? ''}
                  onChange={(event) =>
                    onChange({
                      outputNames: { ...outputNames, [file.path]: event.target.value },
                    })
                  }
                  placeholder={fileStem(file.path)}
                  className="h-8 flex-1"
                  aria-label={`Output name for ${fileName(file.path)}`}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Leave a field empty to keep the original file name. Names apply to this batch only.
          </p>
        </div>
      ) : null}

      <p className="py-2 text-xs text-muted-foreground">
        A document conversion runs a separate, throw-away LibreOffice profile, so it cannot touch
        your own Office settings or add-ins.
      </p>
    </div>
  )
}
