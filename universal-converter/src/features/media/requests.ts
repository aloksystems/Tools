import type { BuildContext } from '@/components/conversion/ConverterPage'
import type { JobRequest } from '@/utils/api'
import { FORMAT_EXTENSIONS } from '@/utils/extensions'
import type { FormatId } from '@/types/converter'

function stripExtension(name: string, format: FormatId): string {
  const lower = name.toLowerCase()
  for (const extension of FORMAT_EXTENSIONS[format] ?? []) {
    if (lower.endsWith(`.${extension}`)) return name.slice(0, -(extension.length + 1))
  }
  return name
}

/**
 * Media jobs are one file in, one file out. A custom name is offered only for a
 * single staged file; a batch must keep one stem per input or every job would
 * race for the same destination.
 */
export function buildMediaRequests(context: BuildContext): JobRequest[] {
  const outputFormat = context.outputFormat
  if (!outputFormat) return []
  const requested =
    typeof context.settings.outputName === 'string' ? context.settings.outputName.trim() : ''
  const outputName =
    context.files.length === 1 && requested
      ? stripExtension(requested, outputFormat)
      : undefined

  return context.files.map((file) => ({
    inputPath: file.path,
    outputFormat,
    settings: context.settings,
    outputDirectory: context.outputDirectory,
    outputName,
  }))
}
