import { ConverterPage } from '@/components/conversion/ConverterPage'
import { usePdfCapabilities } from '@/features/pdf/capabilities'
import { PdfSettingsPanel } from '@/features/pdf/PdfSettingsPanel'
import { PdfStudio } from '@/features/pdf/PdfStudio'
import {
  buildPdfRequests,
  filterPdfChoices,
  forcedPdfOutput,
  pdfBlocker,
} from '@/features/pdf/requests'
import { DEFAULT_PDF_SETTINGS } from '@/features/pdf/settings'
import { acceptsFor } from '@/utils/format'

export function PdfPage() {
  const { capabilities } = usePdfCapabilities()

  return (
    <ConverterPage
      page="pdf"
      title="PDF"
      description="Images into PDF, PDF pages into images, plus merge, split, rotate, reorder, compress, metadata and password tools."
      accepts={acceptsFor('/pdf')}
      engine="pdf"
      defaults={DEFAULT_PDF_SETTINGS}
      Panel={PdfSettingsPanel}
      Studio={PdfStudio}
      omitPresetKeys={['password', 'newPassword', 'ownerPassword']}
      filterChoices={filterPdfChoices}
      forcedOutput={forcedPdfOutput}
      blocker={(context) => pdfBlocker(context, capabilities)}
      buildRequests={buildPdfRequests}
      submitLabel={(fileCount) =>
        `Run on ${fileCount} file${fileCount === 1 ? '' : 's'}`
      }
    />
  )
}
