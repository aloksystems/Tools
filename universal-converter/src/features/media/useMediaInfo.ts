import type { MediaInfo } from '@/types/converter'
import { api } from '@/utils/api'
import { useEffect, useState } from 'react'

const cache = new Map<string, Promise<MediaInfo>>()

/** ffprobe is cheap per file but not free; the panel and Studio share one read. */
export function loadMediaInfo(path: string): Promise<MediaInfo> {
  let request = cache.get(path)
  if (!request) {
    request = api.inspectMedia(path).catch((error: unknown) => {
      cache.delete(path)
      throw error
    })
    cache.set(path, request)
  }
  return request
}

export function useMediaInfo(path: string | undefined): {
  info: MediaInfo | null
  loading: boolean
  error: string | null
  reload: () => void
} {
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!path) {
      setInfo(null)
      setError(null)
      return
    }
    if (generation > 0) cache.delete(path)
    let active = true
    setLoading(true)
    setError(null)
    void loadMediaInfo(path)
      .then((next) => {
        if (active) setInfo(next)
      })
      .catch((reason: unknown) => {
        if (active) {
          setInfo(null)
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [path, generation])

  return { info, loading, error, reload: () => setGeneration((value) => value + 1) }
}
