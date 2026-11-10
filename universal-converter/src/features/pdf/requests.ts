import { missingDependencyNotice } from '@/features/pdf/capabilities'
import { asPdfSettings, type PdfMetadata, type PdfSettings } from '@/features/pdf/settings'
import type { OutputChoice } from '@/hooks/useOutputChoices'
import type {
  ConversionSettings,
  FileProbe,
  FormatId,
  PdfCapability,
} from '@/types/converter'
import { api, type JobRequest } from '@/utils/api'
import { fileStem } from '@/utils/format'

/** The only raster targets the bundled PDFium path writes. */
const RASTER_OUTPUTS: FormatId[] = ['png', 'jpeg', 'webp']

/** Inputs the image-to-PDF path can decode and place on a page. */
const IMAGE_INPUTS: FormatId[] = ['jpeg', 'png', 'webp', 'tiff', 'bmp', 'gif']

export interface PdfContext {
  files: FileProbe[]
  settings: ConversionSettings
  outputFormat: FormatId | null
}

export interface PdfBuildContext extends PdfContext {
  outputDirectory?: string
}

function pdfInputs(files: FileProbe[]): FileProbe[] {
  return files.filter((file) => file.format === 'pdf')
}

function imageInputs(files: FileProbe[]): FileProbe[] {
  return files.filter((file) => IMAGE_INPUTS.includes(file.format))
}

function unsupportedInputs(files: FileProbe[]): FileProbe[] {
  return files.filter((file) => file.format !== 'pdf' && !IMAGE_INPUTS.includes(file.format))
}

function isMixed(files: FileProbe[]): boolean {
  return pdfInputs(files).length > 0 && imageInputs(files).length > 0
}

/**
 * The PDF page works on either PDFs or images. This keeps the output picker
 * honest: rendering a PDF never offers PDF, and the edit operations only offer
 * PDF.
 */
export function filterPdfChoices(choices: OutputChoice[], context: PdfContext): OutputChoice[] {
  if (context.files.length === 0) return choices
  if (isMixed(context.files) || unsupportedInputs(context.files).length > 0) return []

  const pdfs = pdfInputs(context.files)
  if (pdfs.length === 0) return choices.filter((choice) => choice.format === 'pdf')

  return asPdfSettings(context.settings).operation === 'convert'
    ? choices.filter((choice) => RASTER_OUTPUTS.includes(choice.format))
    : choices.filter((choice) => choice.format === 'pdf')
}

/** Output the batch has exactly one sensible destination for, or null. */
export function forcedPdfOutput(context: PdfContext): FormatId | null {
  if (context.files.length === 0) return null
  if (isMixed(context.files) || unsupportedInputs(context.files).length > 0) return null
  const pdfs = pdfInputs(context.files)
  if (pdfs.length === 0) return 'pdf'
  return asPdfSettings(context.settings).operation === 'convert' ? null : 'pdf'
}

export function capabilityKeyFor(context: PdfContext): PdfCapability['operation'] {
  const pdfs = pdfInputs(context.files)
  const operation = asPdfSettings(context.settings).operation
  if (pdfs.length === 0) return 'imagesToPdf'
  switch (operation) {
    case 'convert':
      return 'pdfToImages'
    case 'merge':
      return 'merge'
    case 'split':
      return 'split'
    case 'rotate':
      return 'rotate'
    case 'reorder':
      return 'reorder'
    case 'compress':
      return 'compress'
    case 'metadata':
      return 'metadata'
    case 'password':
      return 'password'
    case 'watermark':
      return 'watermark'
    case 'pageText':
      return 'pageNumbers'
    case 'annotate':
      return 'annotations'
  }
}

/** Everything that must be true before a PDF job list makes sense. */
export function pdfBlocker(
  context: PdfContext,
  capabilities: PdfCapability[] | null,
): string | null {
  const files = context.files
  if (files.length === 0) return null

  const unsupported = unsupportedInputs(files)[0]
  if (unsupported) {
    return `${unsupported.name} is not a PDF or an image this page can place. Remove it to continue.`
  }
  if (isMixed(files)) {
    return 'This page works on PDFs or on images, not both at once. Remove one group from the batch.'
  }

  const value = asPdfSettings(context.settings)
  const pdfs = pdfInputs(files)
  const capabilityKey = capabilityKeyFor(context)
  const capability = capabilities?.find((entry) => entry.operation === capabilityKey)
  if (capability && !capability.available) return missingDependencyNotice(capability)

  if (pdfs.length === 0) {
    // The panel fixes an images-only batch to Convert, so a stale operation
    // from a previous PDF batch must not block it.
    return context.outputFormat === 'pdf' ? null : 'Choose PDF as the output format.'
  }

  if (value.operation === 'convert') {
    if (!context.outputFormat || !RASTER_OUTPUTS.includes(context.outputFormat)) {
      return 'Choose PNG, JPEG or WebP — each PDF page becomes one image.'
    }
    if (value.pageMode === 'ranges' && value.pageRanges.trim() === '') {
      return 'Enter the pages to render, like 1-3,7, or switch to All pages.'
    }
    return null
  }

  if (context.outputFormat && context.outputFormat !== 'pdf') {
    return 'This operation writes a PDF. Choose PDF as the output format.'
  }

  switch (value.operation) {
    case 'merge':
      return pdfs.length < 2
        ? 'Merge needs at least two PDFs. Add another PDF to the batch.'
        : null
    case 'split':
      if (value.splitMode === 'ranges' && value.pageRanges.trim() === '') {
        return 'Enter the pages to extract, like 1-3,7, or switch to one file per page.'
      }
      if (value.splitMode === 'every' && !(value.splitEvery >= 1)) {
        return 'Pages per file must be at least 1.'
      }
      return null
    case 'rotate':
      return value.pageMode === 'ranges' && value.pageRanges.trim() === ''
        ? 'Enter the pages to rotate, like 1-3,7, or switch to All pages.'
        : null
    case 'reorder':
      if (pdfs.length > 1) {
        return 'Reorder works on one PDF at a time. Stage only the document whose pages you arranged.'
      }
      return value.pageOrder.trim() === ''
        ? 'Arrange pages in the PDF Studio or type an order like 3,1-2.'
        : null
    case 'metadata': {
      const hasInput = Object.values(value.metadata).some((text) => text.trim() !== '')
      if (value.removeAllMetadata) return null
      return !hasInput && !value.metadataLoaded
        ? 'Fill in at least one metadata field, or load the current values first.'
        : null
    }
    case 'password':
      return value.passwordAction === 'set' && value.newPassword === ''
        ? 'Enter the password to put on the output.'
        : null
    case 'watermark':
      return value.watermark.text.trim() === ''
        ? 'Type the watermark text.'
        : null
    case 'pageText':
      return Object.entries(value.pageText)
        .filter(([key]) => key !== 'fontSize' && key !== 'marginMm' && key !== 'startNumber')
        .every(([, text]) => String(text).trim() === '')
        ? 'Fill in at least one header or footer field.'
        : null
    case 'annotate':
      return value.annotation.text.trim() === '' ? 'Type the note text.' : null
    default:
      return null
  }
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

async function pageCountOf(file: FileProbe, password: string): Promise<number> {
  if (file.pageCount && file.pageCount > 0) return file.pageCount
  try {
    const info = await api.inspectPdf(file.path, password)
    if (!info.pageCount) throw new Error('the document reports no pages')
    return info.pageCount
  } catch (reason) {
    throw new Error(`${file.name}: ${message(reason)}`)
  }
}

/** Mirrors the Rust parser: sorted, deduplicated, 1-based. */
export function parsePageList(spec: string, total: number): number[] {
  const text = spec.trim()
  if (text === '' || text.toLowerCase() === 'all') {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const numbers = new Set<number>()
  for (const part of text.split(',')) {
    const token = part.trim()
    if (token === '') continue
    const range = /^(\d*)-(\d*)$/.exec(token)
    if (range) {
      const [start, end] = [range[1], range[2]]
      if (start === '' && end === '') throw new Error(`“${token}” is not a page range.`)
      const from = start === '' ? 1 : Number(start)
      const to = end === '' ? total : Number(end)
      if (from < 1 || to > total || from > to) {
        throw new Error(`“${token}” is outside a document of ${total} page(s).`)
      }
      for (let page = from; page <= to; page += 1) numbers.add(page)
    } else {
      const page = Number(token)
      if (!Number.isInteger(page) || page < 1 || page > total) {
        throw new Error(`“${token}” is outside a document of ${total} page(s).`)
      }
      numbers.add(page)
    }
  }

  if (numbers.size === 0) throw new Error(`“${text}” is not a page selection.`)
  return [...numbers].sort((a, b) => a - b)
}

/** A stem safe to send to the planner, unique within this batch. */
function uniqueStem(base: string, used: Set<string>): string {
  const cleaned =
    base
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/^\.+|\.+$/g, '')
      .trim()
      .slice(0, 100) || 'output'
  let candidate = cleaned
  let suffix = 2
  while (used.has(candidate.toLocaleLowerCase())) {
    candidate = `${cleaned}-${suffix}`.slice(0, 110)
    suffix += 1
  }
  used.add(candidate.toLocaleLowerCase())
  return candidate
}

function stemOf(file: FileProbe): string {
  return fileStem(file.path)
}

function stripPdfExtension(raw: string): string {
  return raw.trim().replace(/\.pdf$/i, '').trim()
}

function metadataPayload(value: PdfSettings): Record<string, string> | undefined {
  const payload: Record<string, string> = {}
  for (const [key, text] of Object.entries(value.metadata) as [keyof PdfMetadata, string][]) {
    if (value.metadataLoaded) payload[key] = text
    else if (text.trim() !== '') payload[key] = text.trim()
  }
  return Object.keys(payload).length > 0 ? payload : undefined
}

/**
 * One job writes one output, so page-level operations expand here: every
 * rendered page, every split part and every per-file edit becomes its own
 * request. The queue never needs a PDF-specific path.
 */
export async function buildPdfRequests(context: PdfBuildContext): Promise<JobRequest[]> {
  const value = asPdfSettings(context.settings)
  const files = context.files
  if (files.length === 0) throw new Error('Add files first.')

  const unreadable = files.find((file) => file.unreadable)
  if (unreadable) {
    throw new Error(`${unreadable.name} cannot be read: ${unreadable.unreadable ?? 'unknown error'}`)
  }
  const unsupported = unsupportedInputs(files)[0]
  if (unsupported) {
    throw new Error(`${unsupported.name} is not a PDF or an image this page can place.`)
  }
  if (isMixed(files)) {
    throw new Error(
      'This page works on PDFs or on images, not both at once. Remove one group from the batch.',
    )
  }

  const pdfs = pdfInputs(files)
  const images = imageInputs(files)
  const outputDirectory = context.outputDirectory
  const used = new Set(files.map((file) => fileStem(file.path).toLocaleLowerCase()))
  const requests: JobRequest[] = []

  const pdfSettings = (patch: Partial<PdfSettings>): ConversionSettings => {
    const settings: Record<string, unknown> = { ...value, ...patch }
    if (value.operation === 'metadata') settings.metadata = metadataPayload(value)
    return settings
  }

  if (pdfs.length === 0) {
    // Images-only batches always place images into a PDF; the panel presents the
    // operation as Convert regardless of what a previous batch selected.
    const firstImage = images[0]
    if (value.combineImages && images.length > 1 && firstImage) {
      const requested = stripPdfExtension(value.outputName)
      requests.push({
        inputPath: firstImage.path,
        extraInputs: images.slice(1).map((file) => file.path),
        outputFormat: 'pdf',
        settings: pdfSettings({ operation: 'convert' }),
        outputDirectory,
        outputName: uniqueStem(requested || `${stemOf(firstImage)}-combined`, used),
      })
      return requests
    }
    for (const file of images) {
      const requested = stripPdfExtension(value.outputName)
      requests.push({
        inputPath: file.path,
        outputFormat: 'pdf',
        settings: pdfSettings({ operation: 'convert' }),
        outputDirectory,
        outputName: requested ? uniqueStem(requested, used) : undefined,
      })
    }
    return requests
  }

  if (value.operation === 'convert') {
    if (!context.outputFormat || !RASTER_OUTPUTS.includes(context.outputFormat)) {
      throw new Error('Choose PNG, JPEG or WebP — each PDF page becomes one image.')
    }
    for (const file of pdfs) {
      const total = await pageCountOf(file, value.password)
      const pages = parsePageList(value.pageMode === 'all' ? '' : value.pageRanges, total)
      for (const page of pages) {
        requests.push({
          inputPath: file.path,
          outputFormat: context.outputFormat,
          settings: pdfSettings({ operation: 'convert', pageRanges: String(page) }),
          outputDirectory,
          outputName: uniqueStem(`${stemOf(file)}-page-${page}`, used),
        })
      }
    }
    return requests
  }

  if (value.operation === 'split') {
    for (const file of pdfs) {
      if (value.splitMode === 'ranges') {
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({ operation: 'split', pageRanges: value.pageRanges }),
          outputDirectory,
          outputName: uniqueStem(`${stemOf(file)}-extract`, used),
        })
        continue
      }
      const total = await pageCountOf(file, value.password)
      if (value.splitMode === 'individual') {
        for (let page = 1; page <= total; page += 1) {
          requests.push({
            inputPath: file.path,
            outputFormat: 'pdf',
            settings: pdfSettings({ operation: 'split', pageRanges: String(page) }),
            outputDirectory,
            outputName: uniqueStem(`${stemOf(file)}-page-${page}`, used),
          })
        }
        continue
      }
      const every = Math.max(1, Math.floor(value.splitEvery))
      for (let start = 1; start <= total; start += every) {
        const end = Math.min(total, start + every - 1)
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({ operation: 'split', pageRanges: `${start}-${end}` }),
          outputDirectory,
          outputName: uniqueStem(`${stemOf(file)}-pages-${start}-${end}`, used),
        })
      }
    }
    return requests
  }

  if (value.operation === 'merge') {
    const firstPdf = pdfs[0]
    if (pdfs.length < 2 || !firstPdf) throw new Error('Merge needs at least two PDFs.')
    const requested = stripPdfExtension(value.outputName)
    requests.push({
      inputPath: firstPdf.path,
      extraInputs: pdfs.slice(1).map((file) => file.path),
      outputFormat: 'pdf',
      settings: pdfSettings({ operation: 'merge' }),
      outputDirectory,
      outputName: uniqueStem(requested || `${stemOf(firstPdf)}-merged`, used),
    })
    return requests
  }

  if (value.operation === 'reorder' && pdfs.length !== 1) {
    throw new Error('Reorder works on one PDF at a time. Stage only the document whose pages you arranged.')
  }

  for (const file of pdfs) {
    const stem = stemOf(file)
    switch (value.operation) {
      case 'rotate':
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({
            operation: 'rotate',
            pageRanges: value.pageMode === 'all' ? '' : value.pageRanges,
          }),
          outputDirectory,
          outputName: uniqueStem(`${stem}-rotated`, used),
        })
        break
      case 'reorder':
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({ operation: 'reorder', pageRanges: value.pageOrder }),
          outputDirectory,
          outputName: uniqueStem(`${stem}-reordered`, used),
        })
        break
      case 'compress':
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({ operation: 'compress' }),
          outputDirectory,
          outputName: uniqueStem(`${stem}-compressed`, used),
        })
        break
      case 'metadata':
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({ operation: 'metadata' }),
          outputDirectory,
          outputName: uniqueStem(`${stem}-metadata`, used),
        })
        break
      case 'password':
        if (value.passwordAction === 'set' && value.newPassword === '') {
          throw new Error('Enter the password to put on the output.')
        }
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({
            operation: 'password',
            newPassword: value.passwordAction === 'set' ? value.newPassword : '',
            ownerPassword: value.passwordAction === 'set' ? value.ownerPassword : '',
          }),
          outputDirectory,
          outputName: uniqueStem(
            `${stem}-${value.passwordAction === 'set' ? 'protected' : 'unlocked'}`,
            used,
          ),
        })
        break
      case 'watermark':
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({
            operation: 'watermark',
            pageRanges: value.pageMode === 'all' ? '' : value.pageRanges,
          }),
          outputDirectory,
          outputName: uniqueStem(`${stem}-watermarked`, used),
        })
        break
      case 'pageText':
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({
            operation: 'pageText',
            pageRanges: value.pageMode === 'all' ? '' : value.pageRanges,
          }),
          outputDirectory,
          outputName: uniqueStem(`${stem}-numbered`, used),
        })
        break
      case 'annotate':
        requests.push({
          inputPath: file.path,
          outputFormat: 'pdf',
          settings: pdfSettings({
            operation: 'annotate',
            pageRanges: value.pageMode === 'all' ? '' : value.pageRanges,
          }),
          outputDirectory,
          outputName: uniqueStem(`${stem}-annotated`, used),
        })
        break
    }
  }

  return requests
}
