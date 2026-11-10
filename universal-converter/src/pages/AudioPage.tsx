import { ConverterPage } from '@/components/conversion/ConverterPage'
import { AudioSettingsPanel } from '@/features/audio/AudioSettingsPanel'
import { DEFAULT_AUDIO_SETTINGS } from '@/features/audio/settings'
import {
  filterMediaChoices,
  mediaBlocker,
  useMediaCapabilities,
} from '@/features/media/capabilities'
import { MediaInspector } from '@/features/media/MediaInspector'
import { buildMediaRequests } from '@/features/media/requests'
import { acceptsFor } from '@/utils/format'
import type { ChoiceContext } from '@/components/conversion/ConverterPage'
import type { OutputChoice } from '@/hooks/useOutputChoices'
import { useCallback } from 'react'

export function AudioPage() {
  const { capabilities } = useMediaCapabilities()

  const filterChoices = useCallback(
    (choices: OutputChoice[]) => filterMediaChoices(choices, capabilities),
    [capabilities],
  )
  const blocker = useCallback(
    (context: ChoiceContext) => mediaBlocker(context.outputFormat, capabilities),
    [capabilities],
  )

  return (
    <ConverterPage
      page="audio"
      title="Audio"
      description="Convert MP3, WAV, FLAC, AAC, M4A, WMA, AIFF, ALAC, OGG and Opus with bitrate, sample-rate, channel and trim control. Powered by FFmpeg, locally."
      accepts={acceptsFor('/audio')}
      engine="media"
      defaults={DEFAULT_AUDIO_SETTINGS}
      Panel={AudioSettingsPanel}
      Studio={MediaInspector}
      omitPresetKeys={['outputName']}
      filterChoices={filterChoices}
      blocker={blocker}
      buildRequests={buildMediaRequests}
    />
  )
}
