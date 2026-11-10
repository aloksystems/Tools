import { SelectField, SettingRow, SliderField, SwitchField } from '@/components/conversion-settings/controls'
import { EngineNotice } from '@/components/conversion-settings/EngineNotice'
import { Input } from '@/components/ui/input'
import {
  asAudioSettings,
  bitratesFor,
  isLosslessFormat,
  sampleRatesFor,
} from '@/features/audio/settings'
import { useCodecOptions, useMediaCapabilities } from '@/features/media/capabilities'
import { TrimFields } from '@/features/media/TrimFields'
import { useMediaInfo } from '@/features/media/useMediaInfo'
import type { SettingsPanelProps } from '@/features/types'
import { useEffect } from 'react'

function bitrateChoices(current: number, allowed: number[]) {
  const values = [0, ...allowed]
  if (!values.includes(current)) values.push(current)
  return values.sort((a, b) => a - b).map((bitrate) => ({
    value: String(bitrate),
    label: bitrate === 0 ? 'Automatic (format default)' : `${bitrate} kbps`,
  }))
}

export function AudioSettingsPanel({
  settings,
  outputFormat,
  files,
  onChange,
}: SettingsPanelProps) {
  const value = asAudioSettings(settings)
  const { capabilities, error } = useMediaCapabilities()
  const codecs = useCodecOptions(capabilities, outputFormat)
  const media = useMediaInfo(files[0]?.path)
  const lossless = isLosslessFormat(outputFormat)
  const allowedRates = sampleRatesFor(outputFormat, value.codec)
  const allowedBitrates = bitratesFor(outputFormat)

  // A codec picked for OGG must not travel to MP3, where it would be rejected.
  useEffect(() => {
    if (codecs.length === 0) return
    if (codecs.some((codec) => codec.id === value.codec)) return
    onChange({ codec: 'auto' })
  }, [codecs, value.codec, onChange])

  // Opus and MP3 reject high sample rates; fall back to the source rate.
  useEffect(() => {
    if (allowedRates.includes(value.sampleRateHz)) return
    onChange({ sampleRateHz: 0 })
  }, [allowedRates, value.sampleRateHz, onChange])

  return (
    <div className="flex flex-col">
      <EngineNotice engine="media" />
      {error ? <p className="mb-2 text-xs text-destructive">{error}</p> : null}

      {codecs.length > 0 ? (
        <SettingRow label="Codec">
          <SelectField
            value={value.codec}
            options={codecs.map((codec) => ({
              value: codec.id,
              label: codec.label,
              disabled: !codec.available,
            }))}
            onChange={(codec) => onChange({ codec })}
          />
        </SettingRow>
      ) : null}

      {lossless ? (
        <SettingRow label="Bitrate" hint="lossless — bitrate does not apply">
          <p className="text-xs text-muted-foreground">
            Every sample is kept; the file is as large as the source needs.
          </p>
        </SettingRow>
      ) : (
        <SettingRow label="Bitrate">
          <SelectField
            value={String(value.bitrateKbps)}
            options={bitrateChoices(value.bitrateKbps, allowedBitrates)}
            onChange={(bitrate) => onChange({ bitrateKbps: Number(bitrate) })}
          />
        </SettingRow>
      )}

      <SettingRow label="Sample rate">
        <SelectField
          value={String(value.sampleRateHz)}
          options={allowedRates.map((rate) => ({
            value: String(rate),
            label: rate === 0 ? 'Same as source' : `${(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 1)} kHz`,
          }))}
          onChange={(sampleRateHz) => onChange({ sampleRateHz: Number(sampleRateHz) })}
        />
      </SettingRow>

      <SettingRow label="Channels">
        <SelectField
          value={String(value.channels)}
          options={[
            { value: '0', label: 'Same as source' },
            { value: '1', label: 'Mono' },
            { value: '2', label: 'Stereo' },
          ]}
          onChange={(channels) => onChange({ channels: Number(channels) })}
        />
      </SettingRow>

      <SettingRow label="Volume" hint={`${value.volumePercent}%`}>
        <SliderField
          value={value.volumePercent}
          min={0}
          max={200}
          step={5}
          suffix="%"
          onChange={(volumePercent) => onChange({ volumePercent })}
        />
      </SettingRow>

      <SettingRow label="Loudness normalise" hint="EBU R128, one pass">
        <SwitchField checked={value.normalize} onChange={(normalize) => onChange({ normalize })} />
      </SettingRow>

      <SettingRow label="Keep metadata">
        <SwitchField
          checked={value.preserveMetadata}
          onChange={(preserveMetadata) => onChange({ preserveMetadata })}
        />
      </SettingRow>

      <TrimFields
        settings={settings}
        onChange={onChange}
        maxMs={media.info?.durationMs ?? null}
      />

      <SettingRow label="File name" hint="single file only">
        <Input
          value={value.outputName}
          placeholder="keep the source name"
          onChange={(event) => onChange({ outputName: event.target.value })}
        />
      </SettingRow>

      {lossless ? null : (
        <p className="py-2 text-xs text-muted-foreground">
          Re-encoding a lossy file to another lossy format loses quality again. Start from the best
          source you have.
        </p>
      )}
    </div>
  )
}
