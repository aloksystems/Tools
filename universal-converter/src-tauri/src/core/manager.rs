use crate::core::format::{self, FormatId};
use crate::core::job::{ConversionJob, FileProbe, JobOperation, JobRequest};
use crate::core::registry;
use crate::core::settings::AppSettings;
use crate::engines::archive;
use crate::engines::{EngineId, EngineInfo, all_engines};
use crate::error::ConversionError;
use crate::utils::{limits, paths};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub enum PlanOutcome {
    /// Ready to enqueue. The password rides beside the job, never inside it.
    Ready {
        job: Box<ConversionJob>,
        secret: Option<String>,
    },
    /// Destination exists and the collision policy is Skip.
    Skipped(PathBuf),
}

/// Turns a user request into an executable job: detect, validate, route, plan output.
/// Every module goes through here so no engine is ever handed a file it cannot read.
pub struct ConversionManager {
    engines: Vec<Arc<dyn crate::engines::ConversionEngine>>,
    probe_cache: Mutex<HashMap<EngineId, EngineInfo>>,
}

impl Default for ConversionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ConversionManager {
    pub fn new() -> Self {
        ConversionManager {
            engines: all_engines(),
            probe_cache: Mutex::new(HashMap::new()),
        }
    }

    pub fn engine(&self, id: EngineId) -> Option<Arc<dyn crate::engines::ConversionEngine>> {
        self.engines
            .iter()
            .find(|engine| engine.id() == id)
            .cloned()
    }

    /// Cached because probing FFmpeg or LibreOffice means spawning a process.
    pub fn engine_info(&self, id: EngineId) -> EngineInfo {
        if let Some(cached) = self
            .probe_cache
            .lock()
            .ok()
            .and_then(|cache| cache.get(&id).cloned())
        {
            return cached;
        }
        let info = self
            .engine(id)
            .map(|engine| engine.probe())
            .unwrap_or_else(|| EngineInfo {
                id,
                label: id.label().to_owned(),
                available: false,
                version: None,
                unavailable_reason: Some("engine is not implemented".to_owned()),
            });
        if let Ok(mut cache) = self.probe_cache.lock() {
            cache.insert(id, info.clone());
        }
        info
    }

    pub fn invalidate_probe_cache(&self) {
        if let Ok(mut cache) = self.probe_cache.lock() {
            cache.clear();
        }
    }

    /// Probe every engine concurrently, keeping the declaration order. Each
    /// probe may start a process (LibreOffice can take seconds during a cold
    /// start), so running them one after another made the first UI load look
    /// like a hang even though the window itself was already visible.
    pub fn engine_infos(&self) -> Vec<EngineInfo> {
        let mut probed: Vec<Option<EngineInfo>> = vec![None; self.engines.len()];
        std::thread::scope(|scope| {
            let handles: Vec<_> = self
                .engines
                .iter()
                .enumerate()
                .map(|(index, engine)| {
                    let manager = self;
                    scope.spawn(move || {
                        let id = engine.id();
                        let started = std::time::Instant::now();
                        let info = manager.engine_info(id);
                        log::info!(
                            "engine {} probe finished in {} ms",
                            id.label(),
                            started.elapsed().as_millis()
                        );
                        (index, info)
                    })
                })
                .collect();
            for handle in handles {
                if let Ok((index, info)) = handle.join() {
                    probed[index] = Some(info);
                }
            }
        });
        probed
            .into_iter()
            .enumerate()
            .map(|(index, info)| {
                info.unwrap_or_else(|| {
                    let id = self.engines[index].id();
                    EngineInfo {
                        id,
                        label: id.label().to_owned(),
                        available: false,
                        version: None,
                        unavailable_reason: Some(
                            "the engine probe stopped unexpectedly".to_owned(),
                        ),
                    }
                })
            })
            .collect()
    }

    pub fn is_available(&self, id: EngineId) -> bool {
        self.engine_info(id).available
    }

    fn require_engine(&self, id: EngineId) -> Result<(), ConversionError> {
        let info = self.engine_info(id);
        if info.available {
            Ok(())
        } else {
            Err(info.unavailable_error())
        }
    }

    /// Identify a file or folder for the UI. Never trusts the extension.
    pub fn probe(&self, path: &Path) -> FileProbe {
        let name = path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string());

        let size_bytes = match std::fs::metadata(path) {
            Ok(metadata) if metadata.is_dir() => {
                return FileProbe {
                    path: path.display().to_string(),
                    name,
                    size_bytes: 0,
                    format: FormatId::Unknown,
                    is_directory: true,
                    width: None,
                    height: None,
                    page_count: None,
                    duration_ms: None,
                    extension_mismatch: None,
                    unreadable: None,
                };
            }
            Ok(metadata) if metadata.is_file() => metadata.len(),
            Ok(_) => {
                return unreadable_probe(path, &name, "not a regular file or folder");
            }
            Err(error) => {
                return unreadable_probe(path, &name, &error.to_string());
            }
        };

        let detected = format::detect_from_path(path);
        if detected == FormatId::Unknown {
            return unreadable_probe(path, &name, "unrecognised file signature");
        }

        let mismatch = if format::extension_matches(path, detected) {
            None
        } else {
            Some(format!(
                "extension says {} but the contents are {}",
                path.extension()
                    .map(|ext| ext.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "nothing".to_owned()),
                detected.label()
            ))
        };

        let (width, height) = match detected.category() {
            format::FormatCategory::Image => image_dimensions(path),
            _ => (None, None),
        };

        let page_count = match detected {
            FormatId::Pdf => crate::engines::pdf::page_count(path),
            _ => None,
        };

        FileProbe {
            path: path.display().to_string(),
            name,
            size_bytes,
            format: detected,
            is_directory: false,
            width,
            height,
            page_count,
            duration_ms: None,
            extension_mismatch: mismatch,
            unreadable: None,
        }
    }

    pub fn plan(
        &self,
        request: &JobRequest,
        settings: &AppSettings,
    ) -> Result<PlanOutcome, ConversionError> {
        match request.operation {
            JobOperation::Convert => self.plan_convert(request, settings),
            JobOperation::CreateArchive => self.plan_create_archive(request, settings),
            JobOperation::ExtractArchive => self.plan_extract_archive(request, settings),
            JobOperation::Ocr => self.plan_ocr(request, settings),
        }
    }

    fn plan_ocr(
        &self,
        request: &JobRequest,
        settings: &AppSettings,
    ) -> Result<PlanOutcome, ConversionError> {
        if !request.extra_inputs.is_empty() {
            return Err(ConversionError::Other(
                "OCR reads one file per job; a batch already queues each file separately"
                    .to_owned(),
            ));
        }
        self.require_engine(EngineId::Ocr)?;
        if !crate::engines::ocr::OCR_OUTPUTS.contains(&request.output_format) {
            return Err(ConversionError::Unsupported {
                input: "images and PDFs".to_owned(),
                output: request.output_format.label().to_owned(),
            });
        }

        let source = Path::new(&request.input_path);
        let input_bytes = limits::check_input_size(source, settings.max_input_mb)?;
        let detected = format::detect_from_path(source);
        if !crate::engines::ocr::is_ocr_input(detected) {
            return Err(ConversionError::Unsupported {
                input: detected.label().to_owned(),
                output: request.output_format.label().to_owned(),
            });
        }
        // PDF input is rasterised by PDFium before Tesseract sees a page, so a
        // missing renderer is refused now rather than halfway through a batch.
        if detected == FormatId::Pdf && !crate::engines::pdfium::is_available() {
            return Err(ConversionError::EngineUnavailable {
                engine: "PDFium".to_owned(),
                reason: "PDF OCR needs pdfium.dll to render pages. Put it in resources/pdfium/, \
                         or set UC_PDFIUM_PATH to its full path."
                    .to_owned(),
            });
        }

        let decision = paths::plan_output_job(
            &[source],
            request.output_format,
            settings,
            request.output_directory.as_deref().map(Path::new),
            request.output_name.as_deref(),
        )?;
        let output_path = match decision {
            paths::OutputDecision::Proceed(path) => path,
            paths::OutputDecision::Skipped(path) => return Ok(PlanOutcome::Skipped(path)),
        };
        limits::check_output_space(&output_path, input_bytes)?;

        let mut job =
            ConversionJob::new(request, detected, EngineId::Ocr, output_path, input_bytes);
        job.settings = scrub_secrets(job.settings);

        Ok(PlanOutcome::Ready {
            job: Box::new(job),
            secret: request.secret().map(str::to_owned),
        })
    }

    fn plan_convert(
        &self,
        request: &JobRequest,
        settings: &AppSettings,
    ) -> Result<PlanOutcome, ConversionError> {
        // Validate every file the engine will read, not only the first — merge
        // would otherwise sail past a size or signature problem in file three.
        let sources: Vec<&Path> = request.inputs().into_iter().map(Path::new).collect();
        let mut input_bytes = 0_u64;
        let mut detected: Option<FormatId> = None;
        for path in &sources {
            input_bytes += limits::check_input_size(path, settings.max_input_mb)?;
            let format = format::detect_from_path(path);
            if format == FormatId::Unknown {
                if format::encrypted_office_path(path) {
                    return Err(encrypted_document_error(path, request.secret()));
                }
                return Err(ConversionError::Unreadable {
                    path: path.display().to_string(),
                    reason: "unrecognised file signature".to_owned(),
                });
            }
            if registry::candidates(format, request.output_format).is_empty() {
                return Err(ConversionError::Unsupported {
                    input: format.label().to_owned(),
                    output: request.output_format.label().to_owned(),
                });
            }
            if is_office_container(format) && format::encrypted_office_path(path) {
                return Err(encrypted_document_error(path, request.secret()));
            }
            if detected.is_none() {
                detected = Some(format);
            }
        }
        let detected = detected.expect("a job request always carries its first input");

        let candidates = registry::candidates(detected, request.output_format);
        let engine = self.choose_engine(&candidates, detected, request.output_format)?;

        // LibreOffice and 7-Zip operations have one logical input per job. The
        // queue still batches by submitting one job per file; PDF merge keeps
        // its multi-input path because it has a real merge implementation.
        if matches!(engine, EngineId::Document | EngineId::Archive) && sources.len() > 1 {
            return Err(ConversionError::Other(format!(
                "{} jobs convert one file at a time; the batch already queues each file separately",
                engine.label()
            )));
        }

        let decision = paths::plan_output_job(
            &sources,
            request.output_format,
            settings,
            request.output_directory.as_deref().map(Path::new),
            request.output_name.as_deref(),
        )?;
        let output_path = match decision {
            paths::OutputDecision::Proceed(path) => path,
            paths::OutputDecision::Skipped(path) => return Ok(PlanOutcome::Skipped(path)),
        };

        limits::check_output_space(&output_path, input_bytes)?;

        let mut job = ConversionJob::new(request, detected, engine, output_path, input_bytes);
        // These engines receive their password beside the job. A password-shaped
        // key left in settings would otherwise ride into events and history.
        if matches!(engine, EngineId::Document | EngineId::Archive) {
            job.settings = scrub_secrets(job.settings);
        }

        Ok(PlanOutcome::Ready {
            job: Box::new(job),
            secret: request.secret().map(str::to_owned),
        })
    }

    fn plan_create_archive(
        &self,
        request: &JobRequest,
        settings: &AppSettings,
    ) -> Result<PlanOutcome, ConversionError> {
        if !request.output_format.is_creatable_archive() {
            return Err(ConversionError::Unsupported {
                input: "files and folders".to_owned(),
                output: request.output_format.label().to_owned(),
            });
        }
        self.require_engine(EngineId::Archive)?;

        let sources: Vec<&Path> = request.inputs().into_iter().map(Path::new).collect();
        if sources.is_empty() {
            return Err(ConversionError::Other(
                "choose at least one file or folder to archive".to_owned(),
            ));
        }
        let scanned = archive::scan_sources(&sources, settings)?;
        if scanned.bytes > settings.max_input_mb.saturating_mul(1024 * 1024) {
            return Err(ConversionError::TooLarge {
                actual_mb: scanned.bytes / (1024 * 1024),
                limit_mb: settings.max_input_mb.max(1),
            });
        }

        // A single source keeps its own name; several sources need one neutral
        // archive name unless the user typed something else.
        let fallback_name = (sources.len() > 1).then_some("archive");
        let decision = paths::plan_output_job(
            &sources,
            request.output_format,
            settings,
            request.output_directory.as_deref().map(Path::new),
            request.output_name.as_deref().or(fallback_name),
        )?;
        let output_path = match decision {
            paths::OutputDecision::Proceed(path) => path,
            paths::OutputDecision::Skipped(path) => return Ok(PlanOutcome::Skipped(path)),
        };
        limits::check_output_space(&output_path, scanned.bytes)?;

        let first_format = sources
            .first()
            .filter(|path| path.is_file())
            .map(|path| format::detect_from_path(path))
            .unwrap_or(FormatId::Unknown);

        let mut job = ConversionJob::new(
            request,
            first_format,
            EngineId::Archive,
            output_path,
            scanned.bytes,
        );
        job.settings = scrub_secrets(job.settings);

        Ok(PlanOutcome::Ready {
            job: Box::new(job),
            secret: request.secret().map(str::to_owned),
        })
    }

    fn plan_extract_archive(
        &self,
        request: &JobRequest,
        settings: &AppSettings,
    ) -> Result<PlanOutcome, ConversionError> {
        if !request.extra_inputs.is_empty() {
            return Err(ConversionError::Other(
                "extraction takes one archive per job; a batch queues each archive separately"
                    .to_owned(),
            ));
        }
        self.require_engine(EngineId::Archive)?;

        let source = Path::new(&request.input_path);
        limits::check_input_size(source, settings.max_input_mb)?;
        let detected = format::detect_from_path(source);
        if !detected.is_archive_input() {
            return Err(ConversionError::Unsupported {
                input: detected.label().to_owned(),
                output: "archive contents".to_owned(),
            });
        }

        // The declared listing is the security boundary: it is inspected before
        // any destination exists, so a traversal, symlink, duplicate or bomb is
        // refused at submit time.
        let timeout = Duration::from_secs(settings.archive_timeout_seconds.max(1));
        let listing = archive::inspect(source, request.secret(), timeout)?;
        if listing.encrypted && request.secret().is_none() {
            return Err(ConversionError::NeedsPassword {
                path: source.display().to_string(),
            });
        }
        archive::validate_listing(source, &listing, settings)?;

        if !request.selected_entries.is_empty() {
            archive::validate_selection(source, &listing, &request.selected_entries)?;
        }

        let decision = paths::plan_output_directory(
            source,
            settings,
            request.output_directory.as_deref().map(Path::new),
            request.output_name.as_deref(),
        )?;
        let destination = match decision {
            paths::OutputDecision::Proceed(path) => path,
            paths::OutputDecision::Skipped(path) => return Ok(PlanOutcome::Skipped(path)),
        };
        limits::check_extraction_space(&destination, listing.total_bytes)?;

        let mut job = ConversionJob::new(
            request,
            detected,
            EngineId::Archive,
            destination,
            std::fs::metadata(source)
                .map(|meta| meta.len())
                .unwrap_or(0),
        );
        job.output_format = detected;
        job.settings = scrub_secrets(job.settings);

        Ok(PlanOutcome::Ready {
            job: Box::new(job),
            secret: request.secret().map(str::to_owned),
        })
    }

    fn choose_engine(
        &self,
        candidates: &[&'static registry::FormatCapability],
        input: FormatId,
        output: FormatId,
    ) -> Result<EngineId, ConversionError> {
        if let Some(engine) = candidates
            .iter()
            .find(|entry| self.is_available(entry.engine))
            .map(|entry| entry.engine)
        {
            return Ok(engine);
        }
        let blocker = candidates
            .iter()
            .map(|entry| self.engine_info(entry.engine))
            .find(|info| !info.available)
            .ok_or_else(|| ConversionError::Unsupported {
                input: input.label().to_owned(),
                output: output.label().to_owned(),
            })?;
        Err(ConversionError::EngineUnavailable {
            engine: blocker.label.clone(),
            reason: blocker
                .unavailable_reason
                .unwrap_or_else(|| "engine did not respond to probing".to_owned()),
        })
    }
}

fn is_office_container(format: FormatId) -> bool {
    format.is_word_processor() || format.is_spreadsheet() || format.is_presentation()
}

fn encrypted_document_error(path: &Path, secret: Option<&str>) -> ConversionError {
    if secret.is_some() {
        ConversionError::PasswordUnsupported {
            path: path.display().to_string(),
        }
    } else {
        ConversionError::NeedsPassword {
            path: path.display().to_string(),
        }
    }
}

/// Removes password-shaped keys from settings before they can reach a job row,
/// the SQLite history, presets or an event payload.
fn scrub_secrets(mut value: serde_json::Value) -> serde_json::Value {
    fn walk(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                map.retain(|key, _| !key.to_ascii_lowercase().contains("password"));
                for child in map.values_mut() {
                    walk(child);
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    walk(item);
                }
            }
            _ => {}
        }
    }
    walk(&mut value);
    value
}

fn unreadable_probe(path: &Path, name: &str, reason: &str) -> FileProbe {
    FileProbe {
        path: path.display().to_string(),
        name: name.to_owned(),
        size_bytes: 0,
        format: FormatId::Unknown,
        is_directory: false,
        width: None,
        height: None,
        page_count: None,
        duration_ms: None,
        extension_mismatch: None,
        unreadable: Some(reason.to_owned()),
    }
}

/// Header-only read, so a 200 MB TIFF costs the same as a thumbnail here.
fn image_dimensions(path: &Path) -> (Option<u32>, Option<u32>) {
    match image::image_dimensions(path) {
        Ok((width, height)) => (Some(width), Some(height)),
        Err(_) => (None, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::job::JobOperation;
    use crate::core::settings::CollisionPolicy;
    use crate::error::ConversionError;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join(name)
    }

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("uc-plan-{label}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch folder");
        dir
    }

    fn settings() -> AppSettings {
        AppSettings {
            collision_policy: CollisionPolicy::Rename,
            ..AppSettings::default()
        }
    }

    fn extract_request(source: &Path, destination: &Path, name: &str) -> JobRequest {
        JobRequest {
            input_path: source.to_string_lossy().into_owned(),
            output_format: crate::core::format::detect_from_path(source),
            operation: JobOperation::ExtractArchive,
            settings: serde_json::Value::Null,
            output_directory: Some(destination.to_string_lossy().into_owned()),
            extra_inputs: Vec::new(),
            output_name: Some(name.to_owned()),
            selected_entries: vec!["docs/readme.txt".to_owned()],
            password: None,
        }
    }

    #[test]
    fn an_archive_extraction_plan_names_a_new_folder_and_keeps_the_selection() {
        let dir = scratch_dir("extract");
        let manager = ConversionManager::new();
        let request = extract_request(&fixture("normal.zip"), &dir, "chosen");

        let outcome = manager.plan(&request, &settings()).expect("plan succeeds");
        let PlanOutcome::Ready { job, secret } = outcome else {
            panic!("expected a ready extraction plan");
        };
        assert_eq!(job.operation, JobOperation::ExtractArchive);
        assert_eq!(job.engine, EngineId::Archive);
        assert_eq!(job.output_format, FormatId::Zip);
        assert_eq!(Path::new(&job.output_path), dir.join("chosen"));
        assert_eq!(job.selected_entries, vec!["docs/readme.txt".to_owned()]);
        assert!(secret.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_encrypted_archive_without_a_password_is_refused_at_plan_time() {
        let dir = scratch_dir("encrypted");
        let manager = ConversionManager::new();
        let request = extract_request(&fixture("encrypted.zip"), &dir, "secret");

        let error = manager
            .plan(&request, &settings())
            .err()
            .expect("a password is required before the destination exists");
        assert!(
            matches!(error, ConversionError::NeedsPassword { .. }),
            "got {error}"
        );
        assert!(!dir.join("secret").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_traversal_archive_is_refused_before_anything_is_written() {
        let dir = scratch_dir("traversal");
        let manager = ConversionManager::new();
        let request = extract_request(&fixture("traversal.zip"), &dir, "escape");

        let error = manager
            .plan(&request, &settings())
            .err()
            .expect("traversal must be refused at plan time");
        assert!(
            matches!(error, ConversionError::ArchiveSecurity { .. }),
            "got {error}"
        );
        assert!(!dir.join("escape").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_ocr_plan_routes_to_tesseract_and_scrubs_secrets() {
        let dir = scratch_dir("ocr");
        let png = dir.join("scan.png");
        image::DynamicImage::new_rgb8(200, 80)
            .save(&png)
            .expect("fixture image");

        let request = JobRequest {
            input_path: png.display().to_string(),
            output_format: FormatId::Txt,
            operation: JobOperation::Ocr,
            settings: serde_json::json!({ "languages": ["eng"], "password": "must-not-survive" }),
            output_directory: Some(dir.to_string_lossy().into_owned()),
            extra_inputs: Vec::new(),
            output_name: Some("scan-text".to_owned()),
            selected_entries: Vec::new(),
            password: None,
        };

        let manager = ConversionManager::new();
        let outcome = manager.plan(&request, &settings()).expect("plan succeeds");
        let PlanOutcome::Ready { job, secret } = outcome else {
            panic!("expected a ready OCR plan");
        };
        assert_eq!(job.operation, JobOperation::Ocr);
        assert_eq!(job.engine, EngineId::Ocr);
        assert_eq!(job.input_format, FormatId::Png);
        assert_eq!(job.output_format, FormatId::Txt);
        assert_eq!(Path::new(&job.output_path), dir.join("scan-text.txt"));
        assert!(job.settings.get("password").is_none());
        assert_eq!(
            job.settings.get("languages"),
            Some(&serde_json::json!(["eng"]))
        );
        assert!(secret.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ocr_refuses_what_it_cannot_read_or_write() {
        let dir = scratch_dir("ocr-refuse");
        let png = dir.join("scan.png");
        image::DynamicImage::new_rgb8(80, 40).save(&png).unwrap();
        let second = dir.join("second.png");
        image::DynamicImage::new_rgb8(80, 40).save(&second).unwrap();
        let manager = ConversionManager::new();

        let request = JobRequest {
            input_path: png.to_string_lossy().into_owned(),
            output_format: FormatId::Txt,
            operation: JobOperation::Ocr,
            settings: serde_json::Value::Null,
            output_directory: Some(dir.to_string_lossy().into_owned()),
            extra_inputs: vec![second.to_string_lossy().into_owned()],
            output_name: None,
            selected_entries: Vec::new(),
            password: None,
        };
        let error = manager
            .plan(&request, &settings())
            .err()
            .expect("a batch already splits OCR jobs");
        assert!(error.to_string().contains("one file per job"), "{error}");

        let request = JobRequest {
            input_path: png.to_string_lossy().into_owned(),
            output_format: FormatId::Jpeg,
            operation: JobOperation::Ocr,
            settings: serde_json::Value::Null,
            output_directory: Some(dir.to_string_lossy().into_owned()),
            extra_inputs: Vec::new(),
            output_name: None,
            selected_entries: Vec::new(),
            password: None,
        };
        let error = manager
            .plan(&request, &settings())
            .err()
            .expect("OCR cannot write a JPEG");
        assert!(
            matches!(error, ConversionError::Unsupported { .. }),
            "{error}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn archive_creation_plans_every_source_and_scrubs_passwords_from_settings() {
        let dir = scratch_dir("create");
        let alpha = dir.join("alpha.txt");
        let beta = dir.join("beta.txt");
        std::fs::write(&alpha, "alpha\n").unwrap();
        std::fs::write(&beta, "beta\n").unwrap();

        let request = JobRequest {
            input_path: alpha.to_string_lossy().into_owned(),
            output_format: FormatId::Zip,
            operation: JobOperation::CreateArchive,
            settings: serde_json::json!({
                "compression": "fast",
                "password": "must-not-survive",
                "nested": { "Password": "must-not-survive" }
            }),
            output_directory: Some(dir.to_string_lossy().into_owned()),
            extra_inputs: vec![beta.to_string_lossy().into_owned()],
            output_name: Some("bundle".to_owned()),
            selected_entries: Vec::new(),
            password: None,
        };

        let manager = ConversionManager::new();
        let outcome = manager.plan(&request, &settings()).expect("plan succeeds");
        let PlanOutcome::Ready { job, secret } = outcome else {
            panic!("expected a ready creation plan");
        };
        assert_eq!(job.operation, JobOperation::CreateArchive);
        assert_eq!(job.engine, EngineId::Archive);
        assert_eq!(job.inputs.len(), 2);
        assert_eq!(Path::new(&job.output_path), dir.join("bundle.zip"));
        assert_eq!(
            job.settings.get("compression"),
            Some(&serde_json::json!("fast"))
        );
        assert!(job.settings.get("password").is_none());
        assert!(job.settings["nested"].get("Password").is_none());
        assert!(secret.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }
}
