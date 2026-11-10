pub mod audio;
pub mod gif;
pub mod settings;
pub mod video;

use crate::core::format::{FormatCategory, FormatId};
use crate::core::job::ConversionJob;
use crate::engines::ffmpeg;
use crate::engines::{
    ConversionEngine, EngineContext, EngineId, EngineInfo, checked_cancel, parse_settings,
};
use crate::error::ConversionError;
use serde::Serialize;
use settings::MediaSettings;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub(crate) const AUDIO_TIMEOUT: Duration = Duration::from_secs(60 * 60);
pub(crate) const VIDEO_TIMEOUT: Duration = Duration::from_secs(6 * 60 * 60);
pub(crate) const GIF_TIMEOUT: Duration = Duration::from_secs(10 * 60);

pub struct MediaEngine;

impl ConversionEngine for MediaEngine {
    fn id(&self) -> EngineId {
        EngineId::Media
    }

    fn probe(&self) -> EngineInfo {
        ffmpeg::probe()
    }

    fn convert(&self, ctx: &EngineContext) -> Result<u64, ConversionError> {
        let tools = ffmpeg::tools()?;
        checked_cancel(ctx.cancel)?;

        let input = Path::new(&ctx.job.input_path);
        let info = ffmpeg::inspect(&tools, input)?;
        let settings: MediaSettings = parse_settings(&ctx.job.settings, MediaSettings::default());
        let output_path = Path::new(&ctx.job.output_path);

        let temp = TempOutput::new(output_path)?;
        if ctx.job.output_format == FormatId::Gif {
            gif::convert(&tools, ctx, &info, &settings, &temp.path)?;
        } else {
            match ctx.job.output_format.category() {
                FormatCategory::Audio => {
                    audio::convert(&tools, ctx, &info, &settings, &temp.path)?;
                }
                FormatCategory::Video => {
                    video::convert(&tools, ctx, &info, &settings, &temp.path)?;
                }
                _ => {
                    return Err(ConversionError::Unsupported {
                        input: ctx.job.input_format.label().to_owned(),
                        output: ctx.job.output_format.label().to_owned(),
                    });
                }
            }
        }

        let size = ffmpeg::validate_output(&tools, &temp.path, ctx.job.output_format)?;
        temp.commit()?;
        Ok(size)
    }

    fn is_memory_heavy(&self) -> bool {
        true
    }

    /// Audio extraction is cheap even from a video; only real video encodes earn
    /// a slot behind the heavy gate.
    fn is_heavy_job(&self, job: &ConversionJob) -> bool {
        job.output_format == FormatId::Gif || job.output_format.category() == FormatCategory::Video
    }
}

/// The engine writes into a hidden sibling of the final file, then renames it.
/// The destination directory is on the same volume as the output, so the rename
/// is atomic and a cancelled job never leaves a half-written result in place.
pub(crate) struct TempOutput {
    pub path: PathBuf,
    final_path: PathBuf,
    committed: bool,
}

impl TempOutput {
    fn new(final_path: &Path) -> Result<Self, ConversionError> {
        let parent = final_path.parent().unwrap_or_else(|| Path::new("."));
        std::fs::create_dir_all(parent).map_err(|error| {
            ConversionError::Other(format!("could not create {}: {error}", parent.display()))
        })?;
        let path = parent.join(format!(".uc-{}.part", uuid::Uuid::new_v4()));
        Ok(TempOutput {
            path,
            final_path: final_path.to_path_buf(),
            committed: false,
        })
    }

    fn commit(mut self) -> Result<(), ConversionError> {
        // std::fs::rename replaces an existing destination on Windows. Other
        // platforms need the old file removed first for the same behaviour.
        #[cfg(not(windows))]
        if self.final_path.exists() {
            let _ = std::fs::remove_file(&self.final_path);
        }
        std::fs::rename(&self.path, &self.final_path).map_err(|error| {
            ConversionError::Other(format!(
                "could not move the finished file to {}: {error}",
                self.final_path.display()
            ))
        })?;
        self.committed = true;
        Ok(())
    }
}

impl Drop for TempOutput {
    fn drop(&mut self) {
        if !self.committed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

/// Which container FFmpeg should write. Matches `FormatId::extension()`.
pub(crate) fn muxer_for(format: FormatId) -> Result<&'static str, ConversionError> {
    Ok(match format {
        FormatId::Mp3 => "mp3",
        FormatId::Wav => "wav",
        FormatId::Flac => "flac",
        FormatId::Aac => "adts",
        FormatId::M4a | FormatId::Alac => "ipod",
        FormatId::Ogg => "ogg",
        FormatId::Opus => "opus",
        FormatId::Wma => "asf",
        FormatId::Aiff => "aiff",
        FormatId::Mp4 => "mp4",
        FormatId::Mkv => "matroska",
        FormatId::Mov => "mov",
        FormatId::Avi => "avi",
        FormatId::Webm => "webm",
        FormatId::Wmv => "asf",
        FormatId::Flv => "flv",
        FormatId::Mpeg => "mpeg",
        FormatId::ThreeGp => "3gp",
        FormatId::Gif => "gif",
        _ => {
            return Err(ConversionError::Other(format!(
                "{} is not a media output format",
                format.label()
            )));
        }
    })
}

pub(crate) fn container_args(format: FormatId) -> Vec<String> {
    match format {
        FormatId::Mp4 | FormatId::Mov | FormatId::ThreeGp | FormatId::M4a | FormatId::Alac => {
            vec!["-movflags".to_owned(), "+faststart".to_owned()]
        }
        FormatId::Mp3 => vec!["-id3v2_version".to_owned(), "3".to_owned()],
        _ => Vec::new(),
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct CodecCandidate {
    pub id: &'static str,
    pub label: &'static str,
    /// Encoder names in preference order. The first one this build advertises
    /// is used.
    pub encoders: &'static [&'static str],
}

const MP3_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "MP3 (LAME)",
    encoders: &["libmp3lame"],
}];
const WAV_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "PCM 16-bit",
    encoders: &["pcm_s16le"],
}];
const FLAC_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "FLAC (lossless)",
    encoders: &["flac"],
}];
const AAC_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "AAC",
    encoders: &["aac"],
}];
const M4A_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "AAC",
    encoders: &["aac"],
}];
const WMA_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "WMA v2",
    encoders: &["wmav2"],
}];
const AIFF_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "PCM 16-bit big-endian",
    encoders: &["pcm_s16be"],
}];
const ALAC_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "ALAC (lossless)",
    encoders: &["alac"],
}];
const OGG_CODECS: &[CodecCandidate] = &[
    CodecCandidate {
        id: "auto",
        label: "Vorbis",
        encoders: &["libvorbis"],
    },
    CodecCandidate {
        id: "opus",
        label: "Opus",
        encoders: &["libopus"],
    },
];
const OPUS_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "Opus",
    encoders: &["libopus"],
}];

const H264: CodecCandidate = CodecCandidate {
    id: "h264",
    label: "H.264",
    encoders: &["libx264"],
};
const H265: CodecCandidate = CodecCandidate {
    id: "h265",
    label: "H.265 (HEVC)",
    encoders: &["libx265"],
};
const AV1: CodecCandidate = CodecCandidate {
    id: "av1",
    label: "AV1",
    encoders: &["libsvtav1", "libaom-av1"],
};
const VP9: CodecCandidate = CodecCandidate {
    id: "vp9",
    label: "VP9",
    encoders: &["libvpx-vp9"],
};
const VP8: CodecCandidate = CodecCandidate {
    id: "vp8",
    label: "VP8",
    encoders: &["libvpx"],
};
const MPEG4: CodecCandidate = CodecCandidate {
    id: "mpeg4",
    label: "MPEG-4 Part 2",
    encoders: &["mpeg4"],
};
const WMV2: CodecCandidate = CodecCandidate {
    id: "wmv2",
    label: "WMV2",
    encoders: &["wmv2"],
};
const FLV1: CodecCandidate = CodecCandidate {
    id: "flv1",
    label: "Sorenson Spark",
    encoders: &["flv1"],
};
const MPEG2: CodecCandidate = CodecCandidate {
    id: "mpeg2",
    label: "MPEG-2",
    encoders: &["mpeg2video"],
};
const MPEG1: CodecCandidate = CodecCandidate {
    id: "mpeg1",
    label: "MPEG-1",
    encoders: &["mpeg1video"],
};
const H263: CodecCandidate = CodecCandidate {
    id: "h263",
    label: "H.263",
    encoders: &["h263"],
};

// Audio tracks a video container can carry. Ids are explicit so the video page
// can offer a real choice; the audio pages keep their own single-purpose lists.
const AAC_AUDIO: CodecCandidate = CodecCandidate {
    id: "aac",
    label: "AAC",
    encoders: &["aac"],
};
const MP3_AUDIO: CodecCandidate = CodecCandidate {
    id: "mp3",
    label: "MP3 (LAME)",
    encoders: &["libmp3lame"],
};
const OPUS_AUDIO: CodecCandidate = CodecCandidate {
    id: "opus",
    label: "Opus",
    encoders: &["libopus"],
};
const VORBIS_AUDIO: CodecCandidate = CodecCandidate {
    id: "vorbis",
    label: "Vorbis",
    encoders: &["libvorbis"],
};
const FLAC_AUDIO: CodecCandidate = CodecCandidate {
    id: "flac",
    label: "FLAC",
    encoders: &["flac"],
};
const ALAC_AUDIO: CodecCandidate = CodecCandidate {
    id: "alac",
    label: "ALAC",
    encoders: &["alac"],
};
const WMA_AUDIO: CodecCandidate = CodecCandidate {
    id: "wma",
    label: "WMA v2",
    encoders: &["wmav2"],
};
const MP2_AUDIO: CodecCandidate = CodecCandidate {
    id: "mp2",
    label: "MP2",
    encoders: &["mp2"],
};

const MP4_AUDIO_CODECS: &[CodecCandidate] = &[AAC_AUDIO, MP3_AUDIO];
const MOV_AUDIO_CODECS: &[CodecCandidate] = &[AAC_AUDIO, MP3_AUDIO, ALAC_AUDIO];
const MKV_AUDIO_CODECS: &[CodecCandidate] =
    &[AAC_AUDIO, MP3_AUDIO, OPUS_AUDIO, VORBIS_AUDIO, FLAC_AUDIO];
const AVI_AUDIO_CODECS: &[CodecCandidate] = &[MP3_AUDIO, AAC_AUDIO];
const WEBM_AUDIO_CODECS: &[CodecCandidate] = &[OPUS_AUDIO, VORBIS_AUDIO];
const WMV_AUDIO_CODECS: &[CodecCandidate] = &[WMA_AUDIO];
const FLV_AUDIO_CODECS: &[CodecCandidate] = &[AAC_AUDIO, MP3_AUDIO];
const MPEG_AUDIO_CODECS: &[CodecCandidate] = &[MP2_AUDIO, MP3_AUDIO];
const THREE_GP_AUDIO_CODECS: &[CodecCandidate] = &[AAC_AUDIO];

const MP4_CODECS: &[CodecCandidate] = &[H264, H265, AV1];
const MKV_CODECS: &[CodecCandidate] = &[H264, H265, VP9, AV1];
const AVI_CODECS: &[CodecCandidate] = &[MPEG4, H264];
const WEBM_CODECS: &[CodecCandidate] = &[VP9, VP8, AV1];
const WMV_CODECS: &[CodecCandidate] = &[WMV2];
const FLV_CODECS: &[CodecCandidate] = &[FLV1, H264];
const MPEG_CODECS: &[CodecCandidate] = &[MPEG2, MPEG1];
const THREE_GP_CODECS: &[CodecCandidate] = &[H264, H263];
const GIF_CODECS: &[CodecCandidate] = &[CodecCandidate {
    id: "auto",
    label: "GIF",
    encoders: &["gif"],
}];

/// Chooses the audio track. An explicit index must really exist — silently
/// falling back would extract the wrong language from a multi-track video.
pub(crate) fn choose_audio_stream(
    info: &ffmpeg::MediaInfo,
    requested: Option<u32>,
) -> Result<&ffmpeg::MediaStream, ConversionError> {
    let streams = info.audio_streams();
    if streams.is_empty() {
        return Err(ConversionError::Other(
            "the input has no audio track".to_owned(),
        ));
    }
    match requested {
        None => Ok(streams[0]),
        Some(index) => streams
            .iter()
            .copied()
            .find(|stream| stream.index == index)
            .ok_or_else(|| {
                let available = streams
                    .iter()
                    .map(|stream| format!("#{}", stream.index))
                    .collect::<Vec<_>>()
                    .join(", ");
                ConversionError::Other(format!(
                    "audio stream #{index} does not exist; this file has {available}"
                ))
            }),
    }
}

pub(crate) fn validate_trim(
    info: &ffmpeg::MediaInfo,
    start_ms: Option<u64>,
    duration_ms: Option<u64>,
) -> Result<(), ConversionError> {
    if let (Some(start), Some(total)) = (start_ms, info.duration_ms) {
        if start >= total {
            return Err(ConversionError::Other(format!(
                "the trim starts at {:.1}s but the file is only {:.1}s long",
                start as f64 / 1000.0,
                total as f64 / 1000.0
            )));
        }
        if let Some(duration) = duration_ms
            && start + duration > total + 1
        {
            return Err(ConversionError::Other(format!(
                "the trim asks for {:.1}s of media from {:.1}s, past the end of a {:.1}s file",
                duration as f64 / 1000.0,
                start as f64 / 1000.0,
                total as f64 / 1000.0
            )));
        }
    }
    Ok(())
}

pub(crate) fn audio_codecs(format: FormatId) -> &'static [CodecCandidate] {
    match format {
        FormatId::Mp3 => MP3_CODECS,
        FormatId::Wav => WAV_CODECS,
        FormatId::Flac => FLAC_CODECS,
        FormatId::Aac => AAC_CODECS,
        FormatId::M4a => M4A_CODECS,
        FormatId::Wma => WMA_CODECS,
        FormatId::Aiff => AIFF_CODECS,
        FormatId::Alac => ALAC_CODECS,
        FormatId::Ogg => OGG_CODECS,
        FormatId::Opus => OPUS_CODECS,
        _ => &[],
    }
}

pub(crate) fn video_codecs(format: FormatId) -> &'static [CodecCandidate] {
    match format {
        FormatId::Mp4 => MP4_CODECS,
        FormatId::Mov => MP4_CODECS,
        FormatId::Mkv => MKV_CODECS,
        FormatId::Avi => AVI_CODECS,
        FormatId::Webm => WEBM_CODECS,
        FormatId::Wmv => WMV_CODECS,
        FormatId::Flv => FLV_CODECS,
        FormatId::Mpeg => MPEG_CODECS,
        FormatId::ThreeGp => THREE_GP_CODECS,
        FormatId::Gif => GIF_CODECS,
        _ => &[],
    }
}

/// Audio tracks each video container can carry.
pub(crate) fn video_audio_codecs(format: FormatId) -> &'static [CodecCandidate] {
    match format {
        FormatId::Mp4 => MP4_AUDIO_CODECS,
        FormatId::Mov => MOV_AUDIO_CODECS,
        FormatId::Mkv => MKV_AUDIO_CODECS,
        FormatId::Avi => AVI_AUDIO_CODECS,
        FormatId::Webm => WEBM_AUDIO_CODECS,
        FormatId::Wmv => WMV_AUDIO_CODECS,
        FormatId::Flv => FLV_AUDIO_CODECS,
        FormatId::Mpeg => MPEG_AUDIO_CODECS,
        FormatId::ThreeGp => THREE_GP_AUDIO_CODECS,
        _ => &[],
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ResolvedCodec {
    pub id: &'static str,
    pub encoder: &'static str,
}

fn resolve(
    format: FormatId,
    requested: &str,
    candidates: &'static [CodecCandidate],
    available: &[String],
) -> Result<ResolvedCodec, ConversionError> {
    let pick = |candidate: &'static CodecCandidate| {
        candidate
            .encoders
            .iter()
            .find(|encoder| available.iter().any(|name| name == *encoder))
            .map(|encoder| ResolvedCodec {
                id: candidate.id,
                encoder,
            })
    };

    if requested.is_empty() || requested == "auto" {
        for candidate in candidates {
            if let Some(found) = pick(candidate) {
                return Ok(found);
            }
        }
        return Err(no_encoder(format, candidates));
    }

    let candidate = candidates
        .iter()
        .find(|candidate| candidate.id == requested)
        .ok_or_else(|| {
            ConversionError::Other(format!(
                "{} does not support the {requested} codec",
                format.label()
            ))
        })?;
    pick(candidate).ok_or_else(|| no_encoder(format, std::slice::from_ref(candidate)))
}

fn no_encoder(format: FormatId, candidates: &[CodecCandidate]) -> ConversionError {
    let names = candidates
        .iter()
        .map(|candidate| candidate.label)
        .collect::<Vec<_>>()
        .join(" / ");
    ConversionError::Other(format!(
        "This FFmpeg build has no {names} encoder for {} output. Use a build that includes it \
         (the bundled GPL build does) or choose another format.",
        format.label()
    ))
}

pub(crate) fn resolve_audio_codec(
    format: FormatId,
    requested: &str,
    available: &[String],
) -> Result<ResolvedCodec, ConversionError> {
    resolve(format, requested, audio_codecs(format), available)
}

pub(crate) fn resolve_video_codec(
    format: FormatId,
    requested: &str,
    available: &[String],
) -> Result<ResolvedCodec, ConversionError> {
    resolve(format, requested, video_codecs(format), available)
}

pub(crate) fn resolve_video_audio_codec(
    format: FormatId,
    requested: &str,
    available: &[String],
) -> Result<ResolvedCodec, ConversionError> {
    resolve(format, requested, video_audio_codecs(format), available)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodecSupport {
    pub id: String,
    pub label: String,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatSupport {
    pub format: FormatId,
    pub available: bool,
    pub reason: Option<String>,
    pub codecs: Vec<CodecSupport>,
    /// Audio codecs this video container can carry; empty for audio outputs.
    pub audio_codecs: Vec<CodecSupport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaCapabilities {
    pub available: bool,
    pub ffmpeg_version: Option<String>,
    pub ffprobe_version: Option<String>,
    pub reason: Option<String>,
    pub formats: Vec<FormatSupport>,
    pub hardware: Vec<ffmpeg::HardwareEncoder>,
}

/// Outputs the media engine can produce. Kept next to the registry routes; the
/// test below fails if the two lists drift apart.
pub(crate) const MEDIA_OUTPUTS: &[FormatId] = &[
    FormatId::Mp3,
    FormatId::Wav,
    FormatId::Flac,
    FormatId::Aac,
    FormatId::M4a,
    FormatId::Wma,
    FormatId::Aiff,
    FormatId::Alac,
    FormatId::Ogg,
    FormatId::Opus,
    FormatId::Mp4,
    FormatId::Mkv,
    FormatId::Mov,
    FormatId::Avi,
    FormatId::Webm,
    FormatId::Wmv,
    FormatId::Flv,
    FormatId::Mpeg,
    FormatId::ThreeGp,
    FormatId::Gif,
];

fn codec_support(candidates: &[CodecCandidate], encoders: &[String]) -> Vec<CodecSupport> {
    candidates
        .iter()
        .map(|candidate| CodecSupport {
            id: candidate.id.to_owned(),
            label: candidate.label.to_owned(),
            available: candidate
                .encoders
                .iter()
                .any(|encoder| encoders.iter().any(|name| name == encoder)),
        })
        .collect()
}

fn format_support(format: FormatId, encoders: &[String]) -> FormatSupport {
    let candidates = if format.category() == FormatCategory::Audio {
        audio_codecs(format)
    } else {
        video_codecs(format)
    };
    let codecs = codec_support(candidates, encoders);
    let available = codecs.iter().any(|codec| codec.available);
    FormatSupport {
        format,
        available,
        reason: (!available).then(|| no_encoder(format, candidates).to_string()),
        codecs,
        audio_codecs: if format.category() == FormatCategory::Video {
            codec_support(video_audio_codecs(format), encoders)
        } else {
            Vec::new()
        },
    }
}

/// Answers what this machine can actually encode. Format rows are derived from
/// the build's encoder table, not from assumptions about "standard" FFmpeg.
pub fn capabilities() -> MediaCapabilities {
    let tools = match ffmpeg::tools() {
        Ok(tools) => tools,
        Err(ConversionError::EngineUnavailable { reason, .. }) => {
            return MediaCapabilities {
                available: false,
                ffmpeg_version: None,
                ffprobe_version: None,
                reason: Some(reason),
                formats: Vec::new(),
                hardware: Vec::new(),
            };
        }
        Err(error) => {
            return MediaCapabilities {
                available: false,
                ffmpeg_version: None,
                ffprobe_version: None,
                reason: Some(error.to_string()),
                formats: Vec::new(),
                hardware: Vec::new(),
            };
        }
    };

    let encoders = match ffmpeg::encoders(&tools) {
        Ok(encoders) => encoders,
        Err(error) => {
            return MediaCapabilities {
                available: true,
                ffmpeg_version: Some(tools.version),
                ffprobe_version: tools.ffprobe_version,
                reason: Some(format!("FFmpeg did not answer -encoders: {error}")),
                formats: Vec::new(),
                hardware: Vec::new(),
            };
        }
    };

    MediaCapabilities {
        available: true,
        ffmpeg_version: Some(tools.version.clone()),
        ffprobe_version: tools.ffprobe_version.clone(),
        reason: None,
        formats: MEDIA_OUTPUTS
            .iter()
            .map(|format| format_support(*format, &encoders))
            .collect(),
        hardware: ffmpeg::hardware_encoders(&tools).unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::job::JobRequest;
    use crate::core::registry;
    use crate::engines::sidecar;
    use crate::engines::{CancellationToken, EngineContext, NullProgress};
    use serde_json::json;
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("uc-media-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch folder");
        dir
    }

    fn tools() -> ffmpeg::Tools {
        ffmpeg::tools().expect("the bundled FFmpeg is required for media tests")
    }

    /// A real 16-bit PCM WAV written without any external tool, so the audio
    /// tests do not depend on FFmpeg to build their own input.
    fn write_wav(path: &Path, seconds: u32) {
        let rate = 44_100u32;
        let samples = rate * seconds;
        let data_len = samples * 2;
        let mut bytes = Vec::with_capacity(44 + data_len as usize);
        bytes.extend(b"RIFF");
        bytes.extend((36 + data_len).to_le_bytes());
        bytes.extend(b"WAVEfmt ");
        bytes.extend(16u32.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(rate.to_le_bytes());
        bytes.extend((rate * 2).to_le_bytes());
        bytes.extend(2u16.to_le_bytes());
        bytes.extend(16u16.to_le_bytes());
        bytes.extend(b"data");
        bytes.extend(data_len.to_le_bytes());
        for index in 0..samples {
            let time = index as f64 / rate as f64;
            let sample = (time * 440.0 * std::f64::consts::TAU).sin() * 0.3;
            bytes.extend(((sample * i16::MAX as f64) as i16).to_le_bytes());
        }
        std::fs::write(path, bytes).expect("write WAV fixture");
    }

    /// A real H.264/AAC MP4, encoded by the bundled FFmpeg from lavfi sources.
    fn write_mp4(tools: &ffmpeg::Tools, dir: &Path) -> PathBuf {
        let path = dir.join("clip.mp4");
        let target = path.display().to_string();
        let args = [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x240:rate=15:duration=1",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            &target,
        ];
        let captured =
            sidecar::capture(&tools.ffmpeg, &args, 1024 * 1024, Duration::from_secs(120))
                .expect("run FFmpeg to build the fixture");
        assert!(
            captured.status.success(),
            "fixture encode failed: {}",
            captured.stderr
        );
        path
    }

    /// A real MP3 with ID3 metadata, built by FFmpeg from a WAV fixture.
    fn write_tagged_mp3(tools: &ffmpeg::Tools, dir: &Path) -> PathBuf {
        let wav = dir.join("tag-source.wav");
        write_wav(&wav, 1);
        let path = dir.join("tagged.mp3");
        let source = wav.display().to_string();
        let target = path.display().to_string();
        let captured = sidecar::capture(
            &tools.ffmpeg,
            &[
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                &source,
                "-c:a",
                "libmp3lame",
                "-b:a",
                "128k",
                "-metadata",
                "title=Unit Test Tone",
                "-metadata",
                "artist=Universal Converter",
                &target,
            ],
            1024 * 1024,
            Duration::from_secs(120),
        )
        .expect("run FFmpeg to build the MP3 fixture");
        assert!(
            captured.status.success(),
            "MP3 fixture encode failed: {}",
            captured.stderr
        );
        path
    }

    fn job(
        input: &Path,
        input_format: FormatId,
        output: &Path,
        output_format: FormatId,
        settings: serde_json::Value,
    ) -> ConversionJob {
        let request =
            JobRequest::for_test(&[&input.display().to_string()], output_format, settings);
        ConversionJob::new(
            &request,
            input_format,
            EngineId::Media,
            output.to_path_buf(),
            std::fs::metadata(input).map(|meta| meta.len()).unwrap_or(0),
        )
    }

    fn run(
        engine_job: &ConversionJob,
        dir: &Path,
        cancel: &CancellationToken,
    ) -> Result<u64, ConversionError> {
        let progress = NullProgress;
        let settings = crate::core::settings::AppSettings::default();
        let context = EngineContext {
            job: engine_job,
            temp_dir: dir,
            progress: &progress,
            cancel,
            settings: &settings,
            secret: None,
        };
        MediaEngine.convert(&context)
    }

    fn leftover_part_files(dir: &Path) -> usize {
        std::fs::read_dir(dir)
            .expect("read scratch dir")
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().starts_with(".uc-"))
            .count()
    }

    #[test]
    fn converts_a_real_wav_to_mp3_and_validates_the_output() {
        let dir = scratch("wav-mp3");
        let input = dir.join("tone.wav");
        write_wav(&input, 1);
        let output = dir.join("tone.mp3");
        let engine_job = job(
            &input,
            FormatId::Wav,
            &output,
            FormatId::Mp3,
            json!({ "bitrateKbps": 128, "volumePercent": 90 }),
        );

        let bytes = run(&engine_job, &dir, &CancellationToken::new()).expect("WAV → MP3");
        assert!(bytes > 0, "the engine must report the real output size");

        let info = ffmpeg::inspect(&tools(), &output).expect("ffprobe reads the output");
        assert_eq!(info.format_name, "mp3");
        assert_eq!(info.audio_streams().len(), 1, "one audio track");
        let duration = info.duration_ms.expect("an MP3 has a duration");
        assert!(
            (800..=1_400).contains(&duration),
            "expected about one second, got {duration} ms"
        );
        assert_eq!(leftover_part_files(&dir), 0, "no .part file may survive");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn trim_is_applied_and_the_output_duration_shrinks() {
        let dir = scratch("trim");
        let input = dir.join("long.wav");
        write_wav(&input, 3);
        let output = dir.join("trimmed.flac");
        let engine_job = job(
            &input,
            FormatId::Wav,
            &output,
            FormatId::Flac,
            json!({ "startMs": 1000, "durationMs": 500 }),
        );

        run(&engine_job, &dir, &CancellationToken::new()).expect("trimmed WAV → FLAC");
        let info = ffmpeg::inspect(&tools(), &output).expect("ffprobe reads the FLAC");
        assert_eq!(info.format_name, "flac");
        let duration = info.duration_ms.expect("duration");
        assert!(
            (400..=800).contains(&duration),
            "a 500 ms trim must produce about half a second, got {duration} ms"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn extracts_the_audio_track_of_a_real_mp4() {
        let dir = scratch("mp4-mp3");
        let tools = tools();
        let input = write_mp4(&tools, &dir);
        let output = dir.join("sound.mp3");
        let engine_job = job(
            &input,
            FormatId::Mp4,
            &output,
            FormatId::Mp3,
            json!({ "bitrateKbps": 160 }),
        );

        run(&engine_job, &dir, &CancellationToken::new()).expect("MP4 → MP3");
        let info = ffmpeg::inspect(&tools, &output).expect("ffprobe reads the MP3");
        assert_eq!(info.format_name, "mp3");
        assert_eq!(info.audio_streams().len(), 1);
        assert!(
            info.streams.iter().all(|stream| stream.kind != "video"),
            "an extracted MP3 must not carry a video stream"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn transcodes_a_real_mp4_to_webm_with_the_chosen_codec() {
        let dir = scratch("mp4-webm");
        let tools = tools();
        let input = write_mp4(&tools, &dir);
        let output = dir.join("clip.webm");
        let engine_job = job(
            &input,
            FormatId::Mp4,
            &output,
            FormatId::Webm,
            json!({
                "videoCodec": "vp9",
                "qualityPreset": "fast",
                "targetHeightPx": 240,
                "audioBitrateKbps": 96
            }),
        );

        run(&engine_job, &dir, &CancellationToken::new()).expect("MP4 → WebM");
        let info = ffmpeg::inspect(&tools, &output).expect("ffprobe reads the WebM");
        assert!(
            ffmpeg::container_matches(FormatId::Webm, &info.format_name),
            "unexpected container {}",
            info.format_name
        );
        assert!(!info.format_label.is_empty());
        let video = info.primary_video().expect("a video stream");
        assert_eq!(video.codec, "vp9");
        assert_eq!(video.height, Some(240));
        assert_eq!(
            info.audio_streams().len(),
            1,
            "audio survives unless removed"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn removes_the_audio_track_when_asked() {
        let dir = scratch("remove-audio");
        let tools = tools();
        let input = write_mp4(&tools, &dir);
        let output = dir.join("silent.mp4");
        let engine_job = job(
            &input,
            FormatId::Mp4,
            &output,
            FormatId::Mp4,
            json!({ "removeAudio": true, "qualityPreset": "fast" }),
        );

        run(&engine_job, &dir, &CancellationToken::new()).expect("MP4 → silent MP4");
        let info = ffmpeg::inspect(&tools, &output).expect("ffprobe reads the MP4");
        assert_eq!(info.audio_streams().len(), 0, "audio was removed");
        assert!(info.has_real_video());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn builds_a_palette_gif_from_a_real_video() {
        let dir = scratch("gif");
        let tools = tools();
        let input = write_mp4(&tools, &dir);
        let output = dir.join("clip.gif");
        let engine_job = job(
            &input,
            FormatId::Mp4,
            &output,
            FormatId::Gif,
            json!({ "gifFps": 10, "gifWidthPx": 160 }),
        );

        let bytes = run(&engine_job, &dir, &CancellationToken::new()).expect("MP4 → GIF");
        assert!(bytes > 0);
        let info = ffmpeg::inspect(&tools, &output).expect("ffprobe reads the GIF");
        assert_eq!(info.format_name, "gif");
        let video = info.primary_video().expect("a GIF has a video stream");
        assert_eq!(video.width, Some(160));
        assert_eq!(leftover_part_files(&dir), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_cancelled_job_returns_cancelled_and_writes_nothing() {
        let dir = scratch("cancel");
        let input = dir.join("tone.wav");
        write_wav(&input, 1);
        let output = dir.join("tone.mp3");
        let engine_job = job(&input, FormatId::Wav, &output, FormatId::Mp3, json!({}));
        let cancel = CancellationToken::new();
        cancel.cancel();

        let error = run(&engine_job, &dir, &cancel).expect_err("must not encode");
        assert!(matches!(error, ConversionError::Cancelled), "got {error}");
        assert!(!output.exists(), "no output may appear for a cancelled job");
        assert_eq!(leftover_part_files(&dir), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn capability_outputs_cover_every_registry_audio_and_video_route() {
        let mut expected: Vec<FormatId> = Vec::new();
        for input in [
            FormatId::Mp3,
            FormatId::Mp4,
            FormatId::Webm,
            FormatId::Wmv,
            FormatId::Flv,
            FormatId::Mpeg,
            FormatId::ThreeGp,
        ] {
            for route in registry::capabilities_for(input) {
                if route.engine == EngineId::Media && !expected.contains(&route.output) {
                    expected.push(route.output);
                }
            }
        }
        for format in &expected {
            assert!(
                MEDIA_OUTPUTS.contains(format),
                "{format} is routable but missing from media capabilities"
            );
        }
    }

    #[test]
    fn capabilities_come_from_the_bundled_build() {
        let engine = MediaEngine.probe();
        assert!(engine.available, "{:?}", engine.unavailable_reason);
        assert!(engine.version.is_some());

        let caps = capabilities();
        assert!(caps.available);
        assert!(caps.ffmpeg_version.is_some());
        assert!(
            caps.ffprobe_version.is_some(),
            "ffprobe must be found independently of ffmpeg"
        );

        for format in [
            FormatId::Mp3,
            FormatId::Flac,
            FormatId::Mp4,
            FormatId::Mkv,
            FormatId::Webm,
            FormatId::Gif,
        ] {
            let support = caps
                .formats
                .iter()
                .find(|support| support.format == format)
                .unwrap_or_else(|| panic!("{format} is missing from capabilities"));
            assert!(
                support.available,
                "{format} must be writable by the bundled build"
            );
            assert!(!support.codecs.is_empty());
        }

        let webm = caps
            .formats
            .iter()
            .find(|support| support.format == FormatId::Webm)
            .expect("WebM support");
        assert!(
            webm.audio_codecs
                .iter()
                .any(|codec| codec.id == "opus" && codec.available),
            "WebM must advertise its real audio codecs"
        );

        let mp4 = caps
            .formats
            .iter()
            .find(|support| support.format == FormatId::Mp4)
            .expect("MP4 support");
        assert!(mp4.audio_codecs.iter().any(|codec| codec.id == "aac"));
        assert!(
            mp4.audio_codecs.iter().all(|codec| codec.id != "opus"),
            "MP4 must not claim to support Opus audio"
        );

        for encoder in &caps.hardware {
            assert!(matches!(encoder.codec.as_str(), "h264" | "hevc"));
            assert!(!encoder.encoder.is_empty());
        }
    }

    #[test]
    fn audio_codec_resolution_prefers_an_available_encoder() {
        let available = vec!["libopus".to_owned()];
        let resolved = resolve_audio_codec(FormatId::Ogg, "auto", &available).unwrap();
        assert_eq!(
            resolved.id, "opus",
            "Vorbis is absent, so auto must use Opus"
        );

        let error = resolve_audio_codec(FormatId::Mp3, "auto", &available).unwrap_err();
        assert!(error.to_string().contains("no MP3"), "got {error}");
    }

    #[test]
    fn video_codec_resolution_rejects_a_codec_the_container_lacks() {
        let available = vec!["libx264".to_owned(), "libvpx-vp9".to_owned()];
        assert_eq!(
            resolve_video_codec(FormatId::Webm, "h264", &available)
                .unwrap_err()
                .to_string(),
            "WebM does not support the h264 codec"
        );
        assert_eq!(
            resolve_video_codec(FormatId::Webm, "auto", &available)
                .unwrap()
                .id,
            "vp9"
        );
    }

    #[test]
    fn video_audio_codec_resolution_respects_the_container() {
        let available = vec!["aac".to_owned(), "libopus".to_owned(), "flac".to_owned()];
        assert_eq!(
            resolve_video_audio_codec(FormatId::Mkv, "flac", &available)
                .unwrap()
                .encoder,
            "flac"
        );
        assert_eq!(
            resolve_video_audio_codec(FormatId::Webm, "auto", &available)
                .unwrap()
                .id,
            "opus",
            "AAC is not legal in WebM, so auto must fall through to Opus"
        );
        assert_eq!(
            resolve_video_audio_codec(FormatId::Mp4, "flac", &available)
                .unwrap_err()
                .to_string(),
            "MP4 does not support the flac codec"
        );
    }

    #[test]
    fn converts_mp3_to_wav_with_the_requested_format() {
        let dir = scratch("mp3-wav");
        let tools = tools();
        let input = write_tagged_mp3(&tools, &dir);
        let output = dir.join("tone.wav");
        let engine_job = job(
            &input,
            FormatId::Mp3,
            &output,
            FormatId::Wav,
            json!({ "sampleRateHz": 48000, "channels": 2 }),
        );

        run(&engine_job, &dir, &CancellationToken::new()).expect("MP3 → WAV");
        let info = ffmpeg::inspect(&tools, &output).expect("ffprobe reads the WAV");
        assert_eq!(info.format_name, "wav");
        let audio = &info.audio_streams()[0];
        assert_eq!(audio.codec, "pcm_s16le");
        assert_eq!(audio.sample_rate, Some(48_000));
        assert_eq!(audio.channels, Some(2));
        let duration = info.duration_ms.expect("a WAV has a duration");
        assert!(
            (800..=1_400).contains(&duration),
            "expected about one second, got {duration} ms"
        );
        assert_eq!(leftover_part_files(&dir), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn lossless_output_keeps_the_requested_sample_rate_and_channels() {
        let dir = scratch("flac-chain");
        let tools = tools();
        let input = dir.join("source.wav");
        write_wav(&input, 1);
        let flac = dir.join("converted.flac");
        let engine_job = job(
            &input,
            FormatId::Wav,
            &flac,
            FormatId::Flac,
            json!({ "sampleRateHz": 48000, "channels": 2 }),
        );

        run(&engine_job, &dir, &CancellationToken::new()).expect("WAV → FLAC");
        let encoded = ffmpeg::inspect(&tools, &flac).expect("ffprobe reads the FLAC");
        assert_eq!(encoded.format_name, "flac");
        let audio = &encoded.audio_streams()[0];
        assert_eq!(audio.codec, "flac");
        assert_eq!(audio.sample_rate, Some(48_000));
        assert_eq!(audio.channels, Some(2));

        let back = dir.join("roundtrip.wav");
        let engine_job = job(&flac, FormatId::Flac, &back, FormatId::Wav, json!({}));
        run(&engine_job, &dir, &CancellationToken::new()).expect("FLAC → WAV");
        let decoded = ffmpeg::inspect(&tools, &back).expect("ffprobe reads the WAV");
        let audio = &decoded.audio_streams()[0];
        assert_eq!(audio.sample_rate, Some(48_000));
        assert_eq!(audio.channels, Some(2));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_bitrate_setting_changes_the_encoded_size() {
        let dir = scratch("bitrate");
        let input = dir.join("long.wav");
        write_wav(&input, 5);

        let encode = |name: &str, bitrate: u32| {
            let output = dir.join(name);
            let engine_job = job(
                &input,
                FormatId::Wav,
                &output,
                FormatId::Mp3,
                json!({ "bitrateKbps": bitrate }),
            );
            run(&engine_job, &dir, &CancellationToken::new()).expect("WAV → MP3");
            std::fs::metadata(&output).expect("output metadata").len()
        };

        let low = encode("low.mp3", 64);
        let high = encode("high.mp3", 320);
        assert!(
            high > low,
            "320 kbps ({high} bytes) must be larger than 64 kbps ({low} bytes)"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn metadata_survives_when_preserved_and_is_dropped_when_asked() {
        let dir = scratch("metadata");
        let tools = tools();
        let input = write_tagged_mp3(&tools, &dir);
        let keep = dir.join("keep.flac");
        let engine_job = job(
            &input,
            FormatId::Mp3,
            &keep,
            FormatId::Flac,
            json!({ "preserveMetadata": true }),
        );
        run(&engine_job, &dir, &CancellationToken::new()).expect("MP3 → FLAC with metadata");
        let info = ffmpeg::inspect(&tools, &keep).expect("ffprobe reads the FLAC");
        assert_eq!(
            info.title.as_deref(),
            Some("Unit Test Tone"),
            "the title tag must survive into the FLAC"
        );

        let drop = dir.join("drop.flac");
        let engine_job = job(
            &input,
            FormatId::Mp3,
            &drop,
            FormatId::Flac,
            json!({ "preserveMetadata": false }),
        );
        run(&engine_job, &dir, &CancellationToken::new()).expect("MP3 → FLAC without metadata");
        let info = ffmpeg::inspect(&tools, &drop).expect("ffprobe reads the FLAC");
        assert!(
            info.title.as_deref() != Some("Unit Test Tone"),
            "preserveMetadata=false must not copy the title tag"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn converts_mp4_to_mkv_and_back_keeping_height_and_frame_rate() {
        let dir = scratch("mkv-roundtrip");
        let tools = tools();
        let input = write_mp4(&tools, &dir);
        let mkv = dir.join("clip.mkv");
        let engine_job = job(
            &input,
            FormatId::Mp4,
            &mkv,
            FormatId::Mkv,
            json!({
                "qualityPreset": "fast",
                "targetHeightPx": 144,
                "frameRate": 10,
                "audioBitrateKbps": 96
            }),
        );

        run(&engine_job, &dir, &CancellationToken::new()).expect("MP4 → MKV");
        let first = ffmpeg::inspect(&tools, &mkv).expect("ffprobe reads the MKV");
        assert!(
            ffmpeg::container_matches(FormatId::Mkv, &first.format_name),
            "unexpected container {}",
            first.format_name
        );
        let video = first.primary_video().expect("a video stream");
        assert_eq!(video.height, Some(144));
        let rate = video.frame_rate.expect("a frame rate");
        assert!((9.0..=11.0).contains(&rate), "expected 10 fps, got {rate}");

        let mp4 = dir.join("roundtrip.mp4");
        let engine_job = job(
            &mkv,
            FormatId::Mkv,
            &mp4,
            FormatId::Mp4,
            json!({ "qualityPreset": "fast" }),
        );
        run(&engine_job, &dir, &CancellationToken::new()).expect("MKV → MP4");
        let second = ffmpeg::inspect(&tools, &mp4).expect("ffprobe reads the MP4");
        assert!(
            ffmpeg::container_matches(FormatId::Mp4, &second.format_name),
            "unexpected container {}",
            second.format_name
        );
        let video = second.primary_video().expect("a video stream");
        assert_eq!(video.height, Some(144), "the downscale must stick");
        assert!(!second.audio_streams().is_empty(), "audio came along");
        let rate = video.frame_rate.expect("a frame rate");
        assert!(
            (9.0..=11.0).contains(&rate),
            "the chosen frame rate must survive the round trip, got {rate}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_video_bitrate_setting_changes_the_output_size() {
        let dir = scratch("video-bitrate");
        let tools = tools();
        let input = write_mp4(&tools, &dir);

        let encode = |name: &str, bitrate: u32| {
            let output = dir.join(name);
            let engine_job = job(
                &input,
                FormatId::Mp4,
                &output,
                FormatId::Mp4,
                json!({
                    "qualityPreset": "custom",
                    "videoBitrateKbps": bitrate,
                    "removeAudio": true
                }),
            );
            run(&engine_job, &dir, &CancellationToken::new()).expect("MP4 → MP4");
            std::fs::metadata(&output).expect("output metadata").len()
        };

        let low = encode("small.mp4", 100);
        let high = encode("large.mp4", 2000);
        assert!(
            high > low,
            "2000 kbps ({high} bytes) must be larger than 100 kbps ({low} bytes)"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_chosen_audio_codec_is_used_inside_the_video_container() {
        let dir = scratch("video-audio-codec");
        let tools = tools();
        let input = write_mp4(&tools, &dir);
        let output = dir.join("clip.mkv");
        let engine_job = job(
            &input,
            FormatId::Mp4,
            &output,
            FormatId::Mkv,
            json!({
                "qualityPreset": "fast",
                "audioCodec": "flac",
                "audioBitrateKbps": 128
            }),
        );

        run(&engine_job, &dir, &CancellationToken::new()).expect("MP4 → MKV with FLAC audio");
        let info = ffmpeg::inspect(&tools, &output).expect("ffprobe reads the MKV");
        let audio = &info.audio_streams()[0];
        assert_eq!(
            audio.codec, "flac",
            "the chosen audio codec must be written"
        );
        assert!(info.has_real_video());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn gif_output_honours_trim_and_height() {
        let dir = scratch("gif-trim");
        let tools = tools();
        let input = write_mp4(&tools, &dir);
        let output = dir.join("short.gif");
        let engine_job = job(
            &input,
            FormatId::Mp4,
            &output,
            FormatId::Gif,
            json!({
                "startMs": 200,
                "durationMs": 500,
                "gifFps": 10,
                "gifWidthPx": 160,
                "gifHeightPx": 160
            }),
        );

        run(&engine_job, &dir, &CancellationToken::new()).expect("trimmed MP4 → GIF");
        let info = ffmpeg::inspect(&tools, &output).expect("ffprobe reads the GIF");
        assert_eq!(info.format_name, "gif");
        let video = info.primary_video().expect("a GIF has a video stream");
        assert_eq!(video.width, Some(160));
        assert_eq!(
            video.height,
            Some(160),
            "the chosen height box is letterboxed, not stretched"
        );
        let duration = info.duration_ms.or(video.duration_ms).expect("a duration");
        assert!(
            (300..=800).contains(&duration),
            "a 500 ms trim must not encode the whole one-second clip, got {duration} ms"
        );
        assert_eq!(leftover_part_files(&dir), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_wrong_audio_stream_index_or_trim_is_refused_before_encoding() {
        let dir = scratch("stream-choice");
        let tools = tools();
        let input = write_tagged_mp3(&tools, &dir);
        let info = ffmpeg::inspect(&tools, &input).expect("ffprobe reads the fixture");
        let existing = info.audio_streams()[0].index;
        assert_eq!(
            choose_audio_stream(&info, Some(existing)).unwrap().index,
            existing
        );

        let error = choose_audio_stream(&info, Some(existing + 7))
            .unwrap_err()
            .to_string();
        assert!(
            error.contains(&format!("#{}", existing + 7)),
            "the missing index must be named: {error}"
        );
        assert!(
            error.contains(&format!("#{existing}")),
            "the available track must be listed: {error}"
        );

        let error = validate_trim(&info, Some(5_000), None)
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("only"),
            "a trim past the end must be refused: {error}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_media_is_refused_without_writing_anything() {
        let dir = scratch("corrupt");
        let input = dir.join("broken.mp4");
        std::fs::write(&input, b"this is not an mp4 file, only plain text")
            .expect("write fake input");
        let output = dir.join("broken-out.mkv");
        let engine_job = job(
            &input,
            FormatId::Mp4,
            &output,
            FormatId::Mkv,
            json!({ "qualityPreset": "fast" }),
        );

        let error = run(&engine_job, &dir, &CancellationToken::new())
            .expect_err("ffprobe must reject unreadable media");
        let message = error.to_string();
        assert!(
            message.contains("could not read") || message.contains("damaged"),
            "unexpected error: {message}"
        );
        assert!(!output.exists(), "no output may appear for a corrupt input");
        assert_eq!(leftover_part_files(&dir), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
