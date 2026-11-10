use super::{
    AUDIO_TIMEOUT, choose_audio_stream, container_args, muxer_for, resolve_audio_codec,
    settings::MediaSettings, validate_trim,
};
use crate::core::format::FormatId;
use crate::engines::ffmpeg::{self, MediaInfo, Tools};
use crate::engines::{EngineContext, checked_cancel};
use crate::error::ConversionError;
use std::path::Path;

/// Bitrate used when the user leaves the setting on "Automatic" (0 kbps).
fn default_bitrate(format: FormatId) -> u32 {
    match format {
        FormatId::Mp3 => 192,
        FormatId::Aac | FormatId::M4a | FormatId::Wma => 192,
        FormatId::Ogg => 160,
        FormatId::Opus => 128,
        _ => 0,
    }
}

fn is_lossless(format: FormatId) -> bool {
    matches!(
        format,
        FormatId::Wav | FormatId::Flac | FormatId::Aiff | FormatId::Alac
    )
}

fn filters(settings: &MediaSettings) -> Vec<String> {
    let mut filters = Vec::new();
    // Clamped so a typo cannot ask for 1000× gain or a silent track.
    if settings.volume_percent != 100 {
        let gain = (settings.volume_percent.clamp(0, 200) as f64) / 100.0;
        filters.push(format!("volume={gain:.3}"));
    }
    if settings.normalize {
        // EBU R128 single pass: predictable loudness without a first analysis
        // run, which would double the time for a batch.
        filters.push("loudnorm=I=-16:TP=-1.5:LRA=11".to_owned());
    }
    filters
}

/// Audio → audio, or the audio track of a video → audio. The stream is mapped
/// by its absolute ffprobe index, so multi-track files extract what was chosen.
pub(crate) fn convert(
    tools: &Tools,
    ctx: &EngineContext<'_>,
    info: &MediaInfo,
    settings: &MediaSettings,
    output: &Path,
) -> Result<(), ConversionError> {
    checked_cancel(ctx.cancel)?;
    let format = ctx.job.output_format;
    let stream = choose_audio_stream(info, settings.audio_stream_index)?;
    validate_trim(info, settings.start_ms, settings.duration_ms)?;

    let encoders = ffmpeg::encoders(tools)?;
    let codec = resolve_audio_codec(format, &settings.codec, &encoders)?;

    let input = Path::new(&ctx.job.input_path);
    let mut args = ffmpeg::base_args(input, settings.start_ms, settings.duration_ms);
    args.push("-map".to_owned());
    args.push(format!("0:{}", stream.index));
    args.extend(["-vn", "-sn", "-dn"].iter().map(|flag| (*flag).to_owned()));

    args.push("-c:a".to_owned());
    args.push(codec.encoder.to_owned());

    if !is_lossless(format) {
        let requested = if settings.bitrate_kbps == 0 {
            default_bitrate(format)
        } else {
            settings.bitrate_kbps
        };
        let bitrate = requested.clamp(32, 512);
        args.push("-b:a".to_owned());
        args.push(format!("{bitrate}k"));
    }

    if settings.sample_rate_hz >= 8000 {
        args.push("-ar".to_owned());
        args.push(settings.sample_rate_hz.min(192_000).to_string());
    }
    if matches!(settings.channels, 1 | 2) {
        args.push("-ac".to_owned());
        args.push(settings.channels.to_string());
    }

    let chain = filters(settings);
    if !chain.is_empty() {
        args.push("-af".to_owned());
        args.push(chain.join(","));
    }

    if settings.preserve_metadata {
        args.extend(
            ["-map_metadata", "0"]
                .iter()
                .map(|value| (*value).to_owned()),
        );
    } else {
        args.extend(
            ["-map_metadata", "-1"]
                .iter()
                .map(|value| (*value).to_owned()),
        );
    }
    args.extend(container_args(format));
    args.push("-f".to_owned());
    args.push(muxer_for(format)?.to_owned());
    args.push(output.display().to_string());

    let total = ffmpeg::effective_duration_ms(info, settings.start_ms, settings.duration_ms);
    ffmpeg::run(
        tools,
        &args,
        ctx.cancel,
        ctx.progress,
        total,
        AUDIO_TIMEOUT,
        "Encoding audio",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lossless_targets_ignore_the_bitrate_setting() {
        assert!(is_lossless(FormatId::Flac));
        assert!(is_lossless(FormatId::Wav));
        assert!(!is_lossless(FormatId::Opus));
    }

    #[test]
    fn volume_and_normalise_compose_into_one_filter_chain() {
        let settings = MediaSettings {
            volume_percent: 150,
            normalize: true,
            ..MediaSettings::default()
        };
        let chain = filters(&settings).join(",");
        assert!(chain.contains("volume=1.500"));
        assert!(chain.contains("loudnorm="));
    }

    #[test]
    fn default_bitrate_is_only_for_lossy_formats() {
        assert_eq!(default_bitrate(FormatId::Opus), 128);
        assert_eq!(default_bitrate(FormatId::Ogg), 160);
        assert_eq!(default_bitrate(FormatId::Flac), 0);
    }
}
