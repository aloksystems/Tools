use serde::Serialize;

/// Internal error type. Display strings are written for humans and are surfaced
/// verbatim in the UI, so they name the file and the reason.
#[derive(Debug, thiserror::Error)]
pub enum ConversionError {
    #[error("{input} cannot be converted to {output}")]
    Unsupported { input: String, output: String },

    #[error("{path} is password-protected. Enter the password for this job.")]
    NeedsPassword { path: String },

    #[error("the password for {path} was refused")]
    WrongPassword { path: String },

    #[error(
        "{path} is password-protected, and LibreOffice cannot open an encrypted document from the command line. Remove the password and try again."
    )]
    PasswordUnsupported { path: String },

    /// A listing entry would escape the destination, is a link, repeats another
    /// entry, or otherwise cannot be extracted safely. Jobs stop before writing.
    #[error("{path} was not extracted: {reason}")]
    ArchiveSecurity { path: String, reason: String },

    /// Declared uncompressed size or entry count is beyond the configured
    /// extraction ceiling. Checked before extraction, not after.
    #[error("{path} declares {detail}, above the extraction limits in Settings")]
    ArchiveLimit { path: String, detail: String },

    #[error("the {engine} engine is not available: {reason}")]
    EngineUnavailable { engine: String, reason: String },

    #[error("could not read {path}")]
    Unreadable { path: String, reason: String },

    #[error("{path} is damaged and could not be decoded")]
    Corrupt { path: String },

    #[error("output {path} was produced but is not a valid file")]
    InvalidOutput { path: String },

    #[error("conversion cancelled")]
    Cancelled,

    #[error("input is {actual_mb} MB, above the {limit_mb} MB limit set in Settings")]
    TooLarge { actual_mb: u64, limit_mb: u64 },

    #[error("image is {pixels} megapixels, over the {limit} megapixel decoding safety limit")]
    PixelLimit { pixels: u64, limit: u64 },

    #[error("not enough free space on {drive}: about {need_mb} MB needed, {free_mb} MB free")]
    DiskSpace {
        drive: String,
        need_mb: u64,
        free_mb: u64,
    },

    #[error("operation timed out after {seconds} seconds")]
    Timeout { seconds: u64 },

    #[error("image processing failed: {0}")]
    Image(String),

    #[error("{0}")]
    Database(String),

    #[error("{0}")]
    Other(String),
}

impl ConversionError {
    /// Stable discriminator for the frontend, so it can style or act on a
    /// failure without string-matching the human-readable message.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Unsupported { .. } => "unsupported",
            Self::NeedsPassword { .. } => "needsPassword",
            Self::WrongPassword { .. } => "wrongPassword",
            Self::PasswordUnsupported { .. } => "passwordUnsupported",
            Self::ArchiveSecurity { .. } => "archiveSecurity",
            Self::ArchiveLimit { .. } => "archiveLimit",
            Self::EngineUnavailable { .. } => "engineUnavailable",
            Self::Unreadable { .. } => "unreadable",
            Self::Corrupt { .. } => "corrupt",
            Self::InvalidOutput { .. } => "invalidOutput",
            Self::Cancelled => "cancelled",
            Self::TooLarge { .. } => "tooLarge",
            Self::PixelLimit { .. } => "pixelLimit",
            Self::DiskSpace { .. } => "diskSpace",
            Self::Timeout { .. } => "timeout",
            Self::Image(_) => "image",
            Self::Database(_) => "database",
            Self::Other(_) => "other",
        }
    }
}

/// The shape Tauri commands actually return.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub kind: &'static str,
    pub message: String,
}

pub type CmdResult<T> = Result<T, AppError>;

impl From<ConversionError> for AppError {
    fn from(error: ConversionError) -> Self {
        AppError {
            kind: error.kind(),
            message: error.to_string(),
        }
    }
}

impl From<AppError> for ConversionError {
    fn from(error: AppError) -> Self {
        ConversionError::Other(error.message)
    }
}

impl From<std::io::Error> for ConversionError {
    fn from(error: std::io::Error) -> Self {
        ConversionError::Unreadable {
            path: String::new(),
            reason: error.to_string(),
        }
    }
}

impl AppError {
    /// For failures that originate outside the engine layer (queue closed,
    /// unknown job id) and therefore have no `ConversionError` to convert from.
    pub fn new<M: Into<String>>(kind: &'static str, message: M) -> Self {
        AppError {
            kind,
            message: message.into(),
        }
    }
}
