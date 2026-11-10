import { api } from '@/utils/api'
import type { OcrCapabilities } from '@/types/converter'
import { useCallback, useEffect, useState } from 'react'

let pending: Promise<OcrCapabilities> | null = null

/** One shared probe: the page and its panel must not each spawn Tesseract. */
export function loadOcrCapabilities(): Promise<OcrCapabilities> {
  pending ??= api.ocrCapabilities().catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}

/** Called after an engine rescan so a newly installed language pack is seen. */
export function resetOcrCapabilities(): void {
  pending = null
}

export function useOcrCapabilities(): {
  capabilities: OcrCapabilities | null
  error: string | null
  /** Re-probes after a language pack was installed or an engine rescan ran. */
  reload: () => void
} {
  const [capabilities, setCapabilities] = useState<OcrCapabilities | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState(0)

  useEffect(() => {
    let active = true
    setCapabilities(null)
    setError(null)
    void loadOcrCapabilities()
      .then((next) => {
        if (active) setCapabilities(next)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      active = false
    }
  }, [token])

  const reload = useCallback(() => {
    resetOcrCapabilities()
    setToken((value) => value + 1)
  }, [])

  return { capabilities, error, reload }
}
