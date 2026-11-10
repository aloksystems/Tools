use crate::automation::{AutomationRule, AutomationService, AutomationStatus};
use crate::core::format::FormatId;
use crate::core::job::{ConversionJob, FileProbe, JobRequest};
use crate::core::manager::ConversionManager;
use crate::core::presets::{self, PresetImportReport};
use crate::core::registry;
use crate::core::settings::AppSettings;
use crate::database::{
    AutomationLogEntry, BackupPreview, Database, FavoriteEntry, HistoryEntry, Preset, read_backup,
};
use crate::diagnostics;
use crate::engines::ffmpeg;
use crate::engines::media::{self, MediaCapabilities};
use crate::engines::{EngineId, EngineInfo, sidecar};
use crate::error::{AppError, CmdResult, ConversionError};
use crate::queue::events::TauriEmitter;
use crate::queue::pool::{ConversionQueue, QueueStats, SubmitOutcome};
use crate::shell;
use crate::utils::{paths, system};
use crate::workflow::{WorkflowDefinition, WorkflowRequest, WorkflowRun, WorkflowService};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

/// Everything a command can reach. Managed once during setup.
pub struct AppState {
    pub manager: Arc<ConversionManager>,
    pub database: Arc<Database>,
    pub queue: Arc<ConversionQueue>,
    pub automation: Arc<AutomationService>,
    pub workflows: Arc<WorkflowService>,
    pub temp_dir: PathBuf,
}

/// One registry row plus whether this machine can actually run it right now.
/// The UI offers only available routes, so no button can promise a conversion
/// that would fail the moment it is submitted.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatRoute {
    pub input: FormatId,
    pub output: FormatId,
    pub engine: EngineId,
    pub engine_label: String,
    pub note: Option<String>,
    pub available: bool,
    pub unavailable_reason: Option<String>,
}

#[tauri::command]
pub fn probe_files(state: State<'_, AppState>, paths: Vec<String>) -> Vec<FileProbe> {
    paths
        .iter()
        .map(Path::new)
        .map(|path| state.manager.probe(path))
        .collect()
}

#[tauri::command]
pub async fn list_engines(state: State<'_, AppState>) -> CmdResult<Vec<EngineInfo>> {
    let manager = Arc::clone(&state.manager);
    let database = Arc::clone(&state.database);
    // Probing can spawn LibreOffice, FFmpeg or Tesseract. A cold start or an
    // antivirus scan can take seconds, so it must never run on the thread that
    // paints the window.
    tauri::async_runtime::spawn_blocking(move || {
        let infos = manager.engine_infos();
        remember_engine_versions(&database, &infos);
        infos
    })
    .await
    .map_err(|error| AppError::new("engine", format!("engine probe failed: {error}")))
}

fn remember_engine_versions(database: &Database, infos: &[EngineInfo]) {
    for info in infos {
        if let Err(error) =
            database.remember_engine_version(info.id, info.version.as_deref(), info.available)
        {
            log::warn!("could not store {} version: {error}", info.label);
        }
    }
}

/// Per-operation PDF availability. Telling the UI only "the PDF engine exists"
/// would let a button promise a merge that the native core cannot perform.
#[tauri::command]
pub async fn pdf_capabilities() -> Vec<crate::engines::pdf::PdfCapability> {
    // Loading PDFium and looking for qpdf touches disk; keep it off the UI thread.
    tauri::async_runtime::spawn_blocking(crate::engines::pdf::capabilities)
        .await
        .unwrap_or_else(|error| {
            log::warn!("PDF capability probe failed: {error}");
            Vec::new()
        })
}

/// Installed OCR languages, not the ones the UI hopes for: the studio only
/// offers packs Tesseract can actually load.
#[tauri::command]
pub async fn ocr_capabilities() -> crate::engines::ocr::OcrCapabilities {
    tauri::async_runtime::spawn_blocking(crate::engines::ocr::capabilities)
        .await
        .unwrap_or_else(|error| crate::engines::ocr::OcrCapabilities {
            available: false,
            version: None,
            reason: Some(format!("OCR probe failed: {error}")),
            languages: Vec::new(),
            tessdata_path: None,
            input_formats: crate::engines::ocr::OCR_INPUTS.to_vec(),
            output_formats: crate::engines::ocr::OCR_OUTPUTS.to_vec(),
        })
}

#[tauri::command]
pub fn inspect_pdf(
    path: String,
    password: String,
) -> CmdResult<crate::engines::pdf::PdfDocumentInfo> {
    crate::engines::pdf::inspect(Path::new(&path), &password).map_err(AppError::from)
}

/// Structural report for the PDF inspector card.
#[tauri::command]
pub async fn inspect_pdf_deep(
    path: String,
    password: String,
) -> CmdResult<crate::engines::pdf::PdfDeepInfo> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::engines::pdf::deep_inspect(
            Path::new(&path),
            &password,
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("PDF inspection failed: {error}")))?
}

/// Writes embedded images into a folder the user picked. This is a tool, not a
/// conversion job: one PDF can contain dozens of images with their own formats.
#[tauri::command]
pub async fn extract_pdf_images(
    path: String,
    password: String,
    page_ranges: String,
    output_directory: String,
) -> CmdResult<crate::engines::pdf::ImageExtraction> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::engines::pdf::extract_images(
            Path::new(&path),
            &password,
            &page_ranges,
            Path::new(&output_directory),
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("image extraction failed: {error}")))?
}

/// Raster comparison of two PDFs; both passwords stay in memory only.
#[tauri::command]
pub async fn compare_pdfs(
    path_a: String,
    password_a: String,
    path_b: String,
    password_b: String,
) -> CmdResult<crate::engines::pdf::PdfComparison> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::engines::pdf::compare_documents(
            Path::new(&path_a),
            &password_a,
            Path::new(&path_b),
            &password_b,
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("PDF comparison failed: {error}")))?
}

/// One page preview, as a PNG data URL, for the reorder and extract grid. Asked
/// for one page at a time so a large document never crosses the IPC bridge in a
/// single blob.
#[tauri::command]
pub fn pdf_page_preview(
    path: String,
    password: String,
    page: u32,
    width: u32,
) -> CmdResult<String> {
    use base64::Engine as _;
    let rendered = crate::engines::pdfium::preview_page(Path::new(&path), &password, page, width)?;
    let mut png = std::io::Cursor::new(Vec::new());
    rendered
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|error| AppError::from(ConversionError::Image(error.to_string())))?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png.into_inner())
    ))
}

fn data_url(mime: &str, bytes: Vec<u8>) -> String {
    use base64::Engine as _;
    format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

/// What this FFmpeg build can really encode, including a one-frame test of each
/// hardware encoder. Runs off the UI thread because probing can take seconds.
#[tauri::command]
pub async fn media_capabilities() -> CmdResult<MediaCapabilities> {
    tauri::async_runtime::spawn_blocking(media::capabilities)
        .await
        .map_err(|error| AppError::new("engine", format!("media scan failed: {error}")))
}

/// Structured ffprobe metadata for the media inspectors.
#[tauri::command]
pub async fn inspect_media(path: String) -> CmdResult<ffmpeg::MediaInfo> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<ffmpeg::MediaInfo> {
        let tools = ffmpeg::tools()?;
        Ok(ffmpeg::inspect(&tools, Path::new(&path))?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("media inspection failed: {error}")))?
}

/// One poster frame as a PNG data URL for the video page.
#[tauri::command]
pub async fn media_thumbnail(path: String, at_ms: u64, width: u32) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<String> {
        let tools = ffmpeg::tools()?;
        let png = ffmpeg::thumbnail_png(&tools, Path::new(&path), at_ms, width)?;
        Ok(data_url("image/png", png))
    })
    .await
    .map_err(|error| AppError::new("engine", format!("thumbnail failed: {error}")))?
}

/// Short GIF rendered with the same palette chain as the real job, capped in
/// size and duration so a preview can never become the expensive part.
#[tauri::command]
pub async fn gif_preview(
    path: String,
    start_ms: Option<u64>,
    duration_ms: Option<u64>,
    fps: u32,
    width: u32,
    height: u32,
) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<String> {
        let tools = ffmpeg::tools()?;
        let gif = ffmpeg::gif_preview(
            &tools,
            Path::new(&path),
            start_ms,
            duration_ms,
            fps,
            width,
            height,
        )?;
        Ok(data_url("image/gif", gif))
    })
    .await
    .map_err(|error| AppError::new("engine", format!("GIF preview failed: {error}")))?
}

/// Which archive containers this copy of 7-Zip can create and read.
#[tauri::command]
pub fn archive_capabilities() -> crate::engines::archive::ArchiveCapabilities {
    crate::engines::archive::capabilities()
}

/// The listing is shown before extraction starts, and it is also what the
/// planner validates against. An encrypted archive needs the password here.
#[tauri::command]
pub async fn inspect_archive(
    state: State<'_, AppState>,
    path: String,
    password: Option<String>,
) -> CmdResult<crate::engines::archive::ArchiveListing> {
    let timeout =
        std::time::Duration::from_secs(state.queue.settings().archive_timeout_seconds.max(1));
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        let secret = password.as_deref().filter(|value| !value.is_empty());
        Ok(crate::engines::archive::inspect(
            Path::new(&path),
            secret,
            timeout,
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("archive inspection failed: {error}")))?
}

/// Sheet names for the spreadsheet picker. Legacy XLS is converted to XLSX in a
/// throw-away profile so the order matches what LibreOffice shows.
#[tauri::command]
pub async fn document_sheets(path: String) -> CmdResult<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<Vec<String>> {
        Ok(crate::engines::document::list_sheets(Path::new(&path))?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("sheet listing failed: {error}")))?
}

/// Re-detects binaries after the user installs or moves one.
#[tauri::command]
pub async fn rescan_engines(state: State<'_, AppState>) -> CmdResult<Vec<EngineInfo>> {
    let manager = Arc::clone(&state.manager);
    let database = Arc::clone(&state.database);
    tauri::async_runtime::spawn_blocking(move || {
        // FFmpeg caches its binary paths, encoder table and hardware test
        // results; a rescan must not keep answering with the build that was
        // there before.
        ffmpeg::reset_caches();
        manager.invalidate_probe_cache();
        let infos = manager.engine_infos();
        remember_engine_versions(&database, &infos);
        infos
    })
    .await
    .map_err(|error| AppError::new("engine", format!("engine probe failed: {error}")))
}

#[tauri::command]
pub async fn list_capabilities(
    state: State<'_, AppState>,
    input: FormatId,
) -> CmdResult<Vec<FormatRoute>> {
    let manager = Arc::clone(&state.manager);
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<Vec<FormatRoute>> {
        let routes = registry::capabilities_for(input)
            .into_iter()
            .map(|entry| {
                let info = manager.engine_info(entry.engine);
                FormatRoute {
                    input: entry.input,
                    output: entry.output,
                    engine: entry.engine,
                    engine_label: info.label.clone(),
                    note: entry.note,
                    available: info.available,
                    unavailable_reason: info.unavailable_reason.clone(),
                }
            })
            .collect();
        Ok(routes)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("capability probe failed: {error}")))?
}

#[tauri::command]
pub fn submit_jobs(
    state: State<'_, AppState>,
    requests: Vec<JobRequest>,
) -> CmdResult<Vec<SubmitOutcome>> {
    Ok(state.queue.submit(requests))
}

#[tauri::command]
pub fn list_jobs(state: State<'_, AppState>) -> Vec<ConversionJob> {
    state.queue.snapshot()
}

#[tauri::command]
pub fn queue_stats(state: State<'_, AppState>) -> QueueStats {
    state.queue.stats()
}

#[tauri::command]
pub fn cancel_job(state: State<'_, AppState>, job_id: String) -> CmdResult<()> {
    state.queue.cancel(&job_id)
}

#[tauri::command]
pub fn retry_job(state: State<'_, AppState>, job_id: String) -> CmdResult<()> {
    state.queue.retry(&job_id)
}

#[tauri::command]
pub fn clear_finished_jobs(state: State<'_, AppState>) {
    state.queue.clear_finished();
}

#[tauri::command]
pub fn load_history(
    state: State<'_, AppState>,
    limit: i64,
    offset: i64,
) -> CmdResult<Vec<HistoryEntry>> {
    Ok(state.database.history(limit.max(1), offset.max(0))?)
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> CmdResult<u64> {
    Ok(state.database.clear_history()?)
}

#[tauri::command]
pub fn recent_files(state: State<'_, AppState>, limit: i64) -> CmdResult<Vec<String>> {
    let rows = state.database.recent_files(limit.max(1))?;
    Ok(rows.into_iter().map(|(path, _)| path).collect())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.queue.settings()
}

/// Maps the engine ids shown in Settings onto the environment-style keys the
/// engine locators use. Keeping the translation here means `sidecar` does not
/// need to know about UI identifiers.
fn user_engine_paths(settings: &AppSettings) -> HashMap<String, PathBuf> {
    const KEYS: [(&str, &str); 8] = [
        ("ffmpeg", "UC_FFMPEG_PATH"),
        ("ffprobe", "UC_FFPROBE_PATH"),
        ("tesseract", "UC_TESSERACT_PATH"),
        ("tessdata", "UC_TESSDATA_PREFIX"),
        ("libreoffice", "UC_LIBREOFFICE_PATH"),
        ("7zip", "UC_7ZIP_PATH"),
        ("qpdf", "UC_QPDF_PATH"),
        ("pdfium", "UC_PDFIUM_PATH"),
    ];
    KEYS.iter()
        .filter_map(|(engine, env_key)| {
            let value = settings.engine_paths.get(*engine)?.trim();
            (!value.is_empty()).then(|| ((*env_key).to_owned(), PathBuf::from(value)))
        })
        .collect()
}

fn apply_engine_paths(settings: &AppSettings) {
    sidecar::set_user_overrides(user_engine_paths(settings));
    // FFmpeg remembers the binaries, encoders and hardware support it found;
    // a changed path must re-run that detection.
    ffmpeg::reset_caches();
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> CmdResult<()> {
    state.database.save_settings(&settings)?;
    apply_engine_paths(&settings);
    state.manager.invalidate_probe_cache();
    state.queue.apply_settings(settings);
    Ok(())
}

/// Restores every preference to its default. The welcome screen is not shown
/// again, because the user has already seen this installation once.
#[tauri::command]
pub fn reset_settings(state: State<'_, AppState>) -> CmdResult<AppSettings> {
    let settings = AppSettings {
        welcome_completed: true,
        ..AppSettings::default()
    };
    state.database.save_settings(&settings)?;
    apply_engine_paths(&settings);
    state.manager.invalidate_probe_cache();
    state.queue.apply_settings(settings.clone());
    Ok(settings)
}

#[tauri::command]
pub fn list_presets(state: State<'_, AppState>) -> CmdResult<Vec<Preset>> {
    Ok(state.database.list_presets()?)
}

#[tauri::command]
pub fn save_preset(state: State<'_, AppState>, mut preset: Preset) -> CmdResult<Preset> {
    preset.name = preset.name.trim().to_owned();
    if preset.id.trim().is_empty() {
        preset.id = uuid::Uuid::new_v4().to_string();
    }
    presets::validate_preset(&preset).map_err(|message| AppError::new("invalidPreset", message))?;
    state.database.save_preset(&preset)?;
    Ok(preset)
}

#[tauri::command]
pub fn delete_preset(state: State<'_, AppState>, preset_id: String) -> CmdResult<()> {
    Ok(state.database.delete_preset(&preset_id)?)
}

#[tauri::command]
pub fn duplicate_preset(state: State<'_, AppState>, preset_id: String) -> CmdResult<Preset> {
    let presets = state.database.list_presets()?;
    let source = presets
        .iter()
        .find(|preset| preset.id == preset_id)
        .ok_or_else(|| AppError::new("unknownPreset", "that preset no longer exists"))?;
    let taken: Vec<String> = presets.iter().map(|preset| preset.name.clone()).collect();
    let base: String = format!("{} copy", source.name).chars().take(70).collect();
    let mut copy = source.clone();
    copy.id = uuid::Uuid::new_v4().to_string();
    copy.name = presets::unique_name(base.trim_end(), &taken);
    let (settings, _) = presets::scrub_secrets(&copy.settings);
    copy.settings = settings;
    presets::validate_preset(&copy).map_err(|message| AppError::new("invalidPreset", message))?;
    state.database.save_preset(&copy)?;
    Ok(copy)
}

#[tauri::command]
pub fn export_presets(state: State<'_, AppState>) -> CmdResult<String> {
    let bundle = presets::bundle(state.database.list_presets()?);
    serde_json::to_string_pretty(&bundle)
        .map_err(|error| AppError::new("database", format!("could not build the export: {error}")))
}

#[tauri::command]
pub fn import_presets(state: State<'_, AppState>, json: String) -> CmdResult<PresetImportReport> {
    let value: serde_json::Value = serde_json::from_str(&json).map_err(|error| {
        AppError::new(
            "invalidPreset",
            format!("this is not a preset export file: {error}"),
        )
    })?;
    import_preset_bundle(&state.database, value)
}

#[tauri::command]
pub fn import_presets_file(
    state: State<'_, AppState>,
    path: String,
) -> CmdResult<PresetImportReport> {
    let contents = std::fs::read_to_string(&path)
        .map_err(|error| AppError::new("unreadable", format!("could not read {path}: {error}")))?;
    let value: serde_json::Value = serde_json::from_str(&contents).map_err(|error| {
        AppError::new(
            "invalidPreset",
            format!("this is not a preset export file: {error}"),
        )
    })?;
    import_preset_bundle(&state.database, value)
}

/// Adds the starter presets the user does not already have. Names are the
/// identity here, so running it twice never duplicates them.
#[tauri::command]
pub fn install_default_presets(state: State<'_, AppState>) -> CmdResult<usize> {
    let existing = state.database.list_presets()?;
    let mut names: Vec<String> = existing.iter().map(|preset| preset.name.clone()).collect();
    let mut installed = 0_usize;
    for mut starter in presets::default_presets() {
        if names
            .iter()
            .any(|name| name.eq_ignore_ascii_case(&starter.name))
        {
            continue;
        }
        starter.name = presets::unique_name(&starter.name, &names);
        presets::validate_preset(&starter)
            .map_err(|message| AppError::new("invalidPreset", message))?;
        state.database.save_preset(&starter)?;
        names.push(starter.name);
        installed += 1;
    }
    Ok(installed)
}

fn import_preset_bundle(
    database: &Database,
    value: serde_json::Value,
) -> CmdResult<PresetImportReport> {
    let bundle =
        presets::read_bundle(value).map_err(|message| AppError::new("invalidPreset", message))?;
    let existing = database.list_presets()?;
    let mut names: Vec<String> = existing.iter().map(|preset| preset.name.clone()).collect();
    let mut report = PresetImportReport {
        imported: 0,
        renamed: Vec::new(),
        scrubbed: Vec::new(),
        skipped: Vec::new(),
    };

    for mut preset in bundle.presets {
        preset.name = preset.name.trim().to_owned();
        let (settings, removed) = presets::scrub_secrets(&preset.settings);
        preset.settings = settings;
        if let Err(reason) = presets::validate_preset(&preset) {
            report.skipped.push(format!("{}: {reason}", preset.name));
            continue;
        }
        preset.id = uuid::Uuid::new_v4().to_string();
        let base = preset.name.clone();
        let stored_name = presets::unique_name(&base, &names);
        if stored_name != base {
            report.renamed.push(format!("{base} → {stored_name}"));
        }
        preset.name = stored_name.clone();
        names.push(stored_name);
        if !removed.is_empty() {
            report
                .scrubbed
                .push(format!("{}: {}", preset.name, removed.join(", ")));
        }
        database.save_preset(&preset)?;
        report.imported += 1;
    }
    Ok(report)
}

#[tauri::command]
pub fn list_automation_rules(state: State<'_, AppState>) -> CmdResult<Vec<AutomationRule>> {
    Ok(state.database.list_automation_rules()?)
}

/// Validates and stores a rule, then rebuilds the watcher so the change applies
/// without an app restart. The saved rule (with its generated id) is returned.
#[tauri::command]
pub fn save_automation_rule(
    state: State<'_, AppState>,
    rule: AutomationRule,
) -> CmdResult<AutomationRule> {
    let mut rule = rule;
    crate::automation::validate_rule(&mut rule)?;
    state.database.save_automation_rule(&rule)?;
    state.automation.reload();
    let _ = state.database.append_automation_log(
        Some(&rule.id),
        "info",
        &format!("rule '{}' saved", rule.name),
        None,
    );
    Ok(rule)
}

#[tauri::command]
pub fn delete_automation_rule(state: State<'_, AppState>, rule_id: String) -> CmdResult<()> {
    state.database.delete_automation_rule(&rule_id)?;
    state.automation.reload();
    Ok(())
}

#[tauri::command]
pub fn automation_status(state: State<'_, AppState>) -> AutomationStatus {
    state.automation.status()
}

#[tauri::command]
pub fn set_automation_paused(state: State<'_, AppState>, paused: bool) -> CmdResult<()> {
    Ok(state.automation.set_paused(paused)?)
}

#[tauri::command]
pub fn automation_logs(
    state: State<'_, AppState>,
    limit: i64,
) -> CmdResult<Vec<AutomationLogEntry>> {
    Ok(state.database.automation_logs(limit)?)
}

#[tauri::command]
pub fn clear_automation_log(state: State<'_, AppState>) -> CmdResult<u64> {
    Ok(state.database.clear_automation_log()?)
}

#[tauri::command]
pub fn list_workflows(state: State<'_, AppState>) -> CmdResult<Vec<WorkflowDefinition>> {
    Ok(state.database.list_workflows()?)
}

#[tauri::command]
pub fn save_workflow(
    state: State<'_, AppState>,
    mut workflow: WorkflowDefinition,
) -> CmdResult<WorkflowDefinition> {
    crate::workflow::validate_workflow(&mut workflow)?;
    let existing = state.database.list_workflows()?;
    if existing
        .iter()
        .any(|other| other.id != workflow.id && other.name.eq_ignore_ascii_case(&workflow.name))
    {
        return Err(AppError::new(
            "invalidWorkflow",
            format!("another workflow is already named '{}'", workflow.name),
        ));
    }
    state.database.save_workflow(&workflow)?;
    Ok(workflow)
}

#[tauri::command]
pub fn delete_workflow(state: State<'_, AppState>, workflow_id: String) -> CmdResult<()> {
    state.database.delete_workflow(&workflow_id)?;
    Ok(())
}

#[tauri::command]
pub fn start_workflow(
    state: State<'_, AppState>,
    request: WorkflowRequest,
) -> CmdResult<WorkflowRun> {
    let workflow = state
        .database
        .list_workflows()?
        .into_iter()
        .find(|workflow| workflow.id == request.workflow_id)
        .ok_or_else(|| AppError::new("unknownWorkflow", "that workflow no longer exists"))?;
    Ok(state.workflows.start(workflow, request)?)
}

#[tauri::command]
pub fn workflow_runs(state: State<'_, AppState>) -> Vec<WorkflowRun> {
    state.workflows.runs()
}

#[tauri::command]
pub fn cancel_workflow_run(state: State<'_, AppState>, run_id: String) -> CmdResult<()> {
    Ok(state.workflows.cancel(&run_id)?)
}

#[tauri::command]
pub fn clear_workflow_runs(state: State<'_, AppState>) -> u64 {
    state.workflows.clear_finished()
}

#[tauri::command]
pub fn system_resources() -> system::SystemResources {
    system::resources()
}

/// Deletes leftovers the engines could not clean up themselves. Recent entries
/// are kept, because they may belong to a job that is still running.
#[tauri::command]
pub fn purge_temp_files(state: State<'_, AppState>) -> CmdResult<u64> {
    Ok(remove_stale(&state.temp_dir))
}

/// Drops every history row belonging to one input file.
#[tauri::command]
pub fn forget_history(state: State<'_, AppState>, path: String) -> CmdResult<u64> {
    Ok(state.database.forget_history_of(&path)?)
}

#[tauri::command]
pub fn list_favorites(state: State<'_, AppState>) -> CmdResult<Vec<FavoriteEntry>> {
    Ok(state.database.list_favorites()?)
}

#[tauri::command]
pub fn set_favorite(
    state: State<'_, AppState>,
    path: String,
    format: FormatId,
    favorite: bool,
) -> CmdResult<()> {
    Ok(state.database.set_favorite(&path, format, favorite)?)
}

#[tauri::command]
pub fn shell_integration() -> shell::ShellIntegration {
    shell::integration_status()
}

/// Writes (or removes) only the keys this app owns under HKCU. No default file
/// association is ever changed; Explorer's "Open with" list is the only place
/// the app appears.
#[tauri::command]
pub fn set_shell_integration(enabled: bool) -> CmdResult<shell::ShellIntegration> {
    shell::set_integration(enabled).map_err(|message| AppError::new("shellIntegration", message))
}

/// Files passed by Explorer for this launch, drained once by the UI.
#[tauri::command]
pub fn take_opened_files(state: State<'_, shell::OpenedFiles>) -> Vec<String> {
    state.take()
}

/// The folder holding database, cache, temp, logs and presets.
#[tauri::command]
pub fn storage_root() -> String {
    paths::data_root().display().to_string()
}

#[tauri::command]
pub fn app_info() -> diagnostics::AppInfo {
    diagnostics::app_info()
}

#[tauri::command]
pub fn diagnostics_report(state: State<'_, AppState>) -> CmdResult<String> {
    Ok(diagnostics::report(
        &state.database,
        &state.manager.engine_infos(),
        &state.queue.settings(),
    )?)
}

#[tauri::command]
pub fn export_diagnostics(
    state: State<'_, AppState>,
    directory: String,
) -> CmdResult<diagnostics::ExportResult> {
    Ok(diagnostics::export(
        &state.database,
        &state.manager.engine_infos(),
        &state.queue.settings(),
        Path::new(&directory),
    )?)
}

/// Writes settings, presets, workflows, automation rules, favorites and
/// history to one validated JSON file. Original user files are never included.
#[tauri::command]
pub fn export_backup(state: State<'_, AppState>, path: String) -> CmdResult<BackupPreview> {
    Ok(state
        .database
        .write_backup(Path::new(&path), env!("CARGO_PKG_VERSION"))?)
}

/// Parses and validates a backup without changing anything. The UI shows this
/// preview and asks for confirmation before calling `restore_backup`.
#[tauri::command]
pub fn inspect_backup(path: String) -> CmdResult<BackupPreview> {
    Ok(read_backup(Path::new(&path))?.preview())
}

#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, path: String) -> CmdResult<BackupPreview> {
    let stats = state.queue.stats();
    if stats.active > 0 || stats.queued > 0 {
        return Err(AppError::new(
            "busy",
            "Wait for the active and queued jobs to finish, or cancel them, before restoring a backup.",
        ));
    }

    let bundle = read_backup(Path::new(&path))?;
    let preview = bundle.preview();
    state.database.restore_bundle(&bundle)?;

    // The restored settings are applied immediately to the running process;
    // a reload of the window picks up theme and engine discoveries.
    let settings = state.database.load_settings()?;
    apply_engine_paths(&settings);
    state.manager.invalidate_probe_cache();
    state.queue.apply_settings(settings);
    state.automation.reload();
    Ok(preview)
}

/// Clears derived preview data only. The cache never holds user outputs,
/// history or presets, so this cannot lose anything the user created.
#[tauri::command]
pub fn clear_cache() -> CmdResult<u64> {
    let root = paths::cache_root();
    let Ok(entries) = std::fs::read_dir(&root) else {
        return Ok(0);
    };
    let mut removed = 0u64;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            if std::fs::remove_dir_all(&path).is_ok() {
                removed += 1;
            }
        } else if std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    log::info!(
        "cache cleared: {removed} item(s) removed from {}",
        root.display()
    );
    Ok(removed)
}

/// Image header values without decoding the pixels.
#[tauri::command]
pub async fn image_info(path: String) -> CmdResult<crate::tools::image_tools::ImageInfo> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::image_tools::image_info(Path::new(&path))?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("image inspection failed: {error}")))?
}

#[tauri::command]
pub async fn compare_images(
    path_a: String,
    path_b: String,
) -> CmdResult<crate::tools::image_tools::ImageComparison> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::image_tools::compare_images(
            Path::new(&path_a),
            Path::new(&path_b),
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("image comparison failed: {error}")))?
}

#[tauri::command]
pub async fn read_metadata(
    path: String,
    password: String,
) -> CmdResult<crate::tools::metadata::MetadataDocument> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::metadata::read_metadata(
            Path::new(&path),
            &password,
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("metadata read failed: {error}")))?
}

#[tauri::command]
pub async fn edit_metadata(
    path: String,
    password: String,
    output_path: String,
    edit: crate::tools::metadata::MetadataEditRequest,
    overwrite: bool,
) -> CmdResult<crate::tools::metadata::MetadataWriteResult> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::metadata::edit_metadata(
            Path::new(&path),
            &password,
            Path::new(&output_path),
            &edit,
            overwrite,
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("metadata edit failed: {error}")))?
}

#[tauri::command]
pub async fn remove_metadata(
    path: String,
    password: String,
    output_path: String,
    overwrite: bool,
) -> CmdResult<crate::tools::metadata::MetadataRemoval> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::metadata::remove_metadata(
            Path::new(&path),
            &password,
            Path::new(&output_path),
            overwrite,
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("metadata removal failed: {error}")))?
}

#[tauri::command]
pub async fn compare_metadata(
    path_a: String,
    password_a: String,
    path_b: String,
    password_b: String,
) -> CmdResult<crate::tools::metadata::MetadataComparison> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::metadata::compare_metadata(
            Path::new(&path_a),
            &password_a,
            Path::new(&path_b),
            &password_b,
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("metadata comparison failed: {error}")))?
}

#[tauri::command]
pub async fn file_info(path: String) -> CmdResult<crate::tools::file_utils::FileInfo> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::file_utils::describe_file(Path::new(&path))?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("file inspection failed: {error}")))?
}

/// Streaming hashes: one read produces MD5, SHA-1, SHA-256 and SHA-512.
#[tauri::command]
pub async fn hash_files(
    paths: Vec<String>,
) -> CmdResult<Vec<crate::tools::file_utils::FileHashes>> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::file_utils::hash_files(&paths)?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("hashing failed: {error}")))?
}

#[tauri::command]
pub async fn verify_checksum(
    path: String,
    expected: String,
) -> CmdResult<crate::tools::file_utils::ChecksumCheck> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::file_utils::verify_checksum(
            Path::new(&path),
            &expected,
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("checksum verification failed: {error}")))?
}

#[tauri::command]
pub async fn compare_files(
    path_a: String,
    path_b: String,
) -> CmdResult<crate::tools::file_utils::FileComparison> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::file_utils::compare_files(
            Path::new(&path_a),
            Path::new(&path_b),
        )?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("file comparison failed: {error}")))?
}

#[tauri::command]
pub async fn find_duplicates(
    paths: Vec<String>,
) -> CmdResult<crate::tools::file_utils::DuplicateReport> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::file_utils::find_duplicates(&paths)?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("duplicate scan failed: {error}")))?
}

#[tauri::command]
pub async fn calculate_size(paths: Vec<String>) -> CmdResult<crate::tools::file_utils::SizeReport> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::file_utils::calculate_size(&paths)?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("size calculation failed: {error}")))?
}

#[tauri::command]
pub async fn inspect_signature(
    path: String,
) -> CmdResult<crate::tools::file_utils::SignatureReport> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<_> {
        Ok(crate::tools::file_utils::signature_of(Path::new(&path))?)
    })
    .await
    .map_err(|error| AppError::new("engine", format!("signature inspection failed: {error}")))?
}

/// Writes a text export (metadata JSON, checksum list) to a path the user chose.
#[tauri::command]
pub async fn export_text(path: String, contents: String) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<()> {
        let target = Path::new(&path);
        if let Some(parent) = target
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            std::fs::create_dir_all(parent).map_err(|error| {
                AppError::new(
                    "unreadable",
                    format!("could not create {}: {error}", parent.display()),
                )
            })?;
        }
        std::fs::write(target, contents).map_err(|error| {
            AppError::new(
                "unreadable",
                format!("could not write {}: {error}", target.display()),
            )
        })?;
        Ok(())
    })
    .await
    .map_err(|error| AppError::new("engine", format!("export failed: {error}")))?
}

fn remove_stale(root: &Path) -> u64 {
    let mut removed = 0_u64;
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return 0,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let stale = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .map(|modified| {
                modified
                    .elapsed()
                    .map(|age| age.as_secs() > 3600)
                    .unwrap_or(false)
            })
            .unwrap_or(true);
        if !stale {
            continue;
        }
        let outcome = if path.is_dir() {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_file(&path)
        };
        match outcome {
            Ok(()) => removed += 1,
            Err(error) => log::warn!("could not remove {}: {error}", path.display()),
        }
    }
    removed
}

/// Honours the "delete temp files on exit" switch shown in Settings. Called from
/// the exit hook in `main.rs`. A job that is still running owns its scratch
/// files, so in that case only stale entries are removed.
pub fn purge_on_exit(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    state.automation.stop();
    if !state.queue.settings().delete_temp_on_exit {
        return;
    }
    let removed = if state.queue.stats().active > 0 {
        remove_stale(&state.temp_dir)
    } else {
        remove_everything(&state.temp_dir)
    };
    if removed > 0 {
        log::info!("removed {removed} temporary entries on exit");
    }
}

fn remove_everything(root: &Path) -> u64 {
    let mut removed = 0_u64;
    let Ok(entries) = std::fs::read_dir(root) else {
        return 0;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let outcome = if path.is_dir() {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_file(&path)
        };
        match outcome {
            Ok(()) => removed += 1,
            Err(error) => log::warn!("could not remove {}: {error}", path.display()),
        }
    }
    removed
}

/// Builds the queue and hands the app its shared state. Called once from setup.
/// Managed by value, not wrapped in another `Arc`: commands ask for
/// `State<'_, AppState>`, and Tauri keys its state map on the exact `TypeId`, so
/// managing `Arc<AppState>` here would leave every command without its state.
pub fn install(app: &AppHandle) -> Result<(), ConversionError> {
    let temp_dir = paths::temp_root();
    let database = Arc::new(Database::open(&paths::database_file())?);
    let settings = database.load_settings()?;
    // Apply saved engine paths before the first probe, so Start-up reports the
    // tools the user actually configured.
    apply_engine_paths(&settings);
    let manager = Arc::new(ConversionManager::new());

    // Engine discovery is deliberately not part of setup. Probing starts
    // processes and can stall for seconds on a cold install, which previously
    // kept the window hidden and marked it "Not Responding". The UI asks for
    // `list_engines` once it is on screen; that command runs off the UI thread.

    // A fresh process owns no scratch folders, so anything still there was left
    // by a crash, a forced kill or a Windows shutdown.
    let abandoned = remove_everything(&temp_dir);
    if abandoned > 0 {
        log::info!("removed {abandoned} abandoned temporary entrie(s) on startup");
    }

    let queue = Arc::new(ConversionQueue::new(
        Arc::new(TauriEmitter::new(app)),
        Arc::clone(&manager),
        Arc::clone(&database),
        settings,
        temp_dir.clone(),
    ));
    let interrupted = queue.recover_interrupted();
    if interrupted > 0 {
        log::warn!("recovered {interrupted} interrupted job(s) as failed");
    }

    let automation = AutomationService::start(Arc::clone(&database), Arc::clone(&queue));
    let workflows =
        WorkflowService::new(Arc::clone(&database), Arc::clone(&queue), temp_dir.clone());

    app.manage(AppState {
        manager,
        database,
        queue,
        automation,
        workflows,
        temp_dir,
    });
    app.manage(shell::OpenedFiles::default());
    let startup = shell::files_from_args(std::env::args_os().skip(1));
    app.state::<shell::OpenedFiles>().push(startup);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("uc-commands-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch folder");
        dir
    }

    fn aged(dir: &Path, name: &str, hours_old: u64) {
        let file = dir.join(name);
        std::fs::write(&file, b"x").expect("write");
        let when = std::time::SystemTime::now() - std::time::Duration::from_secs(hours_old * 3600);
        std::fs::File::options()
            .write(true)
            .open(&file)
            .and_then(|handle| handle.set_modified(when))
            .expect("age the file");
    }

    #[test]
    fn stale_purge_skips_files_a_running_job_may_own() {
        let dir = scratch_dir("stale");
        aged(&dir, "old.txt", 3);
        aged(&dir, "recent.txt", 0);

        assert_eq!(remove_stale(&dir), 1, "only the hours-old entry goes");
        assert!(dir.join("recent.txt").exists());

        assert_eq!(remove_everything(&dir), 1);
        assert!(!dir.join("recent.txt").exists());
        assert!(dir.exists(), "the temp root itself survives");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn purging_a_missing_folder_is_quiet() {
        let missing = Path::new("Z:/uc-no-such-temp-folder");
        assert_eq!(remove_stale(missing), 0);
        assert_eq!(remove_everything(missing), 0);
    }

    #[test]
    fn preset_import_scrubs_secrets_renames_collisions_and_skips_invalid_rows() {
        let dir = scratch_dir("preset-import");
        let database = Database::open(&dir.join("db.sqlite")).unwrap();
        database
            .save_preset(&Preset {
                id: "existing".to_owned(),
                name: "Web".to_owned(),
                engine: EngineId::Image,
                output_format: FormatId::Webp,
                settings: serde_json::json!({ "quality": 75 }),
            })
            .unwrap();

        let bundle = serde_json::json!({
            "schema": "universal-converter.presets",
            "version": 1,
            "exportedAtMs": 0,
            "presets": [
                {
                    "id": "imported-1",
                    "name": "Web",
                    "engine": "image",
                    "outputFormat": "webp",
                    "settings": { "quality": 82, "password": "must-not-survive" }
                },
                {
                    "id": "imported-2",
                    "name": "Broken",
                    "engine": "image",
                    "outputFormat": "unknown",
                    "settings": {}
                }
            ]
        });

        let report = import_preset_bundle(&database, bundle).unwrap();
        assert_eq!(report.imported, 1);
        assert_eq!(report.renamed.len(), 1);
        assert_eq!(report.scrubbed.len(), 1);
        assert_eq!(report.skipped.len(), 1);

        let stored = database.list_presets().unwrap();
        assert_eq!(stored.len(), 2, "the existing preset is never overwritten");
        assert!(stored.iter().any(|preset| preset.name == "Web (2)"));
        let text = serde_json::to_string(&stored).unwrap().to_lowercase();
        assert!(!text.contains("must-not-survive"));
        assert!(!text.contains("password"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
