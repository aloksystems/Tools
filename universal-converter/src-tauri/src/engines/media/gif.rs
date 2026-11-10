use super::{GIF_TIMEOUT, settings::MediaSettings, validate_trim};
use crate::engines::ffmpeg::{self, MediaInfo, Tools, gif_filter};
use crate::engines::{EngineContext, checked_cancel};
use crate::error::ConversionError;
use std::path::Path;

/// A GIF is often larger than the video it came from; anything past half a
/// minute is a sign the user wants a video format instead. The cap is enforced
/// up front so a four-minute clip cannot fill the disk while it encodes.
pub(crate) const MAX_GIF_MS: u64 = 30_000;

fn duration_cap(total: Option<u64>) -> Result<(), ConversionError> {
    match total {
        Some(total) if total > MAX_GIF_MS => Err(ConversionError::Other(format!(
            "GIF output is limited to {} seconds but this selection is {:.1}s long. Trim it \
             first (the video formats handle long clips).",
            MAX_GIF_MS / 1000,
            total as f64 / 1000.0
        ))),
        _ => Ok(()),
    }
}

/// Video → GIF. Always palette-based; mapped to one real video stream so cover
/// art attached to an audio file cannot silently become the output.
pub(crate) fn convert(
    tools: &Tools,
    ctx: &EngineContext<'_>,
    info: &MediaInfo,
    settings: &MediaSettings,
    output: &Path,
) -> Result<(), ConversionError> {
    checked_cancel(ctx.cancel)?;
    let video = info
        .primary_video()
        .filter(|stream| !stream.attached_pic)
        .ok_or_else(|| {
            ConversionError::Other(format!(
                "{} has no video track, so it cannot become a GIF",
                Path::new(&ctx.job.input_path)
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "the input".to_owned())
            ))
        })?;
    validate_trim(info, settings.start_ms, settings.duration_ms)?;

    let total = ffmpeg::effective_duration_ms(info, settings.start_ms, settings.duration_ms);
    duration_cap(total)?;

    let input = Path::new(&ctx.job.input_path);
    let mut args = ffmpeg::base_args(input, settings.start_ms, settings.duration_ms);
    args.push("-map".to_owned());
    args.push(format!("0:{}", video.index));
    args.extend(["-an".to_owned(), "-sn".to_owned(), "-dn".to_owned()]);
    args.push("-vf".to_owned());
    args.push(gif_filter(
        settings.gif_fps,
        settings.gif_width_px,
        settings.gif_height_px,
    ));
    args.extend(["-loop".to_owned(), "0".to_owned()]);
    args.push("-f".to_owned());
    args.push("gif".to_owned());
    args.push(output.display().to_string());

    ffmpeg::run(
        tools,
        &args,
        ctx.cancel,
        ctx.progress,
        total,
        GIF_TIMEOUT,
        "Encoding GIF",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_always_builds_a_palette_and_clamps_extremes() {
        let filter = ffmpeg::gif_filter(500, 4, 0);
        assert!(filter.starts_with("fps=30,"));
        assert!(filter.contains("scale=120:-2"));
        assert!(filter.contains("palettegen=stats_mode=diff"));
        assert!(filter.contains("paletteuse=dither=sierra2_4a"));
    }

    #[test]
    fn a_chosen_height_letterboxes_instead_of_stretching() {
        let filter = ffmpeg::gif_filter(12, 640, 360);
        assert!(filter.contains("scale=640:360:force_original_aspect_ratio=decrease"));
        assert!(filter.contains("pad=640:360"));
        // An absurd height is clamped rather than handed to FFmpeg.
        let clamped = ffmpeg::gif_filter(12, 640, 99_999);
        assert!(clamped.contains("scale=640:1080"));
    }

    #[test]
    fn clips_longer_than_the_cap_are_refused_with_a_real_explanation() {
        let error = duration_cap(Some(MAX_GIF_MS + 1)).unwrap_err().to_string();
        assert!(error.contains("30 seconds"), "got {error}");
        assert!(duration_cap(Some(MAX_GIF_MS)).is_ok());
        assert!(duration_cap(None).is_ok());
    }
}
