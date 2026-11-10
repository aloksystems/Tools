import type { ConversionSettings, FormatId } from '@/types/converter'

export type AudioSettings = {
  /** `auto`, or a codec id the chosen container supports (OGG: `opus`). */
  codec: string
  /** 0 asks the encoder for its format default. Ignored for lossless outputs. */
  bitrateKbps: number
  /** 0 keeps the source sample rate. */
  sampleRateHz: number
  /** 0 keeps the source channel count; 1 mono, 2 stereo. */
  channels: number
  volumePercent: number
  normalize: boolean
  preserveMetadata: boolean
  /** Trim window in milliseconds; null means the whole track. */
  startMs: number | null
  durationMs: number | null
  /** Stem for a single-file job; the engine appends the extension. */
  outputName: string
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  codec: 'auto',
  bitrateKbps: 192,
  sampleRateHz: 0,
  channels: 0,
  volumePercent: 100,
  normalize: false,
  preserveMetadata: true,
  startMs: null,
  durationMs: null,
  outputName: '',
}

export const AUDIO_BITRATES = [64, 96, 128, 160, 192, 256, 320]
export const SAMPLE_RATES = [0, 22050, 32000, 44100, 48000, 96000]

const LOSSLESS_FORMATS: FormatId[] = ['wav', 'flac', 'aiff', 'alac']

export function isLosslessFormat(format: FormatId | null): boolean {
  return format !== null && LOSSLESS_FORMATS.includes(format)
}

/**
 * Sample rates the chosen encoder really accepts. Offering 96 kHz for MP3 or
 * Opus would make FFmpeg fail or silently resample, so it is not offered.
 */
export function sampleRatesFor(format: FormatId | null, codec: string): number[] {
  switch (format) {
    case 'mp3':
    case 'wma':
      return [0, 22050, 32000, 44100, 48000]
    case 'opus':
      return [0, 48000]
    case 'ogg':
      return codec === 'opus'
        ? [0, 48000]
        : [0, 22050, 32000, 44100, 48000, 96000]
    case null:
      return SAMPLE_RATES
    default:
      return SAMPLE_RATES
  }
}

/** WMA v2 tops out below the highest MP3 preset. */
export function bitratesFor(format: FormatId | null): number[] {
  if (format === 'wma') return AUDIO_BITRATES.filter((bitrate) => bitrate <= 192)
  return AUDIO_BITRATES
}

export function asAudioSettings(settings: ConversionSettings): AudioSettings {
  return { ...DEFAULT_AUDIO_SETTINGS, ...settings }
}
