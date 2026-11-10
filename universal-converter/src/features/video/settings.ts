import type { ConversionSettings } from '@/types/converter'

export type VideoQualityPreset = 'fast' | 'balanced' | 'compression' | 'high' | 'custom'

export type VideoSettings = {
  /** `auto`, or one of the codecs the output container really supports. */
  videoCodec: string
  /** Preset names mirror the Rust enum; "compression" asks for the smallest file. */
  qualityPreset: VideoQualityPreset
  /** CRF used when qualityPreset is "custom". Lower is better, 0-51. */
  crf: number
  /** 0 lets the preset pick a CRF, or the hardware encoder pick a bitrate. */
  videoBitrateKbps: number
  /** 0 keeps the source height. */
  targetHeightPx: number
  /** 0 keeps the source frame rate. */
  frameRate: number
  /** 0 uses the container's default audio bitrate. */
  audioBitrateKbps: number
  /** `auto`, or an audio codec the container can carry. */
  audioCodec: string
  removeAudio: boolean
  /** ffprobe stream index; null takes the first audio track. */
  audioStreamIndex: number | null
  preserveMetadata: boolean
  /** Encode only this window; null means the whole clip. */
  startMs: number | null
  durationMs: number | null
  /** Uses a tested GPU encoder when one exists; otherwise software. */
  hardwareAcceleration: boolean
  /** Frames per second for the GIF output path. */
  gifFps: number
  gifWidthPx: number
  /** 0 follows the source aspect ratio; otherwise the GIF is fitted and padded. */
  gifHeightPx: number
  /** Stem for a single-file job; the engine appends the extension. */
  outputName: string
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  videoCodec: 'auto',
  qualityPreset: 'balanced',
  crf: 23,
  videoBitrateKbps: 0,
  targetHeightPx: 0,
  frameRate: 0,
  audioBitrateKbps: 0,
  audioCodec: 'auto',
  removeAudio: false,
  audioStreamIndex: null,
  preserveMetadata: true,
  startMs: null,
  durationMs: null,
  hardwareAcceleration: false,
  gifFps: 12,
  gifWidthPx: 640,
  gifHeightPx: 0,
  outputName: '',
}

export const VIDEO_HEIGHTS = [0, 360, 480, 720, 1080, 1440, 2160]
export const FRAME_RATES = [0, 24, 25, 30, 50, 60]
export const VIDEO_BITRATES = [0, 1_000, 2_500, 5_000, 8_000, 12_000, 20_000]
export const VIDEO_AUDIO_BITRATES = [0, 64, 96, 128, 192, 256, 320]
export const GIF_HEIGHTS = [0, 240, 360, 480, 720, 1080]

export function asVideoSettings(settings: ConversionSettings): VideoSettings {
  const merged = { ...DEFAULT_VIDEO_SETTINGS, ...settings }
  // Phase 1 called the high-compression preset "small"; saved presets may
  // still carry that name even though the Rust enum no longer offers it.
  const qualityPreset =
    (merged.qualityPreset as string) === 'small' ? 'compression' : merged.qualityPreset
  return { ...merged, qualityPreset } as VideoSettings
}
