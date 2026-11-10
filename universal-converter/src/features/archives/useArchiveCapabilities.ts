import { api } from '@/utils/api'
import { errorMessage } from '@/utils/errors'
import { isTauriRuntime } from '@/utils/tauri'
import { useEffect, useState } from 'react'
import type { ArchiveCapabilities } from '@/types/converter'

/** What this machine's 7-Zip can create and read, fetched once per Studio mount. */
export function useArchiveCapabilities() {
  const [capabilities, setCapabilities] = useState<ArchiveCapabilities | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauriRuntime()) {
      setError('Archive jobs run in the Rust core. Start the desktop app with `npm run tauri dev`.')
      return
    }
    let active = true
    void api
      .archiveCapabilities()
      .then((next) => {
        if (active) setCapabilities(next)
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason))
      })
    return () => {
      active = false
    }
  }, [])

  return { capabilities, error }
}
