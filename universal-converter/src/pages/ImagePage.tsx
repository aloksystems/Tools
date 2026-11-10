import { ConverterPage } from '@/components/conversion/ConverterPage'
import { ImageSettingsPanel } from '@/features/images/ImageSettingsPanel'
import { DEFAULT_IMAGE_SETTINGS } from '@/features/images/settings'
import { acceptsFor } from '@/utils/format'

export function ImagePage() {
  return (
    <ConverterPage
      page="image"
      title="Images"
      description="Batch convert between JPEG, PNG, WebP, BMP, TIFF, GIF and ICO, with resize, rotation and quality control. AVIF, HEIC and SVG go through ImageMagick."
      accepts={acceptsFor('/image')}
      engine="image"
      defaults={DEFAULT_IMAGE_SETTINGS}
      Panel={ImageSettingsPanel}
    />
  )
}
