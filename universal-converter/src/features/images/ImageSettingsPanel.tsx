import {
  SelectField,
  SettingRow,
  SliderField,
  SwitchField,
} from '@/components/conversion-settings/controls'
import { EngineNotice } from '@/components/conversion-settings/EngineNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { asImageSettings, DIMENSION_PRESETS } from '@/features/images/settings'
import { useAppStore } from '@/stores/appStore'
import type { ConversionSettings, FormatId } from '@/types/converter'

const RESIZE_OPTIONS = [
  { value: 'none', label: 'Keep original size' },
  { value: 'contain', label: 'Fit inside box' },
  { value: 'cover', label: 'Fill box (crop)' },
  { value: 'width', label: 'Set width only' },
  { value: 'height', label: 'Set height only' },
] as const

const TIFF_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'lzw', label: 'LZW' },
  { value: 'deflate', label: 'Deflate' },
  { value: 'zip', label: 'Zip' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'ccitt', label: 'CCITT (bilevel)' },
] as const

export function ImageSettingsPanel({
  settings,
  outputFormat,
  onChange,
}: {
  settings: ConversionSettings
  outputFormat: FormatId | null
  onChange: (patch: ConversionSettings) => void
}) {
  const value = asImageSettings(settings)
  const engines = useAppStore((state) => state.engines)
  const usesImageMagick = outputFormat === 'svg' || outputFormat === 'heic' || outputFormat === 'avif'
  const lossy = outputFormat === 'jpeg' || outputFormat === 'webp' || outputFormat === 'avif'
  const needsFlatten = outputFormat === 'jpeg' || outputFormat === 'bmp'

  return (
    <div className="flex flex-col">
      {usesImageMagick ? <EngineNotice engine="imagemagick" /> : null}

      <SettingRow label="Quality" hint={lossy ? `${value.quality}%` : 'ignored for lossless output'}>
        <SliderField
          value={value.quality}
          min={1}
          max={100}
          onChange={(quality) => onChange({ quality })}
        />
      </SettingRow>

      <SettingRow label="Resize">
        <SelectField
          value={value.resizeMode}
          options={[...RESIZE_OPTIONS]}
          onChange={(resizeMode) => onChange({ resizeMode })}
        />
      </SettingRow>

      {value.resizeMode !== 'none' ? (
        <div className="grid grid-cols-2 gap-3">
          <SettingRow label="Width (px)">
            <Input
              type="number"
              min={1}
              value={value.width}
              onChange={(event) => onChange({ width: Number(event.target.value) || 1 })}
            />
          </SettingRow>
          <SettingRow label="Height (px)">
            <Input
              type="number"
              min={1}
              value={value.height}
              onChange={(event) => onChange({ height: Number(event.target.value) || 1 })}
            />
          </SettingRow>
        </div>
      ) : null}

      <SettingRow label="Size presets">
        <div className="flex flex-wrap gap-1.5">
          {DIMENSION_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() =>
                onChange({
                  resizeMode: 'contain',
                  width: preset.width,
                  height: preset.height,
                })
              }
            >
              {preset.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onChange({ resizeMode: 'none' })}
          >
            Original
          </Button>
        </div>
      </SettingRow>

      <SettingRow label="Crop">
        <SelectField
          value={value.cropMode}
          options={[
            { value: 'none', label: 'Keep every pixel' },
            { value: 'center', label: 'Centre rectangle' },
            { value: 'manual', label: 'Manual rectangle' },
          ]}
          onChange={(cropMode) => onChange({ cropMode })}
        />
      </SettingRow>

      {value.cropMode !== 'none' ? (
        <div className="grid grid-cols-2 gap-3">
          <SettingRow label="Crop width">
            <Input
              type="number"
              min={1}
              value={value.cropWidth}
              onChange={(event) => onChange({ cropWidth: Number(event.target.value) || 1 })}
            />
          </SettingRow>
          <SettingRow label="Crop height">
            <Input
              type="number"
              min={1}
              value={value.cropHeight}
              onChange={(event) => onChange({ cropHeight: Number(event.target.value) || 1 })}
            />
          </SettingRow>
          {value.cropMode === 'manual' ? (
            <>
              <SettingRow label="Left (px)">
                <Input
                  type="number"
                  min={0}
                  value={value.cropX}
                  onChange={(event) => onChange({ cropX: Math.max(0, Number(event.target.value) || 0) })}
                />
              </SettingRow>
              <SettingRow label="Top (px)">
                <Input
                  type="number"
                  min={0}
                  value={value.cropY}
                  onChange={(event) => onChange({ cropY: Math.max(0, Number(event.target.value) || 0) })}
                />
              </SettingRow>
            </>
          ) : null}
        </div>
      ) : null}

      <SettingRow label="Rotate" hint={`${value.rotation}°`}>
        <SelectField
          value={String(value.rotation)}
          options={[
            { value: '0', label: '0°' },
            { value: '90', label: '90° clockwise' },
            { value: '180', label: '180°' },
            { value: '270', label: '270° clockwise' },
          ]}
          onChange={(rotation) => onChange({ rotation: Number(rotation) })}
        />
      </SettingRow>

      <SettingRow label="Flip horizontally">
        <SwitchField
          checked={value.flipHorizontal}
          onChange={(flipHorizontal) => onChange({ flipHorizontal })}
        />
      </SettingRow>

      <SettingRow label="Flip vertically">
        <SwitchField
          checked={value.flipVertical}
          onChange={(flipVertical) => onChange({ flipVertical })}
        />
      </SettingRow>

      {needsFlatten ? (
        <SettingRow label="Flatten transparency onto">
          <div className="flex items-center gap-2">
            <Input
              type="color"
              className="h-9 w-12 p-1"
              value={value.flattenBackground}
              onChange={(event) => onChange({ flattenBackground: event.target.value })}
            />
            <Input
              className="flex-1"
              value={value.flattenBackground}
              onChange={(event) => onChange({ flattenBackground: event.target.value })}
            />
          </div>
        </SettingRow>
      ) : null}

      {outputFormat === 'tiff' ? (
        <SettingRow label="TIFF compression">
          <SelectField
            value={value.tiffCompression}
            options={[...TIFF_OPTIONS]}
            onChange={(tiffCompression) => onChange({ tiffCompression })}
          />
        </SettingRow>
      ) : null}

      <SettingRow label="Watermark">
        <Input
          value={value.watermarkText}
          placeholder="Text drawn over every image (optional)"
          onChange={(event) => onChange({ watermarkText: event.target.value })}
        />
      </SettingRow>

      {value.watermarkText.trim().length > 0 ? (
        <>
          <SettingRow label="Watermark position">
            <SelectField
              value={value.watermarkPosition}
              options={[
                { value: 'topLeft', label: 'Top left' },
                { value: 'topRight', label: 'Top right' },
                { value: 'bottomLeft', label: 'Bottom left' },
                { value: 'bottomRight', label: 'Bottom right' },
                { value: 'center', label: 'Centre' },
              ]}
              onChange={(watermarkPosition) => onChange({ watermarkPosition })}
            />
          </SettingRow>
          <SettingRow label="Opacity" hint={`${value.watermarkOpacity}%`}>
            <SliderField
              value={value.watermarkOpacity}
              min={5}
              max={100}
              onChange={(watermarkOpacity) => onChange({ watermarkOpacity })}
            />
          </SettingRow>
          <SettingRow label="Size" hint={`${value.watermarkSize}% of the short side`}>
            <SliderField
              value={value.watermarkSize}
              min={2}
              max={30}
              onChange={(watermarkSize) => onChange({ watermarkSize })}
            />
          </SettingRow>
          <SettingRow label="Watermark colour">
            <div className="flex items-center gap-2">
              <Input
                type="color"
                className="h-9 w-12 p-1"
                value={value.watermarkColor}
                onChange={(event) => onChange({ watermarkColor: event.target.value })}
              />
              <Input
                className="flex-1"
                value={value.watermarkColor}
                onChange={(event) => onChange({ watermarkColor: event.target.value })}
              />
            </div>
          </SettingRow>
        </>
      ) : null}

      <SettingRow label="Optimise for size" hint="reduces quality, strips profiles">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ quality: 80, stripMetadata: true })}
        >
          Use balanced settings
        </Button>
      </SettingRow>

      <SettingRow
        label="Strip metadata"
        hint={
          engines.some((engine) => engine.id === 'imagemagick' && engine.available)
            ? undefined
            : 'EXIF removal needs ImageMagick for some formats'
        }
      >
        <SwitchField
          checked={value.stripMetadata}
          onChange={(stripMetadata) => onChange({ stripMetadata })}
        />
      </SettingRow>
    </div>
  )
}
