import { SelectField, SettingRow, SwitchField } from '@/components/conversion-settings/controls'
import { EngineNotice } from '@/components/conversion-settings/EngineNotice'
import { Input } from '@/components/ui/input'
import {
  asArchiveSettings,
  COMPRESSION_OPTIONS,
  methodOptions,
  supportsPassword,
} from '@/features/archives/settings'
import type { SettingsPanelProps } from '@/features/types'

export interface ArchiveSettingsPanelProps extends SettingsPanelProps {
  /** Kept beside the settings, never inside them: no password reaches a preset. */
  password: string
  onPasswordChange: (password: string) => void
}

export function ArchiveSettingsPanel({
  settings,
  outputFormat,
  password,
  onPasswordChange,
  onChange,
}: ArchiveSettingsPanelProps) {
  const value = asArchiveSettings(settings)
  const method = methodOptions(outputFormat)
  const tar = outputFormat === 'tar' || outputFormat === 'tarGz' || outputFormat === 'tarBz2' || outputFormat === 'tarXz'
  const sevenZ = outputFormat === 'sevenZ'

  return (
    <div className="flex flex-col">
      <EngineNotice engine="archive" />

      <SettingRow label="Compression">
        <SelectField
          value={value.compression}
          options={COMPRESSION_OPTIONS.map((option) => ({ ...option }))}
          onChange={(compression) => onChange({ compression })}
        />
      </SettingRow>

      {outputFormat && !tar ? (
        <SettingRow label="Method" hint="container-specific codec">
          <SelectField
            value={method.some((option) => option.value === value.method) ? value.method : 'auto'}
            options={method}
            onChange={(next) => onChange({ method: next })}
          />
        </SettingRow>
      ) : null}

      <SettingRow label="Preserve folder structure">
        <SwitchField
          checked={value.preservePaths}
          onChange={(preservePaths) => onChange({ preservePaths })}
        />
      </SettingRow>

      {sevenZ ? (
        <SettingRow label="Solid archive" hint="better ratio, slower random extraction">
          <SwitchField checked={value.solid} onChange={(solid) => onChange({ solid })} />
        </SettingRow>
      ) : null}

      {!tar ? (
        <>
          <SettingRow
            label="Password"
            hint={outputFormat === 'zip' ? 'AES-256, file names stay visible' : 'AES-256'}
          >
            <Input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Leave empty for no encryption"
              className="h-8"
            />
          </SettingRow>

          {sevenZ && password ? (
            <SettingRow label="Encrypt file names" hint="header encryption">
              <SwitchField
                checked={value.encryptHeaders}
                onChange={(encryptHeaders) => onChange({ encryptHeaders })}
              />
            </SettingRow>
          ) : null}
        </>
      ) : null}

      <p className="py-2 text-xs text-muted-foreground">
        {!supportsPassword(outputFormat) && outputFormat
          ? 'TAR, TAR.GZ, TAR.BZ2 and TAR.XZ cannot be password-protected. Choose ZIP or 7Z if you need encryption. The compression level still applies to the GZ/BZ2/XZ wrapper.'
          : 'A password is used for this batch only — it is never written to the database, presets or logs.'}
      </p>
    </div>
  )
}
