import { SelectField, SettingRow, SliderField, SwitchField } from '@/components/conversion-settings/controls'
import { EngineNotice } from '@/components/conversion-settings/EngineNotice'
import { Input } from '@/components/ui/input'
import {
  FRAME_RATES,
  GIF_HEIGHTS,
  VIDEO_AUDIO_BITRATES,
  VIDEO_BITRATES,
  VIDEO_HEIGHTS,
  asVideoSettings,
} from '@/features/video/settings'
import {
  audioCodecOptions,
  testedHardware,
  useCodecOptions,
  useMediaCapabilities,
} from '@/features/media/capabilities'
import { TrimFields } from '@/features/media/TrimFields'
import { useMediaInfo } from '@/features/media/useMediaInfo'
import type { SettingsPanelProps } from '@/features/types'
import type { MediaStream } from '@/types/converter'
import { useEffect, useMemo } from 'react'

function trackLabel(stream: MediaStream): string {
  const channels =
    stream.channels === 1 ? 'mono' : stream.channels === 2 ? 'stereo' : stream.channels ? `${stream.channels} ch` : ''
  const parts = [
    `#${stream.index}`,
    stream.language,
    stream.title,
    stream.codec.toUpperCase(),
    channels,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function VideoSettingsPanel({ settings, outputFormat, files, onChange }: SettingsPanelProps) {
  const value = asVideoSettings(settings)
  const { capabilities, error } = useMediaCapabilities()
  const codecs = useCodecOptions(capabilities, outputFormat)
  const audioCodecs = useMemo(
    () => (outputFormat ? audioCodecOptions(capabilities, outputFormat) : []),
    [capabilities, outputFormat],
  )
  const media = useMediaInfo(files[0]?.path)

  // A codec chosen for MP4 must not travel to WebM, where it cannot be written.
  useEffect(() => {
    if (codecs.length === 0 || value.videoCodec === 'auto') return
    if (codecs.some((codec) => codec.id === value.videoCodec && codec.available)) return
    onChange({ videoCodec: 'auto' })
  }, [codecs, value.videoCodec, onChange])

  // The same rule for the audio track's codec when the container changes.
  useEffect(() => {
    if (audioCodecs.length === 0 || value.audioCodec === 'auto') return
    if (audioCodecs.some((codec) => codec.id === value.audioCodec && codec.available)) return
    onChange({ audioCodec: 'auto' })
  }, [audioCodecs, value.audioCodec, onChange])

  const audioStreams = media.info?.streams.filter((stream) => stream.kind === 'audio') ?? []

  // A stream index belongs to one file. Applying it to a batch would select the
  // wrong track — or no track — in half the jobs, so only a single file may use it.
  useEffect(() => {
    const index = value.audioStreamIndex
    if (index === null) return
    if (files.length !== 1) {
      onChange({ audioStreamIndex: null })
      return
    }
    if (!media.info) return
    if (media.info.streams.some((stream) => stream.kind === 'audio' && stream.index === index)) return
    onChange({ audioStreamIndex: null })
  }, [files.length, media.info, value.audioStreamIndex, onChange])

  const codecFamily = value.videoCodec === 'h265' ? 'hevc' : 'h264'
  const usesHardware = value.videoCodec === 'auto' || value.videoCodec === 'h264' || value.videoCodec === 'h265'
  const hardware = usesHardware ? testedHardware(capabilities, codecFamily) : []
  const hardwareAvailable = hardware.length > 0

  // Capabilities arrive after the first render; only then can we tell whether
  // the saved GPU preference is real on this machine.
  useEffect(() => {
    if (!capabilities || !value.hardwareAcceleration) return
    if (!usesHardware || !hardwareAvailable) onChange({ hardwareAcceleration: false })
  }, [capabilities, value.hardwareAcceleration, usesHardware, hardwareAvailable, onChange])

  return (
    <div className="flex flex-col">
      <EngineNotice engine="media" />
      {error ? <p className="mb-2 text-xs text-destructive">{error}</p> : null}

      {codecs.length > 0 ? (
        <SettingRow label="Video codec">
          <SelectField
            value={value.videoCodec}
            options={[
              { value: 'auto', label: 'Automatic (best available)' },
              ...codecs.map((codec) => ({
                value: codec.id,
                label: codec.label,
                disabled: !codec.available,
              })),
            ]}
            onChange={(videoCodec) => onChange({ videoCodec })}
          />
        </SettingRow>
      ) : null}

      <SettingRow label="Quality preset">
        <SelectField
          value={value.qualityPreset}
          options={[
            { value: 'fast', label: 'Fast (quick encode, larger file)' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'compression', label: 'High compression (smallest file)' },
            { value: 'high', label: 'High quality (larger file)' },
            { value: 'custom', label: 'Custom CRF' },
          ]}
          onChange={(qualityPreset) => onChange({ qualityPreset })}
        />
      </SettingRow>

      {value.qualityPreset === 'custom' ? (
        <SettingRow label="CRF" hint="0 lossless · 51 terrible">
          <SliderField
            value={value.crf}
            min={0}
            max={51}
            onChange={(crf) => onChange({ crf })}
          />
        </SettingRow>
      ) : null}

      <SettingRow
        label="Video bitrate"
        hint={value.videoBitrateKbps > 0 ? 'overrides CRF' : 'preset picks the quality'}
      >
        <SelectField
          value={String(value.videoBitrateKbps)}
          options={VIDEO_BITRATES.map((bitrate) => ({
            value: String(bitrate),
            label: bitrate === 0 ? 'Automatic' : `${bitrate.toLocaleString()} kbps`,
          }))}
          onChange={(bitrate) => onChange({ videoBitrateKbps: Number(bitrate) })}
        />
      </SettingRow>

      <SettingRow label="Resolution">
        <SelectField
          value={String(value.targetHeightPx)}
          options={VIDEO_HEIGHTS.map((height) => ({
            value: String(height),
            label: height === 0 ? 'Same as source' : `${height}p`,
          }))}
          onChange={(targetHeightPx) => onChange({ targetHeightPx: Number(targetHeightPx) })}
        />
      </SettingRow>

      <SettingRow label="Frame rate">
        <SelectField
          value={String(value.frameRate)}
          options={FRAME_RATES.map((rate) => ({
            value: String(rate),
            label: rate === 0 ? 'Same as source' : `${rate} fps`,
          }))}
          onChange={(frameRate) => onChange({ frameRate: Number(frameRate) })}
        />
      </SettingRow>

      <SettingRow label="Remove audio">
        <SwitchField
          checked={value.removeAudio}
          onChange={(removeAudio) => onChange({ removeAudio })}
        />
      </SettingRow>

      {!value.removeAudio && files.length === 1 && audioStreams.length > 1 ? (
        <SettingRow label="Audio track">
          <SelectField
            value={String(value.audioStreamIndex ?? '')}
            options={[
              { value: '', label: 'First audio track' },
              ...audioStreams.map((stream) => ({
                value: String(stream.index),
                label: trackLabel(stream),
              })),
            ]}
            onChange={(index) =>
              onChange({ audioStreamIndex: index === '' ? null : Number(index) })
            }
          />
        </SettingRow>
      ) : null}

      {!value.removeAudio && audioCodecs.length > 0 ? (
        <SettingRow label="Audio codec">
          <SelectField
            value={value.audioCodec}
            options={[
              { value: 'auto', label: 'Automatic (container default)' },
              ...audioCodecs.map((codec) => ({
                value: codec.id,
                label: codec.label,
                disabled: !codec.available,
              })),
            ]}
            onChange={(audioCodec) => onChange({ audioCodec })}
          />
        </SettingRow>
      ) : null}

      {!value.removeAudio ? (
        <SettingRow label="Audio bitrate">
          <SelectField
            value={String(value.audioBitrateKbps)}
            options={VIDEO_AUDIO_BITRATES.map((bitrate) => ({
              value: String(bitrate),
              label: bitrate === 0 ? 'Automatic' : `${bitrate} kbps`,
            }))}
            onChange={(audioBitrateKbps) => onChange({ audioBitrateKbps: Number(audioBitrateKbps) })}
          />
        </SettingRow>
      ) : null}

      <SettingRow label="Keep metadata">
        <SwitchField
          checked={value.preserveMetadata}
          onChange={(preserveMetadata) => onChange({ preserveMetadata })}
        />
      </SettingRow>

      {usesHardware ? (
        <SettingRow
          label="Hardware acceleration"
          hint={
            hardwareAvailable
              ? `tested: ${hardware.map((encoder) => encoder.label).join(', ')}`
              : 'no tested GPU encoder — software is used'
          }
        >
          <SwitchField
            checked={value.hardwareAcceleration && hardwareAvailable}
            disabled={!hardwareAvailable}
            onChange={(hardwareAcceleration) => onChange({ hardwareAcceleration })}
          />
        </SettingRow>
      ) : null}

      <TrimFields settings={settings} onChange={onChange} maxMs={media.info?.durationMs ?? null} />

      <SettingRow label="File name" hint="single file only">
        <Input
          value={value.outputName}
          placeholder="keep the source name"
          onChange={(event) => onChange({ outputName: event.target.value })}
        />
      </SettingRow>

      <p className="py-2 text-xs text-muted-foreground">
        The aspect ratio is kept and odd frame sizes are rounded down to even numbers, which H.264
        and H.265 require.
      </p>
    </div>
  )
}

export function GifSettingsPanel({ settings, files, onChange }: SettingsPanelProps) {
  const value = asVideoSettings(settings)
  const media = useMediaInfo(files[0]?.path)

  return (
    <div className="flex flex-col">
      <EngineNotice engine="media" />
      <SettingRow label="GIF frame rate" hint={`${value.gifFps} fps`}>
        <SliderField value={value.gifFps} min={1} max={30} onChange={(gifFps) => onChange({ gifFps })} />
      </SettingRow>
      <SettingRow label="GIF width" hint={`${value.gifWidthPx}px`}>
        <SliderField
          value={value.gifWidthPx}
          min={160}
          max={1920}
          step={20}
          onChange={(gifWidthPx) => onChange({ gifWidthPx })}
        />
      </SettingRow>
      <SettingRow
        label="GIF height"
        hint={value.gifHeightPx === 0 ? 'follows the source aspect' : 'fitted, black bars if needed'}
      >
        <SelectField
          value={String(value.gifHeightPx)}
          options={GIF_HEIGHTS.map((height) => ({
            value: String(height),
            label: height === 0 ? 'Follow the source aspect ratio' : `${height}p box`,
          }))}
          onChange={(gifHeightPx) => onChange({ gifHeightPx: Number(gifHeightPx) })}
        />
      </SettingRow>
      <TrimFields settings={settings} onChange={onChange} maxMs={media.info?.durationMs ?? null} />
      <SettingRow label="File name" hint="single file only">
        <Input
          value={value.outputName}
          placeholder="keep the source name"
          onChange={(event) => onChange({ outputName: event.target.value })}
        />
      </SettingRow>
      <p className="py-2 text-xs text-muted-foreground">
        A palette is built from the clip before encoding, so colours stay close to the source. GIF is
        256-colour, silent, and capped at 30 seconds. Use the preview under Media info to check it
        before converting.
      </p>
    </div>
  )
}
