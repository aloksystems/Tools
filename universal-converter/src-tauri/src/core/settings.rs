use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OutputDirectoryMode {
    /// Drop the result next to the source file.
    Source,
    /// Drop the result in a `Converted` folder next to the source file.
    Subfolder,
    /// Always write to `customOutputDirectory`.
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CollisionPolicy {
    /// Write `name (1).ext`, then `(2)`, and so on.
    Rename,
    /// Replace the existing file.
    Overwrite,
    /// Leave the existing file alone and mark the job skipped.
    Skip,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemeChoice {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub concurrent_jobs: usize,
    pub output_directory_mode: OutputDirectoryMode,
    pub custom_output_directory: Option<String>,
    pub collision_policy: CollisionPolicy,
    pub theme: ThemeChoice,
    pub max_input_mb: u64,
    /// Wall-clock ceiling for one LibreOffice conversion. A hung writer process
    /// is terminated and reported, never left running.
    pub document_timeout_seconds: u64,
    /// Ceiling for one 7-Zip creation, extraction or test operation.
    pub archive_timeout_seconds: u64,
    /// Ceiling for one Tesseract invocation. A document is rendered and OCR'd
    /// page by page, so this bounds each page rather than the whole batch.
    pub ocr_timeout_seconds: u64,
    /// Refuse to extract an archive whose declared uncompressed size exceeds
    /// this, before a single byte is written.
    pub max_extraction_mb: u64,
    /// Refuse archives declaring more entries than this (duplicate-bomb guard).
    pub max_extraction_files: u64,
    pub delete_temp_on_exit: bool,
    /// False until the welcome screen has been acknowledged once.
    pub welcome_completed: bool,
    /// Opt-in Windows toast when a job finishes while the window is in the background.
    pub native_notifications: bool,
    /// Explicit tool paths chosen in Settings → Engines, keyed by engine id
    /// (`ffmpeg`, `ffprobe`, `tesseract`, `tessdata`, `libreoffice`, `7zip`,
    /// `qpdf`, `pdfium`). They take precedence over bundled copies and PATH.
    pub engine_paths: BTreeMap<String, String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            concurrent_jobs: 2,
            output_directory_mode: OutputDirectoryMode::Subfolder,
            custom_output_directory: None,
            collision_policy: CollisionPolicy::Rename,
            theme: ThemeChoice::Dark,
            max_input_mb: 4096,
            document_timeout_seconds: 300,
            archive_timeout_seconds: 600,
            ocr_timeout_seconds: 300,
            max_extraction_mb: 20 * 1024,
            max_extraction_files: 100_000,
            delete_temp_on_exit: true,
            welcome_completed: false,
            native_notifications: false,
            engine_paths: BTreeMap::new(),
        }
    }
}
