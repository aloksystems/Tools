use super::{
    VIDEO_TIMEOUT, choose_audio_stream, container_args, muxer_for, resolve_video_audio_codec,
    resolve_video_codec,
    settings::{MediaSettings, QualityPreset},
    validate_trim,
};
use crate::core::format::FormatId;
use crate::engines::ffmpeg::{self, HardwareEncoder, MediaInfo, Tools};
use crate::engines::{EngineContext, checked_cancel};
use crate::error::ConversionError;
use std::path::Path;

/// Encoder speed for the x264/x265 presets. "Fast" means quicker to encode,
/// not a larger promise about quality.
fn encoder_speed(quality: QualityPreset) -> &'static str {
    match quality {
        QualityPreset::Fast => "veryfast",
        QualityPreset::Balanced => "medium",
        QualityPreset::Compression => "slow",
        QualityPreset::High => "slow",
        QualityPreset::Custom => "medium",
    }
}

fn vp9_cpu_used(quality: QualityPreset) -> &'static str {
    match quality {
        QualityPreset::Fast => "5",
        QualityPreset::Balanced => "3",
        QualityPreset::Compression => "2",
        QualityPreset::High => "1",
        QualityPreset::Custom => "3",
    }
}

fn svt_preset(quality: QualityPreset) -> &'static str {
    match quality {
        QualityPreset::Fast => "10",
        QualityPreset::Balanced => "8",
        QualityPreset::Compression => "6",
        QualityPreset::High => "6",
        QualityPreset::Custom => "8",
    }
}

fn aom_cpu_used(quality: QualityPreset) -> &'static str {
    match quality {
        QualityPreset::Fast => "8",
        QualityPreset::Balanced => "6",
        QualityPreset::Compression => "5",
        QualityPreset::High => "4",
        QualityPreset::Custom => "6",
    }
}

fn hardware_bitrate(settings: &MediaSettings) -> u32 {
    if settings.video_bitrate_kbps > 0 {
        return settings.video_bitrate_kbps.clamp(200, 200_000);
    }
    let base = match settings.quality() {
        QualityPreset::Fast => 4_000.0,
        QualityPreset::Balanced => 8_000.0,
        QualityPreset::Compression => 3_000.0,
        QualityPreset::High => 16_000.0,
        QualityPreset::Custom => 8_000.0,
    };
    let height = if settings.target_height_px > 0 {
        settings.target_height_px
    } else {
        1080
    };
    let scaled = base * (height as f64 / 1080.0).powi(2);
    scaled.round().clamp(500.0, 100_000.0) as u32
}

fn push_number(args: &mut Vec<String>, flag: &str, value: impl ToString) {
    args.push(flag.to_owned());
    args.push(value.to_string());
}

/// CRF for software encoders, real bitrate for hardware encoders (whose CRF
/// scales differ per vendor), and a quality scale for legacy codecs.
fn quality_args(
    codec: &super::ResolvedCodec,
    settings: &MediaSettings,
    hardware: Option<&HardwareEncoder>,
) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(hardware) = hardware {
        push_number(
            &mut args,
            "-b:v",
            format!("{}k", hardware_bitrate(settings)),
        );
        if hardware.encoder.ends_with("_nvenc") {
            args.extend(["-rc".to_owned(), "vbr".to_owned()]);
        }
        return args;
    }

    if settings.video_bitrate_kbps > 0 {
        push_number(
            &mut args,
            "-b:v",
            format!("{}k", settings.video_bitrate_kbps.clamp(100, 200_000)),
        );
        return args;
    }

    let crf = settings.crf_value();
    let quality = settings.quality();
    match codec.id {
        "h264" | "h265" => {
            push_number(&mut args, "-crf", crf);
            push_number(&mut args, "-preset", encoder_speed(quality));
        }
        "vp9" | "vp8" => {
            push_number(&mut args, "-crf", crf);
            args.extend(["-b:v".to_owned(), "0".to_owned()]);
            args.extend(["-row-mt".to_owned(), "1".to_owned()]);
            args.extend(["-deadline".to_owned(), "good".to_owned()]);
            push_number(&mut args, "-cpu-used", vp9_cpu_used(quality));
        }
        "av1" if codec.encoder == "libsvtav1" => {
            push_number(&mut args, "-crf", crf);
            push_number(&mut args, "-preset", svt_preset(quality));
        }
        "av1" => {
            push_number(&mut args, "-crf", crf);
            args.extend(["-b:v".to_owned(), "0".to_owned()]);
            push_number(&mut args, "-cpu-used", aom_cpu_used(quality));
        }
        _ => {
            push_number(&mut args, "-q:v", settings.legacy_quality());
        }
    }
    args
}

fn audio_args(
    format: FormatId,
    info: &MediaInfo,
    settings: &MediaSettings,
    encoders: &[String],
) -> Result<Vec<String>, ConversionError> {
    if settings.remove_audio || info.audio_streams().is_empty() {
        return Ok(vec!["-an".to_owned()]);
    }
    let stream = choose_audio_stream(info, settings.audio_stream_index)?;
    let codec = resolve_video_audio_codec(format, &settings.audio_codec, encoders)?;
    let bitrate = if settings.audio_bitrate_kbps > 0 {
        settings.audio_bitrate_kbps.clamp(32, 512)
    } else {
        match format {
            FormatId::Webm | FormatId::Flv | FormatId::Mpeg => 128,
            _ => 192,
        }
    };
    Ok(vec![
        "-map".to_owned(),
        format!("0:{}", stream.index),
        "-c:a".to_owned(),
        codec.encoder.to_owned(),
        "-b:a".to_owned(),
        format!("{bitrate}k"),
    ])
}

fn scale_filter(target_height: u32) -> String {
    if target_height > 0 {
        // min() keeps small sources from being upscaled; the second scale
        // rounds both sides down to even numbers for 4:2:0 encoders.
        format!(
            "scale=-2:min({}\\,ih),scale=trunc(iw/2)*2:trunc(ih/2)*2",
            target_height.clamp(144, 4320)
        )
    } else {
        "scale=trunc(iw/2)*2:trunc(ih/2)*2".to_owned()
    }
}

fn hardware_choice(
    tools: &Tools,
    settings: &MediaSettings,
    codec_id: &str,
) -> Result<Option<HardwareEncoder>, ConversionError> {
    if !settings.hardware_acceleration || !matches!(codec_id, "h264" | "h265") {
        return Ok(None);
    }
    let family = if codec_id == "h265" { "hevc" } else { "h264" };
    let tested = ffmpeg::hardware_encoders(tools)?;
    Ok(tested
        .into_iter()
        .find(|encoder| encoder.codec == family && encoder.available))
}

/// Video → video. Maps one real video stream (cover art excluded), re-encodes
/// the chosen audio track unless removed, and validates the result afterwards.
pub(crate) fn convert(
    tools: &Tools,
    ctx: &EngineContext<'_>,
    info: &MediaInfo,
    settings: &MediaSettings,
    output: &Path,
) -> Result<(), ConversionError> {
    checked_cancel(ctx.cancel)?;
    let format = ctx.job.output_format;
    let video = info.primary_video().ok_or_else(|| {
        ConversionError::Other(format!(
            "{} has no video track",
            Path::new(&ctx.job.input_path)
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| "the input".to_owned())
        ))
    })?;
    validate_trim(info, settings.start_ms, settings.duration_ms)?;

    let encoders = ffmpeg::encoders(tools)?;
    let codec = resolve_video_codec(format, &settings.video_codec, &encoders)?;
    let hardware = hardware_choice(tools, settings, codec.id)?;
    if settings.hardware_acceleration && hardware.is_none() {
        log::info!(
            "hardware acceleration requested, but no tested {} encoder is available; using {}",
            codec.id,
            codec.encoder
        );
    }

    let input = Path::new(&ctx.job.input_path);
    let mut args = ffmpeg::base_args(input, settings.start_ms, settings.duration_ms);
    args.push("-map".to_owned());
    args.push(format!("0:{}", video.index));
    args.extend(["-sn".to_owned(), "-dn".to_owned()]);

    args.push("-c:v".to_owned());
    args.push(
        hardware
            .as_ref()
            .map(|encoder| encoder.encoder.clone())
            .unwrap_or_else(|| codec.encoder.to_owned()),
    );
    args.extend(quality_args(&codec, settings, hardware.as_ref()));

    if codec.id == "h265" && matches!(format, FormatId::Mp4 | FormatId::Mov | FormatId::ThreeGp) {
        args.extend(["-tag:v".to_owned(), "hvc1".to_owned()]);
    }
    if settings.frame_rate > 0 {
        push_number(&mut args, "-r", settings.frame_rate.clamp(1, 240));
    }
    args.push("-vf".to_owned());
    args.push(scale_filter(settings.target_height_px));
    args.extend(["-pix_fmt".to_owned(), "yuv420p".to_owned()]);

    args.extend(audio_args(format, info, settings, &encoders)?);

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
        VIDEO_TIMEOUT,
        "Encoding video",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hardware_bitrate_scales_with_height() {
        let settings = MediaSettings {
            quality_preset: "balanced".to_owned(),
            target_height_px: 2160,
            ..MediaSettings::default()
        };
        assert!(hardware_bitrate(&settings) > 8_000);
        let small = MediaSettings {
            quality_preset: "balanced".to_owned(),
            target_height_px: 480,
            ..MediaSettings::default()
        };
        assert!(hardware_bitrate(&small) < 8_000);
    }

    #[test]
    fn scale_filter_never_upscales_and_keeps_even_sides() {
        assert_eq!(
            scale_filter(720),
            "scale=-2:min(720\\,ih),scale=trunc(iw/2)*2:trunc(ih/2)*2"
        );
        assert_eq!(scale_filter(0), "scale=trunc(iw/2)*2:trunc(ih/2)*2");
    }

    #[test]
    fn legacy_codecs_get_a_quality_scale_not_crf() {
        let settings = MediaSettings::default();
        let codec = super::super::ResolvedCodec {
            id: "mpeg4",
            encoder: "mpeg4",
        };
        let args = quality_args(&codec, &settings, None);
        assert!(args.contains(&"-q:v".to_owned()));
        assert!(!args.contains(&"-crf".to_owned()));
    }

    #[test]
    fn av1_uses_the_encoder_specific_preset_flag() {
        let settings = MediaSettings::default();
        let svt = super::super::ResolvedCodec {
            id: "av1",
            encoder: "libsvtav1",
        };
        let args = quality_args(&svt, &settings, None);
        assert!(args.contains(&"-preset".to_owned()));
        assert!(!args.contains(&"-cpu-used".to_owned()));
    }
}
