import { ConverterPage } from '@/components/conversion/ConverterPage'
import { DocumentSettingsPanel } from '@/features/documents/DocumentSettingsPanel'
import { asDocumentSettings, DEFAULT_DOCUMENT_SETTINGS } from '@/features/documents/settings'
import { acceptsFor } from '@/utils/format'

// Output names are per-batch, so they never enter a preset row.
const BATCH_ONLY_KEYS = ['outputNames']

export function DocumentsPage() {
  return (
    <ConverterPage
      page="documents"
      title="Documents"
      description="Word, OpenDocument, RTF, Excel and PowerPoint files to PDF or to each other. Every conversion runs a local LibreOffice copy."
      accepts={acceptsFor('/documents')}
      engine="document"
      defaults={DEFAULT_DOCUMENT_SETTINGS}
      Panel={DocumentSettingsPanel}
      omitPresetKeys={BATCH_ONLY_KEYS}
      buildRequests={({ files, settings, outputFormat, outputDirectory }) => {
        const { outputNames, ...engineSettings } = asDocumentSettings(settings)
        return files.map((file) => {
          const name = outputNames[file.path]?.trim()
          return {
            inputPath: file.path,
            outputFormat: outputFormat!,
            settings: engineSettings,
            outputDirectory,
            outputName: name ? name : undefined,
          }
        })
      }}
    />
  )
}
