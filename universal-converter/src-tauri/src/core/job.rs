use crate::core::format::FormatId;
use crate::engines::EngineId;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

/// What a job does. Conversion was the only operation in earlier phases; the
/// same queue now also creates and extracts archives, so the worker can pick the
/// right engine behaviour without a parallel queue.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobOperation {
    #[default]
    Convert,
    CreateArchive,
    ExtractArchive,
    Ocr,
}

/// A password that travels to Rust but must never be serialised into a job,
/// history row, preset or log line. `Debug` is redacted on purpose.
#[derive(Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(transparent)]
pub struct SecretString(String);

impl SecretString {
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for SecretString {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SecretString(<redacted>)")
    }
}

impl JobStatus {
    pub fn is_finished(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }
}

/// Everything the queue needs to execute one conversion, and everything the UI
/// needs to render its row. Mirrors `ConversionJob` in the TypeScript types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionJob {
    pub id: String,
    pub input_path: String,
    pub input_name: String,
    /// All files this job reads. Single-file jobs carry one entry, which is the
    /// same as `input_path`; merge and reorder carry the whole ordered list.
    pub inputs: Vec<String>,
    pub input_format: FormatId,
    pub output_format: FormatId,
    pub operation: JobOperation,
    pub engine: EngineId,
    /// Produced file for conversions and archive creation; destination folder
    /// for extraction.
    pub output_path: String,
    /// Archive entries the user ticked. Empty means "everything".
    pub selected_entries: Vec<String>,
    pub settings: serde_json::Value,
    /// 0.0 – 100.0. Engines that cannot measure progress stay at 0 and report a stage.
    pub progress: f64,
    pub status: JobStatus,
    pub error: Option<String>,
    pub error_kind: Option<String>,
    pub created_at_ms: u64,
    pub started_at_ms: Option<u64>,
    pub finished_at_ms: Option<u64>,
    pub input_bytes: u64,
    pub output_bytes: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobRequest {
    pub input_path: String,
    pub output_format: FormatId,
    #[serde(default)]
    pub operation: JobOperation,
    #[serde(default)]
    pub settings: serde_json::Value,
    /// Overrides the directory implied by app settings for this job only. For
    /// extraction this is the parent folder the destination is created in.
    #[serde(default)]
    pub output_directory: Option<String>,
    /// Extra inputs for operations that consume several files at once (merge,
    /// archive creation). `input_path` stays the first file.
    #[serde(default)]
    pub extra_inputs: Vec<String>,
    /// Name for the produced file or extraction folder.
    #[serde(default)]
    pub output_name: Option<String>,
    /// Archive entries to extract. Empty means the whole archive; a batch of
    /// archives only supports full extraction.
    #[serde(default)]
    pub selected_entries: Vec<String>,
    /// Never stored on the job: the queue keeps it in memory only.
    #[serde(default)]
    pub password: Option<SecretString>,
}

impl JobRequest {
    /// Every input this job reads, in the order the user arranged them.
    pub fn inputs(&self) -> Vec<&str> {
        let mut all = Vec::with_capacity(self.extra_inputs.len() + 1);
        all.push(self.input_path.as_str());
        all.extend(self.extra_inputs.iter().map(String::as_str));
        all
    }

    pub fn secret(&self) -> Option<&str> {
        self.password
            .as_ref()
            .map(SecretString::expose)
            .filter(|value| !value.is_empty())
    }

    /// Tests build requests without repeating the fields single-file jobs never use.
    #[cfg(test)]
    pub fn for_test(inputs: &[&str], output_format: FormatId, settings: serde_json::Value) -> Self {
        JobRequest {
            input_path: inputs[0].to_owned(),
            output_format,
            operation: JobOperation::Convert,
            settings,
            output_directory: None,
            extra_inputs: inputs[1..].iter().map(|path| (*path).to_owned()).collect(),
            output_name: None,
            selected_entries: Vec::new(),
            password: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileProbe {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub format: FormatId,
    pub is_directory: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub page_count: Option<u32>,
    pub duration_ms: Option<u64>,
    /// Set when the signature and the extension disagree, so the UI can warn.
    pub extension_mismatch: Option<String>,
    pub unreadable: Option<String>,
}

fn now_ms() -> u64 {
    crate::utils::time::now_ms()
}

impl ConversionJob {
    pub fn new(
        request: &JobRequest,
        input_format: FormatId,
        engine: EngineId,
        output_path: std::path::PathBuf,
        input_bytes: u64,
    ) -> Self {
        let input = std::path::Path::new(&request.input_path);
        ConversionJob {
            id: Uuid::new_v4().to_string(),
            input_path: request.input_path.clone(),
            inputs: request.inputs().into_iter().map(str::to_owned).collect(),
            input_name: input
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| request.input_path.clone()),
            input_format,
            output_format: request.output_format,
            operation: request.operation,
            engine,
            output_path: output_path.to_string_lossy().into_owned(),
            selected_entries: request.selected_entries.clone(),
            settings: request.settings.clone(),
            progress: 0.0,
            status: JobStatus::Queued,
            error: None,
            error_kind: None,
            created_at_ms: now_ms(),
            started_at_ms: None,
            finished_at_ms: None,
            input_bytes,
            output_bytes: None,
        }
    }

    pub fn mark_started(&mut self) {
        self.status = JobStatus::Processing;
        self.started_at_ms = Some(now_ms());
    }

    pub fn mark_completed(&mut self, output_bytes: u64) {
        self.status = JobStatus::Completed;
        self.progress = 100.0;
        self.output_bytes = Some(output_bytes);
        self.finished_at_ms = Some(now_ms());
        self.error = None;
        self.error_kind = None;
    }

    pub fn mark_failed(&mut self, error: &crate::error::ConversionError) {
        self.status = JobStatus::Failed;
        self.error = Some(error.to_string());
        self.error_kind = Some(error.kind().to_string());
        self.finished_at_ms = Some(now_ms());
    }

    pub fn mark_cancelled(&mut self) {
        self.status = JobStatus::Cancelled;
        self.finished_at_ms = Some(now_ms());
    }

    /// Used only by startup recovery, after the process that owned this job is
    /// known to be gone. The output path may hold a partial file; the error says
    /// so instead of pretending the conversion produced something usable.
    pub fn mark_interrupted(&mut self) {
        self.status = JobStatus::Failed;
        self.error = Some(
            "Universal Converter stopped before this job finished. Any partial output was left in place — do not use it, and retry if you still need the result."
                .to_owned(),
        );
        self.error_kind = Some("interrupted".to_owned());
        self.finished_at_ms = Some(now_ms());
    }
}
