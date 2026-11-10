use super::sidecar;
use crate::core::format::{FormatCategory, FormatId};
use crate::engines::{CancellationToken, ProgressSink};
use crate::error::ConversionError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const POLL: Duration = Duration::from_millis(120);
const MAX_DIAGNOSTIC: usize = 8 * 1024;

#[derive(Debug, Clone)]
pub struct Tools {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    /// First line of `ffmpeg -version`, e.g. "ffmpeg version 9.0.2-essentials_build".
    pub version: String,
    pub ffprobe_version: Option<String>,
}

#[derive(Default)]
struct Caches {
    tools: Option<Tools>,
    encoders: Option<Vec<String>>,
    hardware: Option<Vec<HardwareEncoder>>,
}

static CACHE: Mutex<Caches> = Mutex::new(Caches {
    tools: None,
    encoders: None,
    hardware: None,
});

fn cache() -> MutexGuard<'static, Caches> {
    CACHE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Re-runs binary, encoder and hardware detection. Called by "Re-scan engines".
pub fn reset_caches() {
    let mut guard = cache();
    *guard = Caches::default();
}

fn unavailable(reason: String) -> ConversionError {
    ConversionError::EngineUnavailable {
        engine: "FFmpeg".to_owned(),
        reason,
    }
}

fn locate(env_key: &str, binary: &str) -> Option<PathBuf> {
    sidecar::locate(env_key, binary, "ffmpeg")
}

fn require_both(
    ffmpeg: Option<PathBuf>,
    ffprobe: Option<PathBuf>,
) -> Result<(PathBuf, PathBuf), ConversionError> {
    match (ffmpeg, ffprobe) {
        (None, None) => Err(unavailable(
            "ffmpeg.exe and ffprobe.exe were not found. Bundle them in resources/ffmpeg/, set \
             UC_FFMPEG_PATH and UC_FFPROBE_PATH to their full paths, or install FFmpeg on PATH."
                .to_owned(),
        )),
        (None, Some(probe)) => Err(unavailable(format!(
            "ffmpeg.exe was not found (ffprobe was found at {}). Bundle it in resources/ffmpeg/ or \
             set UC_FFMPEG_PATH.",
            probe.display()
        ))),
        (Some(ffmpeg), None) => Err(unavailable(format!(
            "ffprobe.exe was not found (ffmpeg was found at {}). Output validation needs it; bundle \
             it in resources/ffmpeg/ or set UC_FFPROBE_PATH.",
            ffmpeg.display()
        ))),
        (Some(ffmpeg), Some(ffprobe)) => Ok((ffmpeg, ffprobe)),
    }
}

fn locate_tools() -> Result<Tools, ConversionError> {
    let (ffmpeg, ffprobe) = require_both(
        locate("UC_FFMPEG_PATH", "ffmpeg"),
        locate("UC_FFPROBE_PATH", "ffprobe"),
    )?;
    let version_text =
        sidecar::run_capturing(&ffmpeg, &["-version"], 4096, Duration::from_secs(15)).map_err(
            |error| {
                unavailable(format!(
                    "{} was found but could not be executed: {error}",
                    ffmpeg.display()
                ))
            },
        )?;
    let probe_text = sidecar::run_capturing(&ffprobe, &["-version"], 4096, Duration::from_secs(15))
        .map_err(|error| {
            unavailable(format!(
                "{} was found but could not be executed: {error}",
                ffprobe.display()
            ))
        })?;
    Ok(Tools {
        version: version_text.lines().next().unwrap_or("ffmpeg").to_owned(),
        ffprobe_version: probe_text.lines().next().map(str::to_owned),
        ffmpeg,
        ffprobe,
    })
}

pub fn tools() -> Result<Tools, ConversionError> {
    if let Some(found) = cache().tools.clone() {
        return Ok(found);
    }
    let found = locate_tools()?;
    cache().tools = Some(found.clone());
    Ok(found)
}

/// Encoder names advertised by this build (`libx264`, `aac`, `libvpx-vp9`…).
pub fn encoders(tools: &Tools) -> Result<Vec<String>, ConversionError> {
    if let Some(found) = cache().encoders.clone() {
        return Ok(found);
    }
    let text = sidecar::run_capturing_full(
        &tools.ffmpeg,
        &["-hide_banner", "-encoders"],
        1024 * 1024,
        Duration::from_secs(20),
    )?;
    let mut names = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        let mut parts = trimmed.split_whitespace();
        let Some(flags) = parts.next() else { continue };
        // Rows look like " V....D libx264  H.264 ...". The legend row has "="
        // where the name would be, so it is skipped below.
        if flags.len() < 6 {
            continue;
        }
        let kind = flags.as_bytes()[0];
        if kind != b'V' && kind != b'A' {
            continue;
        }
        if let Some(name) = parts.next()
            && name != "="
        {
            names.push(name.to_owned());
        }
    }
    cache().encoders = Some(names.clone());
    Ok(names)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareEncoder {
    /// ffmpeg encoder name, e.g. `h264_nvenc`.
    pub encoder: String,
    /// `h264` or `hevc`.
    pub codec: String,
    /// "NVIDIA NVENC", "Intel Quick Sync" or "AMD AMF".
    pub label: String,
    pub available: bool,
    pub reason: Option<String>,
}

/// Candidates worth testing. Presence in `-encoders` is not enough: a build can
/// list NVENC on a machine with no NVIDIA GPU, so each one is really asked to
/// encode one frame before the UI offers it.
const HARDWARE_CANDIDATES: &[(&str, &str, &str)] = &[
    ("h264_nvenc", "h264", "NVIDIA NVENC"),
    ("hevc_nvenc", "hevc", "NVIDIA NVENC"),
    ("h264_qsv", "h264", "Intel Quick Sync"),
    ("hevc_qsv", "hevc", "Intel Quick Sync"),
    ("h264_amf", "h264", "AMD AMF"),
    ("hevc_amf", "hevc", "AMD AMF"),
];

pub fn hardware_encoders(tools: &Tools) -> Result<Vec<HardwareEncoder>, ConversionError> {
    if let Some(found) = cache().hardware.clone() {
        return Ok(found);
    }
    let advertised = encoders(tools)?;
    let mut found = Vec::new();
    for (encoder, codec, label) in HARDWARE_CANDIDATES {
        if !advertised.iter().any(|name| name == encoder) {
            continue;
        }
        let (available, reason) = match test_encoder(tools, encoder) {
            Ok(()) => (true, None),
            Err(reason) => (false, Some(reason)),
        };
        found.push(HardwareEncoder {
            encoder: (*encoder).to_owned(),
            codec: (*codec).to_owned(),
            label: (*label).to_owned(),
            available,
            reason,
        });
    }
    cache().hardware = Some(found.clone());
    Ok(found)
}

fn test_encoder(tools: &Tools, encoder: &str) -> Result<(), String> {
    let args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=256x144:r=2:d=0.5",
        "-frames:v",
        "1",
        "-an",
        "-c:v",
        encoder,
        "-f",
        "null",
        "-",
    ];
    match sidecar::capture(&tools.ffmpeg, &args, 64 * 1024, Duration::from_secs(20)) {
        Ok(captured) if captured.status.success() => Ok(()),
        Ok(captured) => {
            let detail = captured.stderr.trim();
            Err(if detail.is_empty() {
                format!("{encoder} refused a one-frame test encode")
            } else {
                truncate_chars(detail, 300)
            })
        }
        Err(error) => Err(error.to_string()),
    }
}

fn truncate_chars(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_owned();
    }
    let mut kept: String = text.chars().take(limit).collect();
    kept.push('…');
    kept
}

/// The media engine is available only when both binaries exist and answer a
/// version probe. Parsing `-encoders` is deferred to the capabilities command.
pub fn probe() -> crate::engines::EngineInfo {
    use crate::engines::{EngineId, EngineInfo};
    match tools() {
        Ok(found) => EngineInfo {
            id: EngineId::Media,
            label: EngineId::Media.label().to_owned(),
            available: true,
            version: Some(found.version),
            unavailable_reason: None,
        },
        Err(ConversionError::EngineUnavailable { reason, .. }) => EngineInfo {
            id: EngineId::Media,
            label: EngineId::Media.label().to_owned(),
            available: false,
            version: None,
            unavailable_reason: Some(reason),
        },
        Err(error) => EngineInfo {
            id: EngineId::Media,
            label: EngineId::Media.label().to_owned(),
            available: false,
            version: None,
            unavailable_reason: Some(error.to_string()),
        },
    }
}

#[derive(Debug, Deserialize)]
struct RawProbe {
    #[serde(default)]
    streams: Vec<RawStream>,
    format: Option<RawFormat>,
}

#[derive(Debug, Deserialize)]
struct RawStream {
    index: u32,
    codec_name: Option<String>,
    codec_long_name: Option<String>,
    codec_type: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    r_frame_rate: Option<String>,
    avg_frame_rate: Option<String>,
    sample_rate: Option<String>,
    channels: Option<u32>,
    channel_layout: Option<String>,
    bit_rate: Option<String>,
    duration: Option<String>,
    #[serde(default)]
    tags: HashMap<String, String>,
    #[serde(default)]
    disposition: HashMap<String, i32>,
}

#[derive(Debug, Deserialize)]
struct RawFormat {
    format_name: Option<String>,
    format_long_name: Option<String>,
    duration: Option<String>,
    size: Option<String>,
    bit_rate: Option<String>,
    #[serde(default)]
    tags: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaStream {
    pub index: u32,
    pub kind: String,
    pub codec: String,
    pub codec_long: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub channel_layout: Option<String>,
    pub bit_rate: Option<u64>,
    pub duration_ms: Option<u64>,
    pub language: Option<String>,
    pub title: Option<String>,
    /// Cover art arrives as an MJPEG video stream; it is not a real video track.
    pub attached_pic: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub path: String,
    pub format_name: String,
    pub format_label: String,
    pub duration_ms: Option<u64>,
    pub size_bytes: u64,
    pub bit_rate: Option<u64>,
    pub title: Option<String>,
    pub streams: Vec<MediaStream>,
}

impl MediaInfo {
    pub fn audio_streams(&self) -> Vec<&MediaStream> {
        self.streams.iter().filter(|s| s.kind == "audio").collect()
    }

    pub fn primary_video(&self) -> Option<&MediaStream> {
        self.streams
            .iter()
            .find(|stream| stream.kind == "video" && !stream.attached_pic)
            .or_else(|| self.streams.iter().find(|stream| stream.kind == "video"))
    }

    pub fn has_real_video(&self) -> bool {
        self.streams
            .iter()
            .any(|stream| stream.kind == "video" && !stream.attached_pic)
    }
}

fn parse_seconds(value: Option<&str>) -> Option<u64> {
    let seconds: f64 = value?.trim().parse().ok()?;
    if !seconds.is_finite() || seconds < 0.0 {
        return None;
    }
    Some((seconds * 1000.0).round() as u64)
}

fn parse_rate(value: Option<&str>) -> Option<f64> {
    let text = value?.trim();
    let (numerator, denominator) = text.split_once('/')?;
    let numerator: f64 = numerator.parse().ok()?;
    let denominator: f64 = denominator.parse().ok()?;
    if denominator <= 0.0 || numerator <= 0.0 {
        return None;
    }
    let rate = numerator / denominator;
    (rate.is_finite() && rate > 0.0).then_some(rate)
}

fn parse_number<T: std::str::FromStr>(value: Option<&str>) -> Option<T> {
    value?.trim().parse().ok()
}

fn tag(tags: &HashMap<String, String>, key: &str) -> Option<String> {
    tags.iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(key))
        .map(|(_, value)| value.clone())
        .filter(|value| !value.trim().is_empty())
}

/// Runs ffprobe and maps its JSON into the shape the UI renders. Never panics
/// on unusual files: anything missing stays `None`.
pub fn inspect(tools: &Tools, path: &Path) -> Result<MediaInfo, ConversionError> {
    let target = path.display().to_string();
    let text = sidecar::run_capturing_full(
        &tools.ffprobe,
        &[
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &target,
        ],
        4 * 1024 * 1024,
        Duration::from_secs(30),
    )
    .map_err(|error| match error {
        ConversionError::Timeout { seconds } => ConversionError::Timeout { seconds },
        other => ConversionError::Unreadable {
            path: target.clone(),
            reason: other.to_string(),
        },
    })?;

    let raw: RawProbe =
        serde_json::from_str(&text).map_err(|error| ConversionError::Unreadable {
            path: target.clone(),
            reason: format!("ffprobe returned unreadable metadata: {error}"),
        })?;

    let meta = std::fs::metadata(path).ok();
    let format = raw.format.unwrap_or(RawFormat {
        format_name: None,
        format_long_name: None,
        duration: None,
        size: None,
        bit_rate: None,
        tags: HashMap::new(),
    });

    let streams = raw
        .streams
        .into_iter()
        .map(|stream| MediaStream {
            index: stream.index,
            kind: stream.codec_type.unwrap_or_else(|| "data".to_owned()),
            codec: stream.codec_name.unwrap_or_else(|| "unknown".to_owned()),
            codec_long: stream.codec_long_name,
            width: stream.width,
            height: stream.height,
            frame_rate: parse_rate(stream.avg_frame_rate.as_deref())
                .or_else(|| parse_rate(stream.r_frame_rate.as_deref())),
            sample_rate: parse_number(stream.sample_rate.as_deref()),
            channels: stream.channels,
            channel_layout: stream.channel_layout,
            bit_rate: parse_number(stream.bit_rate.as_deref()),
            duration_ms: parse_seconds(stream.duration.as_deref()),
            language: tag(&stream.tags, "language"),
            title: tag(&stream.tags, "title"),
            attached_pic: stream.disposition.get("attached_pic").copied().unwrap_or(0) == 1,
        })
        .collect::<Vec<_>>();

    let duration_ms = parse_seconds(format.duration.as_deref());
    Ok(MediaInfo {
        path: target,
        format_name: format.format_name.unwrap_or_else(|| "unknown".to_owned()),
        format_label: format
            .format_long_name
            .unwrap_or_else(|| "Unknown container".to_owned()),
        duration_ms,
        size_bytes: meta
            .map(|m| m.len())
            .unwrap_or_else(|| parse_number(format.size.as_deref()).unwrap_or(0)),
        bit_rate: parse_number(format.bit_rate.as_deref()),
        title: tag(&format.tags, "title"),
        streams,
    })
}

/// Whether ffprobe's container name is the one this format should have written.
pub(crate) fn container_matches(expected: FormatId, format_name: &str) -> bool {
    let accepted: &[&str] = match expected {
        FormatId::Mp3 => &["mp3"],
        FormatId::Wav => &["wav"],
        FormatId::Flac => &["flac"],
        FormatId::Aac => &["aac"],
        FormatId::M4a | FormatId::Alac => &["mp4", "mov", "m4a", "3gp", "mj2"],
        FormatId::Ogg | FormatId::Opus => &["ogg"],
        FormatId::Wma => &["asf"],
        FormatId::Aiff => &["aiff"],
        FormatId::Mp4 | FormatId::Mov | FormatId::ThreeGp => &["mp4", "mov", "3gp", "mj2"],
        FormatId::Mkv | FormatId::Webm => &["matroska", "webm"],
        FormatId::Avi => &["avi"],
        FormatId::Wmv => &["asf"],
        FormatId::Flv => &["flv"],
        FormatId::Mpeg => &["mpeg", "mpegts"],
        FormatId::Gif => &["gif"],
        _ => return false,
    };
    format_name
        .split(',')
        .map(str::trim)
        .any(|token| accepted.contains(&token))
}

/// Closes every media job: the file exists, ffprobe can read it, the container
/// is what was requested, and the stream the user asked for is really there.
pub fn validate_output(
    tools: &Tools,
    path: &Path,
    expected: FormatId,
) -> Result<u64, ConversionError> {
    let invalid = || ConversionError::InvalidOutput {
        path: path.display().to_string(),
    };
    let metadata = std::fs::metadata(path).map_err(|_| invalid())?;
    if metadata.len() == 0 {
        return Err(invalid());
    }
    let info = inspect(tools, path).map_err(|_| invalid())?;
    if !container_matches(expected, &info.format_name) {
        return Err(invalid());
    }

    let has_audio = info.streams.iter().any(|stream| stream.kind == "audio");
    let has_video = info.has_real_video();
    let ok = match expected.category() {
        FormatCategory::Audio => has_audio,
        FormatCategory::Video => has_video,
        FormatCategory::Image => {
            expected == FormatId::Gif && info.format_name == "gif" && has_video
        }
        _ => false,
    };
    if !ok {
        return Err(invalid());
    }
    Ok(metadata.len())
}

/// Global flags every conversion shares: no shell, no stdin, machine-readable
/// progress, and only the local-file protocol so a crafted input cannot make
/// FFmpeg fetch a remote resource.
pub fn base_args(input: &Path, start_ms: Option<u64>, duration_ms: Option<u64>) -> Vec<String> {
    let mut args = vec![
        "-hide_banner".to_owned(),
        "-nostdin".to_owned(),
        "-loglevel".to_owned(),
        "error".to_owned(),
        "-y".to_owned(),
        "-progress".to_owned(),
        "pipe:1".to_owned(),
        "-nostats".to_owned(),
        "-protocol_whitelist".to_owned(),
        "file".to_owned(),
    ];
    if let Some(start) = start_ms.filter(|value| *value > 0) {
        args.push("-ss".to_owned());
        args.push(format_seconds(start));
    }
    if let Some(duration) = duration_ms.filter(|value| *value > 0) {
        args.push("-t".to_owned());
        args.push(format_seconds(duration));
    }
    args.push("-i".to_owned());
    args.push(input.display().to_string());
    args
}

pub fn format_seconds(ms: u64) -> String {
    format!("{:.3}", ms as f64 / 1000.0)
}

/// Effective encoded duration, used to turn FFmpeg's out_time into a fraction.
pub fn effective_duration_ms(
    info: &MediaInfo,
    start_ms: Option<u64>,
    duration_ms: Option<u64>,
) -> Option<u64> {
    let start = start_ms.unwrap_or(0);
    let remaining = info.duration_ms.unwrap_or(0).saturating_sub(start);
    match (duration_ms.filter(|value| *value > 0), remaining) {
        (Some(limit), _) => Some(limit),
        (None, 0) => None,
        (None, left) => Some(left),
    }
}

fn parse_progress_micros(line: &str) -> Option<u64> {
    if let Some(value) = line
        .strip_prefix("out_time_us=")
        .or_else(|| line.strip_prefix("out_time_ms="))
    {
        // Both keys report microseconds; `out_time_ms` has done so historically.
        return value.trim().parse().ok();
    }
    let stamp = line.strip_prefix("out_time=")?.trim();
    let (clock, fraction) = stamp.split_once('.')?;
    let mut parts = clock.split(':');
    let hours: u64 = parts.next()?.parse().ok()?;
    let minutes: u64 = parts.next()?.parse().ok()?;
    let seconds: u64 = parts.next()?.parse().ok()?;
    let micros: u64 = fraction
        .chars()
        .take(6)
        .collect::<String>()
        .parse()
        .unwrap_or(0);
    Some(((hours * 3600 + minutes * 60 + seconds) * 1_000_000) + micros)
}

/// Starts FFmpeg, streams `-progress` lines into the job's progress sink, and
/// stops it on cancellation or timeout. stderr is drained concurrently and its
/// tail explains a non-zero exit.
pub fn run(
    tools: &Tools,
    args: &[String],
    cancel: &CancellationToken,
    progress: &dyn ProgressSink,
    total_ms: Option<u64>,
    timeout: Duration,
    stage: &str,
) -> Result<(), ConversionError> {
    let mut command = Command::new(&tools.ffmpeg);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        ConversionError::Other(format!(
            "could not start {}: {error}",
            tools.ffmpeg.display()
        ))
    })?;
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();

    progress.report(0.0, stage);

    std::thread::scope(|scope| {
        let progress_reader = scope.spawn(|| {
            let Some(pipe) = stdout.take() else { return };
            let mut reader = BufReader::new(pipe);
            let mut line = String::new();
            let mut last = 0.0_f64;
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {}
                }
                let Some(micros) = parse_progress_micros(line.trim()) else {
                    continue;
                };
                let Some(total) = total_ms.filter(|value| *value > 0) else {
                    continue;
                };
                let fraction = (micros as f64 / 1000.0 / total as f64).clamp(0.0, 0.99);
                if fraction > last + 0.001 {
                    last = fraction;
                    progress.report(fraction, stage);
                }
            }
        });

        let stderr_reader = scope.spawn(|| {
            let mut collected: Vec<u8> = Vec::new();
            if let Some(pipe) = stderr.as_mut() {
                let mut scratch = [0u8; 4096];
                loop {
                    match pipe.read(&mut scratch) {
                        Ok(0) | Err(_) => break,
                        Ok(read) => {
                            if collected.len() < MAX_DIAGNOSTIC {
                                collected.extend_from_slice(&scratch[..read]);
                            }
                        }
                    }
                }
            }
            String::from_utf8_lossy(&collected).trim().to_owned()
        });

        let deadline = Instant::now() + timeout;
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let stderr = stderr_reader.join().unwrap_or_default();
                    let _ = progress_reader.join();
                    if status.success() {
                        return Ok(());
                    }
                    let reason = if stderr.is_empty() {
                        "FFmpeg gave no reason".to_owned()
                    } else {
                        truncate_chars(&stderr, 900)
                    };
                    return Err(ConversionError::Other(format!(
                        "FFmpeg failed (exit {}): {reason}",
                        status
                            .code()
                            .map(|code| code.to_string())
                            .unwrap_or_else(|| "signal".to_owned())
                    )));
                }
                Ok(None) => {}
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stderr_reader.join();
                    let _ = progress_reader.join();
                    return Err(ConversionError::Other(format!(
                        "FFmpeg process error: {error}"
                    )));
                }
            }

            if cancel.is_cancelled() {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stderr_reader.join();
                let _ = progress_reader.join();
                return Err(ConversionError::Cancelled);
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stderr_reader.join();
                let _ = progress_reader.join();
                return Err(ConversionError::Timeout {
                    seconds: timeout.as_secs(),
                });
            }
            std::thread::sleep(POLL);
        }
    })
}

/// Raw stdout capture for `-f image2pipe` and `pipe:1` payloads.
fn run_raw(
    tools: &Tools,
    args: &[String],
    max_bytes: usize,
    timeout: Duration,
) -> Result<Vec<u8>, ConversionError> {
    let borrowed: Vec<&str> = args.iter().map(String::as_str).collect();
    let captured = sidecar::capture(&tools.ffmpeg, &borrowed, max_bytes, timeout)?;
    if !captured.status.success() {
        let detail = truncate_chars(captured.stderr.trim(), 600);
        return Err(ConversionError::Other(if detail.is_empty() {
            "FFmpeg produced no data".to_owned()
        } else {
            format!("FFmpeg failed: {detail}")
        }));
    }
    Ok(captured.stdout)
}

/// One poster frame as PNG bytes. `-ss` before `-i` seeks by keyframe first,
/// then decodes forward, so a thumbnail of a long file is fast.
pub fn thumbnail_png(
    tools: &Tools,
    input: &Path,
    at_ms: u64,
    width: u32,
) -> Result<Vec<u8>, ConversionError> {
    let width = width.clamp(64, 960);
    let args = vec![
        "-hide_banner".to_owned(),
        "-loglevel".to_owned(),
        "error".to_owned(),
        "-ss".to_owned(),
        format_seconds(at_ms),
        "-i".to_owned(),
        input.display().to_string(),
        "-frames:v".to_owned(),
        "1".to_owned(),
        "-vf".to_owned(),
        format!("scale={width}:-2"),
        "-an".to_owned(),
        "-f".to_owned(),
        "image2pipe".to_owned(),
        "-c:v".to_owned(),
        "png".to_owned(),
        "pipe:1".to_owned(),
    ];
    let bytes = run_raw(tools, &args, 16 * 1024 * 1024, Duration::from_secs(30))?;
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(ConversionError::Other(
            "FFmpeg returned something other than a PNG frame".to_owned(),
        ));
    }
    Ok(bytes)
}

/// Palette GIF filter shared by the real job and the preview, so what the user
/// sees is what the chosen settings actually produce.
pub(crate) fn gif_filter(fps: u32, width: u32, height: u32) -> String {
    let fps = fps.clamp(1, 30);
    let width = width.clamp(120, 1920);
    let height = height.clamp(0, 1080);
    // A single palette collected from the whole clip (stats_mode=diff) avoids
    // the colour flicker that per-frame palettes cause on camera movement.
    // With a height chosen the clip is letterboxed instead of stretched; without
    // one the source aspect ratio decides the height.
    let scale = if height >= 120 {
        format!(
            "scale={width}:{height}:force_original_aspect_ratio=decrease:flags=lanczos,\
             pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black"
        )
    } else {
        format!("scale={width}:-2:flags=lanczos")
    };
    format!(
        "fps={fps},{scale},split[s0][s1];\
         [s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a"
    )
}

/// A short, small GIF rendered from the same filter chain as the real job, so
/// the page preview shows what the chosen settings actually produce.
pub fn gif_preview(
    tools: &Tools,
    input: &Path,
    start_ms: Option<u64>,
    duration_ms: Option<u64>,
    fps: u32,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, ConversionError> {
    let fps = fps.clamp(1, 15);
    let width = width.clamp(120, 360);
    let duration = duration_ms.unwrap_or(2_500).clamp(300, 3_000);
    let path = std::env::temp_dir().join(format!("uc-gif-preview-{}.gif", uuid::Uuid::new_v4()));
    let args = vec![
        "-hide_banner".to_owned(),
        "-nostdin".to_owned(),
        "-loglevel".to_owned(),
        "error".to_owned(),
        "-y".to_owned(),
        "-protocol_whitelist".to_owned(),
        "file".to_owned(),
        "-ss".to_owned(),
        format_seconds(start_ms.unwrap_or(0)),
        "-t".to_owned(),
        format_seconds(duration),
        "-i".to_owned(),
        input.display().to_string(),
        "-an".to_owned(),
        "-vf".to_owned(),
        gif_filter(fps, width, height),
        "-loop".to_owned(),
        "0".to_owned(),
        "-f".to_owned(),
        "gif".to_owned(),
        path.display().to_string(),
    ];
    let result = (|| -> Result<Vec<u8>, ConversionError> {
        run(
            tools,
            &args,
            &CancellationToken::new(),
            &NullProgress,
            None,
            Duration::from_secs(60),
            "Building GIF preview",
        )?;
        let bytes = std::fs::read(&path).map_err(|error| {
            ConversionError::Other(format!("could not read the GIF preview: {error}"))
        })?;
        if bytes.len() < 4 || &bytes[..4] != b"GIF8" {
            return Err(ConversionError::Other(
                "the GIF preview was not a GIF".to_owned(),
            ));
        }
        if bytes.len() > 6 * 1024 * 1024 {
            return Err(ConversionError::Other(
                "the preview exceeded 6 MB; lower the width or frame rate".to_owned(),
            ));
        }
        Ok(bytes)
    })();
    let _ = std::fs::remove_file(&path);
    result
}

struct NullProgress;
impl ProgressSink for NullProgress {
    fn report(&self, _fraction: f64, _stage: &str) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_time_parses_both_key_formats() {
        assert_eq!(
            parse_progress_micros("out_time_us=1250000"),
            Some(1_250_000)
        );
        assert_eq!(
            parse_progress_micros("out_time_ms=2000000"),
            Some(2_000_000)
        );
        assert_eq!(
            parse_progress_micros("out_time=00:01:02.500000"),
            Some(62_500_000)
        );
        assert_eq!(parse_progress_micros("progress=continue"), None);
    }

    #[test]
    fn frame_rate_parses_fractional_rates() {
        assert!((parse_rate(Some("30000/1001")).unwrap() - 29.97).abs() < 0.01);
        assert_eq!(parse_rate(Some("0/0")), None);
        assert_eq!(parse_rate(Some("25/1")), Some(25.0));
    }

    #[test]
    fn container_families_are_matched_by_token() {
        assert!(container_matches(FormatId::Mp4, "mov,mp4,m4a,3gp,3g2,mj2"));
        assert!(container_matches(FormatId::Opus, "ogg"));
        assert!(container_matches(FormatId::Wmv, "asf"));
        assert!(!container_matches(FormatId::Mp3, "wav"));
    }

    #[test]
    fn a_missing_binary_is_named_in_the_error() {
        let no_ffmpeg = require_both(None, Some(PathBuf::from("C:/tools/ffprobe.exe")))
            .unwrap_err()
            .to_string();
        assert!(
            no_ffmpeg.contains("ffmpeg.exe was not found"),
            "{no_ffmpeg}"
        );
        assert!(no_ffmpeg.contains("ffprobe was found"), "{no_ffmpeg}");

        let no_ffprobe = require_both(Some(PathBuf::from("C:/tools/ffmpeg.exe")), None)
            .unwrap_err()
            .to_string();
        assert!(
            no_ffprobe.contains("ffprobe.exe was not found"),
            "{no_ffprobe}"
        );
        assert!(no_ffprobe.contains("UC_FFPROBE_PATH"), "{no_ffprobe}");

        let neither = require_both(None, None).unwrap_err().to_string();
        assert!(
            neither.contains("ffmpeg.exe and ffprobe.exe were not found"),
            "{neither}"
        );
        assert!(neither.contains("resources/ffmpeg"), "{neither}");

        assert!(
            require_both(
                Some(PathBuf::from("C:/tools/ffmpeg.exe")),
                Some(PathBuf::from("C:/tools/ffprobe.exe"))
            )
            .is_ok()
        );
    }

    #[test]
    fn a_process_that_runs_too_long_is_killed_and_reported_as_a_timeout() {
        let tools = tools().expect("the bundled FFmpeg is required for this test");
        let args = [
            "-hide_banner",
            "-loglevel",
            "error",
            "-re",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=64x64:rate=5:duration=10",
            "-f",
            "null",
            "-",
        ]
        .map(str::to_owned);
        let error = run(
            &tools,
            &args,
            &CancellationToken::new(),
            &NullProgress,
            None,
            Duration::from_millis(300),
            "Timing out",
        )
        .expect_err("a real-time source cannot finish in 300 ms");
        assert!(
            matches!(error, ConversionError::Timeout { .. }),
            "got {error}"
        );
    }

    #[test]
    fn output_validation_rejects_empty_and_unreadable_files() {
        let tools = tools().expect("the bundled FFmpeg is required for this test");
        let dir =
            std::env::temp_dir().join(format!("uc-ffmpeg-validation-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let empty = dir.join("empty.mp3");
        std::fs::write(&empty, b"").unwrap();
        assert!(matches!(
            validate_output(&tools, &empty, FormatId::Mp3),
            Err(ConversionError::InvalidOutput { .. })
        ));

        let garbage = dir.join("garbage.mp3");
        std::fs::write(&garbage, b"definitely not audio").unwrap();
        assert!(matches!(
            validate_output(&tools, &garbage, FormatId::Mp3),
            Err(ConversionError::InvalidOutput { .. })
        ));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
