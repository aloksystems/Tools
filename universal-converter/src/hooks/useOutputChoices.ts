import { useAppStore } from '@/stores/appStore'
import type { FormatId, FormatRoute } from '@/types/converter'
import { useEffect, useMemo, useState } from 'react'

export interface OutputChoice {
  format: FormatId
  engineLabel: string
  note?: string | null
}

/**
 * Output formats reachable from *every* staged input, using only engines this
 * machine can run. A batch therefore never offers a format that would fail half
 * of its files.
 */
export function useOutputChoices(formats: FormatId[]): {
  choices: OutputChoice[]
  loading: boolean
  error: string | null
  /** True once the current batch's routes have been resolved. */
  settled: boolean
} {
  const loadRoutes = useAppStore((state) => state.loadRoutes)
  const engines = useAppStore((state) => state.engines)
  const [routesByFormat, setRoutesByFormat] = useState<FormatRoute[][]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settledKey, setSettledKey] = useState<string | null>(null)

  const key = formats.join(',')

  useEffect(() => {
    if (formats.length === 0) {
      setRoutesByFormat([])
      setSettledKey(key)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void Promise.all(formats.map((format) => loadRoutes(format)))
      .then((tables) => {
        if (!cancelled) setRoutesByFormat(tables)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setSettledKey(key)
        }
      })
    // Re-runs when the format set changes or the engines were re-scanned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, engines, loadRoutes])

  const choices = useMemo<OutputChoice[]>(() => {
    if (routesByFormat.length === 0 || routesByFormat.length !== formats.length) return []

    const runnable = routesByFormat.map((routes) => routes.filter((route) => route.available))
    const candidates = unique(runnable[0]?.map((route) => route.output) ?? [])

    const results: OutputChoice[] = []
    for (const output of candidates) {
      const matches = runnable.map((routes) => routes.find((route) => route.output === output))
      // Every input in the batch must reach this output; otherwise leave it out.
      if (matches.some((match) => match === undefined)) continue
      const first = matches[0]
      if (!first) continue
      results.push({
        format: output,
        engineLabel: first.engineLabel,
        note: matches.find((match) => match?.note)?.note ?? null,
      })
    }
    return results.sort((a, b) => a.format.localeCompare(b.format))
  }, [formats.length, routesByFormat])

  return { choices, loading, error, settled: settledKey === key }
}

function unique(formats: FormatId[]): FormatId[] {
  const seen: FormatId[] = []
  for (const format of formats) if (!seen.includes(format)) seen.push(format)
  return seen
}
