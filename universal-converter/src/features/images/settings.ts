import type { ConversionSettings } from '@/types/converter'

export type ResizeMode = 'none' | 'contain' | 'cover' | 'width' | 'height'
export type CropMode = 'none' | 'center' | 'manual'
export type WatermarkPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center'

export type ImageSettings = {
  quality: number
  resizeMode: ResizeMode
  width: number
  height: number
  rotation: number
  flipHorizontal: boolean
  flipVertical: boolean
  stripMetadata: boolean
  /** Colour used to flatten transparency when the target format has no alpha. */
  flattenBackground: string
  tiffCompression: 'none' | 'ccitt' | 'jpeg' | 'lzw' | 'deflate' | 'zip'
  cropMode: CropMode
  cropWidth: number
  cropHeight: number
  cropX: number
  cropY: number
  watermarkText: string
  watermarkPosition: WatermarkPosition
  /** 0–100. */
  watermarkOpacity: number
  /** Glyph size as a percentage of the shorter image side. */
  watermarkSize: number
  watermarkColor: string
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  quality: 90,
  resizeMode: 'none',
  width: 1920,
  height: 1080,
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  stripMetadata: false,
  flattenBackground: '#ffffff',
  tiffCompression: 'lzw',
  cropMode: 'none',
  cropWidth: 1024,
  cropHeight: 1024,
  cropX: 0,
  cropY: 0,
  watermarkText: '',
  watermarkPosition: 'center',
  watermarkOpacity: 35,
  watermarkSize: 8,
  watermarkColor: '#ffffff',
}

export const DIMENSION_PRESETS = [
  { label: '1920×1080', width: 1920, height: 1080 },
  { label: '1280×720', width: 1280, height: 720 },
  { label: '1080×1080', width: 1080, height: 1080 },
  { label: '800×600', width: 800, height: 600 },
] as const

export function asImageSettings(settings: ConversionSettings): ImageSettings {
  return { ...DEFAULT_IMAGE_SETTINGS, ...settings }
}
