pub mod archive;
pub mod document;
pub mod ffmpeg;
pub mod image;
pub mod media;
pub mod ocr;
pub mod pdf;
pub mod pdfium;
pub mod sidecar;

use crate::core::format::{self, FormatId};
use crate::core::job::ConversionJob;
use crate::error::ConversionError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineId {
    Image,
    Imagemagick,
    Pdf,
    Media,
    Document,
    Archive,
    Ocr,
}

impl EngineId {
    pub fn label(self) -> &'static str {
        match self {
            EngineId::Image => "Rust image",
            EngineId::Imagemagick => "ImageMagick",
            EngineId::Pdf => "PDF engine",
            EngineId::Media => "FFmpeg",
            EngineId::Document => "LibreOffice",
            EngineId::Archive => "7-Zip",
            EngineId::Ocr => "Tesseract OCR",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub id: EngineId,
    pub label: String,
    pub available: bool,
    pub version: Option<String>,
    pub unavailable_reason: Option<String>,
}

impl EngineInfo {
    /// What a job returns when it reaches an engine that cannot run here.
    pub fn unavailable_error(&self) -> ConversionError {
        ConversionError::EngineUnavailable {
            engine: self.label.clone(),
            reason: self
                .unavailable_reason
                .clone()
                .unwrap_or_else(|| "engine is not installed".to_owned()),
        }
    }
}

/// Cooperative cancellation. Engines poll it between units of work, which is the
/// only way to stop a child process without orphaning it.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken(Arc<AtomicBool>);

impl CancellationToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Implemented by the queue so engines report progress without knowing anything
/// about Tauri events.
pub trait ProgressSink: Send + Sync {
    /// `fraction` is 0.0 – 1.0; `stage` is a short human label.
    fn report(&self, fraction: f64, stage: &str);
}

pub struct EngineContext<'a> {
    pub job: &'a ConversionJob,
    /// Scratch space under the app data folder. Every sidecar job gets its own
    /// subdirectory beneath this and removes it when it finishes.
    pub temp_dir: &'a Path,
    pub progress: &'a dyn ProgressSink,
    pub cancel: &'a CancellationToken,
    /// Timeouts and extraction ceilings chosen in Settings.
    pub settings: &'a crate::core::settings::AppSettings,
    /// Password for this job, kept in memory by the queue. Never serialised,
    /// never written to history and never included in an error message.
    pub secret: Option<&'a str>,
}

/// Settings arrive as JSON from the UI. Anything unrecognisable falls back to
/// the engine's own defaults rather than failing the job.
pub fn parse_settings<T: serde::de::DeserializeOwned>(value: &serde_json::Value, default: T) -> T {
    serde_json::from_value(value.clone()).unwrap_or(default)
}

/// Engines poll this between units of work — the only way to stop a long batch
/// without leaving a half-written file behind.
pub(crate) fn checked_cancel(cancel: &CancellationToken) -> Result<(), ConversionError> {
    if cancel.is_cancelled() {
        Err(ConversionError::Cancelled)
    } else {
        Ok(())
    }
}

pub(crate) fn unreadable(path: &Path, reason: impl std::fmt::Display) -> ConversionError {
    ConversionError::Unreadable {
        path: path.display().to_string(),
        reason: reason.to_string(),
    }
}

/// First bytes of a file, for the signature check that closes every job.
pub(crate) fn read_head(path: &Path, bytes: usize) -> Result<Vec<u8>, ConversionError> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|_| ConversionError::InvalidOutput {
        path: path.display().to_string(),
    })?;
    let mut buffer = vec![0u8; bytes];
    let read = file
        .read(&mut buffer)
        .map_err(|_| ConversionError::InvalidOutput {
            path: path.display().to_string(),
        })?;
    buffer.truncate(read);
    Ok(buffer)
}

/// A job only reports success for a file that exists, is not empty, and really
/// starts with the signature of the format it claims.
pub(crate) fn validate_output(path: &Path, expected: FormatId) -> Result<u64, ConversionError> {
    let invalid = || ConversionError::InvalidOutput {
        path: path.display().to_string(),
    };
    let metadata = std::fs::metadata(path).map_err(|_| invalid())?;
    let detected = format::detect_from_head(&read_head(path, 64)?);
    if metadata.len() == 0 || !format::signatures_compatible(expected, detected) {
        return Err(invalid());
    }
    Ok(metadata.len())
}

/// One replaceable conversion backend. Supporting a new format means adding a
/// row to `core::registry`, not touching this trait or the queue.
/// Per-job scratch directory under the app's temp root. Removed on drop, on
/// success, on error and on cancellation — LibreOffice profiles and archive
/// staging trees never outlive the job.
pub(crate) struct ScratchDir {
    path: std::path::PathBuf,
}

impl ScratchDir {
    pub fn create(base: &Path, label: &str) -> Result<Self, ConversionError> {
        let path = base.join(label);
        std::fs::create_dir_all(&path).map_err(|error| {
            ConversionError::Other(format!(
                "could not create temporary folder {}: {error}",
                path.display()
            ))
        })?;
        Ok(ScratchDir { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for ScratchDir {
    fn drop(&mut self) {
        // A still-shutting-down sidecar on Windows can briefly hold a handle;
        // the temp root is purged at next startup as a fallback.
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

pub trait ConversionEngine: Send + Sync {
    fn id(&self) -> EngineId;

    /// Whether this backend can run at all on this machine right now.
    fn probe(&self) -> EngineInfo;

    /// Produce `job.output_path` from `job.input_path`; return the output size.
    fn convert(&self, ctx: &EngineContext) -> Result<u64, ConversionError>;

    /// Used by the queue to avoid stacking memory-hungry jobs.
    fn is_memory_heavy(&self) -> bool {
        false
    }

    /// Whether this particular job should sit behind the heavy gate. A media
    /// engine can encode a 4K video and extract a ringtone from the same file;
    /// only the first should wait for a heavy slot.
    fn is_heavy_job(&self, _job: &ConversionJob) -> bool {
        self.is_memory_heavy()
    }
}

pub fn all_engines() -> Vec<Arc<dyn ConversionEngine>> {
    vec![
        Arc::new(image::ImageEngine),
        Arc::new(image::ImageMagickEngine::new()),
        Arc::new(pdf::PdfEngine),
        Arc::new(media::MediaEngine),
        Arc::new(document::DocumentEngine),
        Arc::new(archive::ArchiveEngine),
        Arc::new(ocr::OcrEngine),
    ]
}

/// Sink for engine tests: they assert on files, never on progress chatter.
#[cfg(test)]
pub(crate) struct NullProgress;

#[cfg(test)]
impl ProgressSink for NullProgress {
    fn report(&self, _fraction: f64, _stage: &str) {}
}
