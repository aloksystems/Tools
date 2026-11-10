import {
  SelectField,
  SettingRow,
  SliderField,
  SwitchField,
} from '@/components/conversion-settings/controls'
import { EngineNotice } from '@/components/conversion-settings/EngineNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { missingDependencyNotice, usePdfCapabilities } from '@/features/pdf/capabilities'
import {
  asPdfSettings,
  type PageMode,
  type PdfLayout,
  type PdfMetadata,
  type PdfOperation,
  type PdfSettings,
} from '@/features/pdf/settings'
import type { SettingsPanelProps } from '@/features/types'
import { api } from '@/utils/api'
import type { PdfCapability } from '@/types/converter'
import { useState } from 'react'

const OPERATIONS: { value: PdfOperation; label: string }[] = [
  { value: 'convert', label: 'Convert / extract' },
  { value: 'merge', label: 'Merge into one PDF' },
  { value: 'split', label: 'Split pages' },
  { value: 'rotate', label: 'Rotate pages' },
  { value: 'reorder', label: 'Reorder / extract pages' },
  { value: 'compress', label: 'Compress' },
  { value: 'watermark', label: 'Text watermark' },
  { value: 'pageText', label: 'Page numbers & headers' },
  { value: 'annotate', label: 'Sticky-note annotations' },
  { value: 'metadata', label: 'Read / edit metadata' },
  { value: 'password', label: 'Set / remove password' },
]

function capabilityKey(
  operation: PdfOperation,
  hasPdf: boolean,
): PdfCapability['operation'] {
  if (operation === 'convert') return hasPdf ? 'pdfToImages' : 'imagesToPdf'
  if (operation === 'pageText') return 'pageNumbers'
  if (operation === 'annotate') return 'annotations'
  return operation
}

function PagesControl({
  mode,
  ranges,
  onChange,
}: {
  mode: PageMode
  ranges: string
  onChange: (patch: { pageMode?: PageMode; pageRanges?: string }) => void
}) {
  return (
    <>
      <SettingRow label="Pages">
        <SelectField
          value={mode}
          options={[
            { value: 'all', label: 'All pages' },
            { value: 'ranges', label: 'Selected pages' },
          ]}
          onChange={(pageMode) => onChange({ pageMode })}
        />
      </SettingRow>
      {mode === 'ranges' ? (
        <SettingRow label="Range" hint="1-based, e.g. 1-3,7">
          <Input
            placeholder="1-3,7"
            value={ranges}
            onChange={(event) => onChange({ pageRanges: event.target.value })}
          />
        </SettingRow>
      ) : null}
    </>
  )
}

export function PdfSettingsPanel({
  settings,
  outputFormat,
  files,
  onChange,
}: SettingsPanelProps) {
  const value = asPdfSettings(settings)
  const { capabilities } = usePdfCapabilities()
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)

  const pdfs = files.filter((file) => file.format === 'pdf')
  const images = files.filter((file) => file.format !== 'pdf')
  const hasPdf = pdfs.length > 0
  const hasImages = images.length > 0
  const mixed = hasPdf && hasImages
  // A batch of images only ever places pages into a PDF, whatever a preset said.
  const operation: PdfOperation = hasPdf ? value.operation : 'convert'
  const renderingToImage = hasPdf && operation === 'convert'
  const selectedKey = capabilityKey(operation, hasPdf)
  const selectedCapability = capabilities?.find((entry) => entry.operation === selectedKey)
  const unavailableOptions = new Set(
    (capabilities ?? [])
      .filter((entry) => !entry.available)
      .map((entry) => entry.operation),
  )

  const operationOptions = (hasPdf ? OPERATIONS : OPERATIONS.filter((entry) => entry.value === 'convert')).map(
    (entry) => ({
      ...entry,
      disabled: mixed || unavailableOptions.has(capabilityKey(entry.value, hasPdf)),
    }),
  )

  const patch = (next: Partial<PdfSettings>) => onChange(next)

  const setLayout = (next: Partial<PdfLayout>) =>
    patch({ layout: { ...value.layout, ...next } })

  const setMetadata = (next: Partial<PdfMetadata>) =>
    patch({ metadata: { ...value.metadata, ...next } })

  const loadMetadata = async () => {
    const source = pdfs[0]
    if (!source) return
    setReading(true)
    setReadError(null)
    try {
      const info = await api.inspectPdf(source.path, value.password)
      patch({
        metadata: {
          title: info.title ?? '',
          author: info.author ?? '',
          subject: info.subject ?? '',
          keywords: info.keywords ?? '',
          creator: info.creator ?? '',
        },
        metadataLoaded: true,
      })
    } catch (reason) {
      setReadError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="flex flex-col">
      <EngineNotice engine="pdf" />

      {mixed ? (
        <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
          This page handles PDFs or images, not both in one batch. Remove one group from the file
          list.
        </p>
      ) : null}

      <SettingRow label="Operation">
        <SelectField
          value={operation}
          options={operationOptions}
          onChange={(next) => patch({ operation: next })}
        />
      </SettingRow>

      {selectedCapability && !selectedCapability.available ? (
        <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
          {missingDependencyNotice(selectedCapability)}
        </p>
      ) : null}

      {!mixed && selectedCapability?.available !== false ? (
        <>
          {renderingToImage ? (
            <>
              <PagesControl
                mode={value.pageMode}
                ranges={value.pageRanges}
                onChange={patch}
              />
              <p className="pb-1 text-xs text-muted-foreground">
                Each selected page becomes its own image job, named after the document and page.
              </p>
              <SettingRow label="Resolution" hint={`${value.dpi} DPI`}>
                <SliderField
                  value={value.dpi}
                  min={36}
                  max={600}
                  step={4}
                  onChange={(dpi) => patch({ dpi })}
                />
              </SettingRow>
              {outputFormat === 'jpeg' || outputFormat === 'webp' ? (
                <SettingRow label="Image quality" hint={String(value.rasterQuality)}>
                  <SliderField
                    value={value.rasterQuality}
                    min={1}
                    max={100}
                    onChange={(rasterQuality) => patch({ rasterQuality })}
                  />
                </SettingRow>
              ) : null}
            </>
          ) : null}

          {hasImages && operation === 'convert' ? (
            <>
              <SettingRow
                label="One PDF for the whole batch"
                hint={`${images.length} image${images.length === 1 ? '' : 's'}`}
              >
                <SwitchField
                  checked={value.combineImages}
                  onChange={(combineImages) => patch({ combineImages })}
                />
              </SettingRow>
              <p className="pb-1 text-xs text-muted-foreground">
                Pages follow the file list order — use the arrows beside each file to arrange them.
              </p>
              {value.combineImages || value.outputName.trim() !== '' ? (
                <SettingRow label="Output name" hint="without .pdf">
                  <Input
                    placeholder="Auto: first file’s name"
                    value={value.outputName}
                    onChange={(event) => patch({ outputName: event.target.value })}
                  />
                </SettingRow>
              ) : null}
              <SettingRow label="Page size">
                <SelectField
                  value={value.layout.pageSize}
                  options={[
                    { value: 'a4', label: 'A4' },
                    { value: 'letter', label: 'Letter' },
                    { value: 'legal', label: 'Legal' },
                    { value: 'fit', label: 'Fit image (1 px = 1 pt)' },
                  ]}
                  onChange={(pageSize) => setLayout({ pageSize })}
                />
              </SettingRow>
              <SettingRow label="Orientation">
                <SelectField
                  value={value.layout.orientation}
                  options={[
                    { value: 'auto', label: 'Auto (match the image)' },
                    { value: 'portrait', label: 'Portrait' },
                    { value: 'landscape', label: 'Landscape' },
                  ]}
                  onChange={(orientation) => setLayout({ orientation })}
                />
              </SettingRow>
              <SettingRow label="Margin" hint={`${value.layout.marginMm} mm`}>
                <SliderField
                  value={value.layout.marginMm}
                  min={0}
                  max={50}
                  onChange={(marginMm) => setLayout({ marginMm })}
                />
              </SettingRow>
              <SettingRow label="Placement">
                <SelectField
                  value={value.layout.placement}
                  options={[
                    { value: 'center', label: 'Centered' },
                    { value: 'top', label: 'Top' },
                    { value: 'bottom', label: 'Bottom' },
                  ]}
                  onChange={(placement) => setLayout({ placement })}
                />
              </SettingRow>
            </>
          ) : null}

          {operation === 'merge' ? (
            <>
              <SettingRow label="Merged file name" hint="without .pdf">
                <Input
                  placeholder="Auto: first file’s name + -merged"
                  value={value.outputName}
                  onChange={(event) => patch({ outputName: event.target.value })}
                />
              </SettingRow>
              <p className="py-1 text-xs text-muted-foreground">
                PDFs are merged in the order shown in the file list. Page options do not apply.
              </p>
            </>
          ) : null}

          {operation === 'split' ? (
            <>
              <SettingRow label="Split into">
                <SelectField
                  value={value.splitMode}
                  options={[
                    { value: 'ranges', label: 'One PDF from selected pages' },
                    { value: 'individual', label: 'One PDF per page' },
                    { value: 'every', label: 'One PDF every N pages' },
                  ]}
                  onChange={(splitMode) => patch({ splitMode })}
                />
              </SettingRow>
              {value.splitMode === 'ranges' ? (
                <SettingRow label="Range" hint="1-based, e.g. 1-3,7">
                  <Input
                    placeholder="1-3,7"
                    value={value.pageRanges}
                    onChange={(event) => patch({ pageRanges: event.target.value })}
                  />
                </SettingRow>
              ) : null}
              {value.splitMode === 'every' ? (
                <SettingRow label="Pages per file">
                  <Input
                    type="number"
                    min={1}
                    value={value.splitEvery}
                    onChange={(event) =>
                      patch({ splitEvery: Math.max(1, Math.floor(Number(event.target.value) || 1)) })
                    }
                  />
                </SettingRow>
              ) : null}
              <p className="py-1 text-xs text-muted-foreground">
                Outputs get a page suffix, so the source PDF is never overwritten.
              </p>
            </>
          ) : null}

          {operation === 'rotate' ? (
            <>
              <PagesControl
                mode={value.pageMode}
                ranges={value.pageRanges}
                onChange={patch}
              />
              <SettingRow label="Rotate">
                <SelectField
                  value={String(value.rotation)}
                  options={[
                    { value: '90', label: '90° clockwise' },
                    { value: '180', label: '180°' },
                    { value: '270', label: '270° clockwise' },
                  ]}
                  onChange={(rotation) => patch({ rotation: Number(rotation) })}
                />
              </SettingRow>
            </>
          ) : null}

          {operation === 'reorder' ? (
            <>
              <SettingRow label="Page order" hint="use the Studio below">
                <Input
                  placeholder="3,1-2"
                  value={value.pageOrder}
                  onChange={(event) => patch({ pageOrder: event.target.value })}
                />
              </SettingRow>
              <p className="py-1 text-xs text-muted-foreground">
                Ranges expand in place and pages may repeat. <strong>Apply order</strong> in the
                Studio writes this field for you.
              </p>
            </>
          ) : null}

          {operation === 'compress' ? (
            <>
              <SettingRow label="Compression">
                <SelectField
                  value={value.compression}
                  options={[
                    { value: 'low', label: 'Low (fastest)' },
                    { value: 'medium', label: 'Balanced' },
                    { value: 'high', label: 'High (slowest, smallest)' },
                  ]}
                  onChange={(compression) => patch({ compression })}
                />
              </SettingRow>
              <p className="py-1 text-xs text-muted-foreground">
                Recompresses PDF streams; photos are not re-encoded. Queue and History show the real
                before/after sizes. If the file cannot shrink, the job fails and the original is
                left untouched.
              </p>
            </>
          ) : null}

          {operation === 'watermark' ? (
            <>
              <PagesControl
                mode={value.pageMode}
                ranges={value.pageRanges}
                onChange={patch}
              />
              <SettingRow label="Watermark text" hint="plain ASCII">
                <Input
                  placeholder="CONFIDENTIAL"
                  value={value.watermark.text}
                  onChange={(event) =>
                    patch({ watermark: { ...value.watermark, text: event.target.value } })
                  }
                />
              </SettingRow>
              <SettingRow label="Size" hint={`${value.watermark.fontSize} pt`}>
                <SliderField
                  value={value.watermark.fontSize}
                  min={8}
                  max={200}
                  onChange={(fontSize) =>
                    patch({ watermark: { ...value.watermark, fontSize } })
                  }
                />
              </SettingRow>
              <SettingRow label="Opacity" hint={`${Math.round(value.watermark.opacity * 100)}%`}>
                <SliderField
                  value={value.watermark.opacity}
                  min={0.02}
                  max={1}
                  step={0.02}
                  onChange={(opacity) => patch({ watermark: { ...value.watermark, opacity } })}
                />
              </SettingRow>
              <SettingRow label="Angle" hint={`${value.watermark.angle}°`}>
                <SliderField
                  value={value.watermark.angle}
                  min={-90}
                  max={90}
                  step={5}
                  onChange={(angle) => patch({ watermark: { ...value.watermark, angle } })}
                />
              </SettingRow>
              <SettingRow label="Colour">
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-9 w-12 p-1"
                    value={value.watermark.color}
                    onChange={(event) =>
                      patch({ watermark: { ...value.watermark, color: event.target.value } })
                    }
                  />
                  <Input
                    className="flex-1"
                    value={value.watermark.color}
                    onChange={(event) =>
                      patch({ watermark: { ...value.watermark, color: event.target.value } })
                    }
                  />
                </div>
              </SettingRow>
            </>
          ) : null}

          {operation === 'pageText' ? (
            <>
              <PagesControl
                mode={value.pageMode}
                ranges={value.pageRanges}
                onChange={patch}
              />
              {(
                [
                  ['headerLeft', 'Header left'],
                  ['headerCenter', 'Header centre'],
                  ['headerRight', 'Header right'],
                  ['footerLeft', 'Footer left'],
                  ['footerCenter', 'Footer centre'],
                  ['footerRight', 'Footer right'],
                ] as const
              ).map(([key, label]) => (
                <SettingRow key={key} label={label}>
                  <Input
                    placeholder="{page} / {total}"
                    value={value.pageText[key]}
                    onChange={(event) =>
                      patch({ pageText: { ...value.pageText, [key]: event.target.value } })
                    }
                  />
                </SettingRow>
              ))}
              <p className="py-1 text-xs text-muted-foreground">
                Use <code>{'{page}'}</code>, <code>{'{total}'}</code> and <code>{'{title}'}</code>{' '}
                as placeholders. ASCII text uses the built-in Helvetica font.
              </p>
              <SettingRow label="Font size" hint={`${value.pageText.fontSize} pt`}>
                <SliderField
                  value={value.pageText.fontSize}
                  min={4}
                  max={36}
                  onChange={(fontSize) => patch({ pageText: { ...value.pageText, fontSize } })}
                />
              </SettingRow>
              <SettingRow label="Margin" hint={`${value.pageText.marginMm} mm`}>
                <SliderField
                  value={value.pageText.marginMm}
                  min={0}
                  max={50}
                  onChange={(marginMm) => patch({ pageText: { ...value.pageText, marginMm } })}
                />
              </SettingRow>
              <SettingRow label="First printed number">
                <Input
                  type="number"
                  min={1}
                  value={value.pageText.startNumber}
                  onChange={(event) =>
                    patch({
                      pageText: {
                        ...value.pageText,
                        startNumber: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                      },
                    })
                  }
                />
              </SettingRow>
            </>
          ) : null}

          {operation === 'annotate' ? (
            <>
              <PagesControl
                mode={value.pageMode}
                ranges={value.pageRanges}
                onChange={patch}
              />
              <SettingRow label="Note">
                <Input
                  placeholder="Review this page"
                  value={value.annotation.text}
                  onChange={(event) =>
                    patch({ annotation: { ...value.annotation, text: event.target.value } })
                  }
                />
              </SettingRow>
              <SettingRow label="Author" hint="optional">
                <Input
                  value={value.annotation.author}
                  onChange={(event) =>
                    patch({ annotation: { ...value.annotation, author: event.target.value } })
                  }
                />
              </SettingRow>
              <SettingRow label="Distance from corner" hint={`${value.annotation.marginMm} mm`}>
                <SliderField
                  value={value.annotation.marginMm}
                  min={0}
                  max={50}
                  onChange={(marginMm) =>
                    patch({ annotation: { ...value.annotation, marginMm } })
                  }
                />
              </SettingRow>
              <p className="py-1 text-xs text-muted-foreground">
                Each note is a real PDF text annotation, so it appears in the comments panel of
                standard viewers. Annotations are placed at the top-right corner.
              </p>
            </>
          ) : null}

          {operation === 'metadata' ? (
            <>
              <SettingRow label="Remove all metadata">
                <SwitchField
                  checked={value.removeAllMetadata}
                  onChange={(removeAllMetadata) => patch({ removeAllMetadata })}
                />
              </SettingRow>
              {value.removeAllMetadata ? (
                <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                  The output drops every Info field and the XMP stream. The engine reads the output
                  again and fails the job if any metadata survived.
                </p>
              ) : (
                <>
              <div className="flex items-center justify-between gap-2 py-2">
                <p className="text-xs text-muted-foreground">
                  {value.metadataLoaded
                    ? 'Loaded values: clearing a field removes it from the output.'
                    : 'Empty fields are left unchanged. Load first to edit real values.'}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasPdf || reading}
                  onClick={() => void loadMetadata()}
                >
                  {reading ? 'Reading…' : 'Load current'}
                </Button>
              </div>
              <SettingRow label="Title">
                <Input value={value.metadata.title} onChange={(event) => setMetadata({ title: event.target.value })} />
              </SettingRow>
              <SettingRow label="Author">
                <Input value={value.metadata.author} onChange={(event) => setMetadata({ author: event.target.value })} />
              </SettingRow>
              <SettingRow label="Subject">
                <Input value={value.metadata.subject} onChange={(event) => setMetadata({ subject: event.target.value })} />
              </SettingRow>
              <SettingRow label="Keywords">
                <Input value={value.metadata.keywords} onChange={(event) => setMetadata({ keywords: event.target.value })} />
              </SettingRow>
              <SettingRow label="Creator">
                <Input value={value.metadata.creator} onChange={(event) => setMetadata({ creator: event.target.value })} />
              </SettingRow>
                </>
              )}
              {readError ? <p className="text-xs text-destructive">{readError}</p> : null}
            </>
          ) : null}

          {operation === 'password' ? (
            <>
              <SettingRow label="Action">
                <SelectField
                  value={value.passwordAction}
                  options={[
                    { value: 'set', label: 'Set a password on the output' },
                    { value: 'remove', label: 'Remove encryption' },
                  ]}
                  onChange={(passwordAction) => patch({ passwordAction })}
                />
              </SettingRow>
              {value.passwordAction === 'set' ? (
                <>
                  <SettingRow label="New password">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={value.newPassword}
                      onChange={(event) => patch({ newPassword: event.target.value })}
                    />
                  </SettingRow>
                  <SettingRow label="Owner password" hint="optional">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={value.ownerPassword}
                      onChange={(event) => patch({ ownerPassword: event.target.value })}
                    />
                  </SettingRow>
                  <p className="py-1 text-xs text-muted-foreground">
                    Outputs use 256-bit AES. The owner password defaults to the new password.
                  </p>
                </>
              ) : (
                <p className="py-1 text-xs text-muted-foreground">
                  The output is written unencrypted. This only works when the current password is
                  known — unknown passwords are never bypassed.
                </p>
              )}
            </>
          ) : null}

          {hasPdf ? (
            <SettingRow label="Current PDF password" hint="only if encrypted">
              <Input
                type="password"
                autoComplete="off"
                value={value.password}
                onChange={(event) => patch({ password: event.target.value })}
              />
            </SettingRow>
          ) : null}
          <p className="pb-1 text-xs text-muted-foreground">
            Passwords are held for this batch only — never saved to presets, logs or history.
          </p>
        </>
      ) : null}
    </div>
  )
}
