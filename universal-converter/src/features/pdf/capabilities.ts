import { api } from '@/utils/api'
import type { PdfCapability } from '@/types/converter'
import { useEffect, useState } from 'react'

let pending: Promise<PdfCapability[]> | null = null

/** One IPC read shared by the page, its panel and the Studio. */
export function loadPdfCapabilities(): Promise<PdfCapability[]> {
  pending ??= api.pdfCapabilities().catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}

/** Called after an engine rescan so a newly installed qpdf is noticed. */
export function resetPdfCapabilities(): void {
  pending = null
}

/** One sentence naming the tool and how to supply it. */
export function missingDependencyNotice(capability: PdfCapability): string {
  const dependency = capability.missingDependency ?? 'a required dependency'
  return `${capability.label} needs ${dependency}. Put it in resources/ or set its UC_*_PATH override, then rescan engines in Settings.`
}

export function usePdfCapabilities(): {
  capabilities: PdfCapability[] | null
  error: string | null
} {
  const [capabilities, setCapabilities] = useState<PdfCapability[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void loadPdfCapabilities()
      .then((next) => {
        if (active) setCapabilities(next)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      active = false
    }
  }, [])

  return { capabilities, error }
}
