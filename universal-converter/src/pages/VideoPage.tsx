import { ConverterPage } from '@/components/conversion/ConverterPage'
import { AudioSettingsPanel } from '@/features/audio/AudioSettingsPanel'
import { DEFAULT_VIDEO_SETTINGS } from '@/features/video/settings'
import { GifSettingsPanel, VideoSettingsPanel } from '@/features/video/VideoSettingsPanel'
import {
  filterMediaChoices,
  mediaBlocker,
  useMediaCapabilities,
} from '@/features/media/capabilities'
import { MediaInspector } from '@/features/media/MediaInspector'
import { buildMediaRequests } from '@/features/media/requests'
import { acceptsFor, isAudioFormat } from '@/utils/format'
import type { ChoiceContext } from '@/components/conversion/ConverterPage'
import type { SettingsPanelProps } from '@/features/types'
import type { OutputChoice } from '@/hooks/useOutputChoices'
import { useCallback } from 'react'

/**
 * The output decides which options make sense: a clip turned into a GIF uses
 * the palette controls, audio extraction reuses the audio panel, and every
 * other video output keeps the full encoder panel.
 */
function VideoPanel(props: SettingsPanelProps) {
  if (props.outputFormat === 'gif') return <GifSettingsPanel {...props} />
  if (props.outputFormat && isAudioFormat(props.outputFormat)) {
    return <AudioSettingsPanel {...props} />
  }
  return <VideoSettingsPanel {...props} />
}

export function VideoPage() {
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
      page="video"
      title="Video"
      description="Convert MP4, MKV, MOV, AVI, WebM, WMV, FLV, MPEG and 3GP, extract a chosen audio track, or turn a short clip into a GIF. Powered by FFmpeg."
      accepts={acceptsFor('/video')}
      engine="media"
      defaults={DEFAULT_VIDEO_SETTINGS}
      Panel={VideoPanel}
      Studio={MediaInspector}
      omitPresetKeys={['outputName']}
      filterChoices={filterChoices}
      blocker={blocker}
      buildRequests={buildMediaRequests}
    />
  )
}
