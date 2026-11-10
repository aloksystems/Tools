import type { OutputChoice } from '@/hooks/useOutputChoices'
import type {
  CodecSupport,
  FormatId,
  FormatSupport,
  HardwareEncoder,
  MediaCapabilities,
} from '@/types/converter'
import { api } from '@/utils/api'
import { useEffect, useMemo, useState } from 'react'

let pending: Promise<MediaCapabilities> | null = null

/** One IPC read shared by the page, its panel and the Studio. */
export function loadMediaCapabilities(): Promise<MediaCapabilities> {
  pending ??= api.mediaCapabilities().catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}

/** Called after an engine rescan so a replaced FFmpeg is detected. */
export function resetMediaCapabilities(): void {
  pending = null
}

export function useMediaCapabilities(): {
  capabilities: MediaCapabilities | null
  error: string | null
} {
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void loadMediaCapabilities()
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

export function formatSupport(
  capabilities: MediaCapabilities | null,
  format: FormatId,
): FormatSupport | null {
  return capabilities?.formats.find((entry) => entry.format === format) ?? null
}

/** True when this build has at least one encoder for the container. */
export function canWrite(capabilities: MediaCapabilities | null, format: FormatId): boolean {
  if (!capabilities) return true
  return formatSupport(capabilities, format)?.available === true
}

export function codecOptions(
  capabilities: MediaCapabilities | null,
  format: FormatId,
): CodecSupport[] {
  return formatSupport(capabilities, format)?.codecs ?? []
}

/** Audio codecs a video container can carry. Empty for audio outputs. */
export function audioCodecOptions(
  capabilities: MediaCapabilities | null,
  format: FormatId,
): CodecSupport[] {
  return formatSupport(capabilities, format)?.audioCodecs ?? []
}

/** Hardware encoders that really encoded a frame on this machine. */
export function testedHardware(
  capabilities: MediaCapabilities | null,
  codec?: string,
): HardwareEncoder[] {
  return (capabilities?.hardware ?? []).filter(
    (encoder) => encoder.available && (codec === undefined || encoder.codec === codec),
  )
}

export function useCodecOptions(
  capabilities: MediaCapabilities | null,
  format: FormatId | null,
): CodecSupport[] {
  return useMemo(
    () => (format ? codecOptions(capabilities, format) : []),
    [capabilities, format],
  )
}

/**
 * Hides outputs this FFmpeg build cannot encode. While capabilities are still
 * loading everything stays visible, so the select does not flicker empty.
 */
export function filterMediaChoices(
  choices: OutputChoice[],
  capabilities: MediaCapabilities | null,
): OutputChoice[] {
  if (!capabilities?.available) return choices
  return choices.filter((choice) => canWrite(capabilities, choice.format))
}

/** Why the chosen output cannot be written, or null when it can. */
export function mediaBlocker(
  outputFormat: FormatId | null,
  capabilities: MediaCapabilities | null,
): string | null {
  if (!outputFormat || !capabilities) return null
  if (!capabilities.available) {
    return capabilities.reason ?? 'FFmpeg is not available, so media cannot be converted.'
  }
  const support = formatSupport(capabilities, outputFormat)
  if (support && !support.available) {
    return support.reason ?? `This FFmpeg build has no encoder for ${outputFormat}.`
  }
  return null
}
