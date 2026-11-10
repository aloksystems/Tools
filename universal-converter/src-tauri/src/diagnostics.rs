//! Local-only diagnostics: version, storage, engine health and row counts.
//! The report never contains file contents, and nothing leaves the machine
//! unless the user exports it and chooses where to save it.

use crate::core::settings::{AppSettings, CollisionPolicy, OutputDirectoryMode};
use crate::database::Database;
use crate::engines::EngineInfo;
use crate::error::ConversionError;
use crate::utils::paths;
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_EXPORTED_LOG_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFileInfo {
    pub name: String,
    pub bytes: u64,
    pub modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub os_version: String,
    pub kernel_version: String,
    pub architecture: String,
    pub debug_build: bool,
    pub install_root: String,
    pub data_root: String,
    pub database_file: String,
    pub temp_root: String,
    pub logs_root: String,
    pub cache_root: String,
    pub log_files: Vec<LogFileInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub directory: String,
    pub report_file: String,
    pub log_files: Vec<String>,
    pub skipped_logs: Vec<String>,
}

pub fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_owned(),
        os_version: sysinfo::System::long_os_version().unwrap_or_else(|| "Windows".to_owned()),
        kernel_version: sysinfo::System::kernel_version().unwrap_or_else(|| "unknown".to_owned()),
        architecture: std::env::consts::ARCH.to_owned(),
        debug_build: cfg!(debug_assertions),
        install_root: std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf))
            .map(|path| path.display().to_string())
            .unwrap_or_default(),
        data_root: paths::data_root().display().to_string(),
        database_file: paths::database_file().display().to_string(),
        temp_root: paths::temp_root().display().to_string(),
        logs_root: paths::logs_root().display().to_string(),
        cache_root: paths::cache_root().display().to_string(),
        log_files: list_log_files(),
    }
}

fn list_log_files() -> Vec<LogFileInfo> {
    let Ok(entries) = std::fs::read_dir(paths::logs_root()) else {
        return Vec::new();
    };
    let mut files = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            if !metadata.is_file() {
                return None;
            }
            Some(LogFileInfo {
                name: entry.file_name().to_string_lossy().into_owned(),
                bytes: metadata.len(),
                modified_ms: metadata.modified().ok().and_then(system_time_ms),
            })
        })
        .collect::<Vec<_>>();
    files.sort_by(|left, right| left.name.cmp(&right.name));
    files
}

fn system_time_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

pub fn report(
    database: &Database,
    engines: &[EngineInfo],
    settings: &AppSettings,
) -> Result<String, ConversionError> {
    let info = app_info();
    let stats = database.stats()?;
    let database_bytes = std::fs::metadata(&info.database_file)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let now = system_time_ms(SystemTime::now()).unwrap_or(0);

    let mut text = String::new();
    text.push_str("Universal Converter — diagnostic report\n");
    text.push_str("=======================================\n\n");
    text.push_str(&format!("Generated:       {}\n", format_utc(now)));
    text.push_str(&format!("Application:     {}\n", info.version));
    text.push_str(&format!(
        "Build:           {}\n",
        if info.debug_build { "debug" } else { "release" }
    ));
    text.push_str(&format!("Operating system: {}\n", info.os_version));
    text.push_str(&format!("Kernel:          {}\n", info.kernel_version));
    text.push_str(&format!("Architecture:    {}\n\n", info.architecture));

    text.push_str("Storage\n-------\n");
    text.push_str(&format!("Install folder:  {}\n", info.install_root));
    text.push_str(&format!("App data:        {}\n", info.data_root));
    text.push_str(&format!("Database:        {}\n", info.database_file));
    text.push_str(&format!("  Size:          {} bytes\n", database_bytes));
    text.push_str(&format!("Temporary:       {}\n", info.temp_root));
    text.push_str(&format!("Logs:            {}\n", info.logs_root));
    text.push_str(&format!("Cache:           {}\n\n", info.cache_root));

    text.push_str("Engine status\n-------------\n");
    for engine in engines {
        let state = if engine.available {
            format!(
                "ready{}",
                engine
                    .version
                    .as_deref()
                    .map(|version| format!(" — {version}"))
                    .unwrap_or_default()
            )
        } else {
            format!(
                "unavailable — {}",
                engine
                    .unavailable_reason
                    .as_deref()
                    .unwrap_or("not installed")
            )
        };
        text.push_str(&format!("{:<14} {}\n", format!("{}:", engine.label), state));
    }

    text.push_str("\nDatabase rows\n-------------\n");
    text.push_str(&format!("History:          {}\n", stats.history));
    text.push_str(&format!("Presets:          {}\n", stats.presets));
    text.push_str(&format!("Workflows:        {}\n", stats.workflows));
    text.push_str(&format!("Automation rules: {}\n", stats.automation_rules));
    text.push_str(&format!("Automation log:   {}\n", stats.automation_log));

    text.push_str("\nSettings\n--------\n");
    text.push_str(&format!(
        "Output:           {}\n",
        match settings.output_directory_mode {
            OutputDirectoryMode::Source => "next to the original".to_owned(),
            OutputDirectoryMode::Subfolder => "Converted folder beside the original".to_owned(),
            OutputDirectoryMode::Custom => format!(
                "fixed folder {}",
                settings
                    .custom_output_directory
                    .as_deref()
                    .unwrap_or("(none)")
            ),
        }
    ));
    text.push_str(&format!(
        "When a name exists: {}\n",
        match settings.collision_policy {
            CollisionPolicy::Rename => "add a number",
            CollisionPolicy::Overwrite => "replace the existing output",
            CollisionPolicy::Skip => "skip the job",
        }
    ));
    text.push_str(&format!("Theme:            {:?}\n", settings.theme));
    text.push_str(&format!("Parallel jobs:    {}\n", settings.concurrent_jobs));
    text.push_str(&format!("Max input:        {} MB\n", settings.max_input_mb));
    text.push_str(&format!(
        "Timeouts:         document {} s, archive {} s, OCR {} s\n",
        settings.document_timeout_seconds,
        settings.archive_timeout_seconds,
        settings.ocr_timeout_seconds
    ));
    text.push_str(&format!(
        "Extraction caps:  {} MB, {} entries\n",
        settings.max_extraction_mb, settings.max_extraction_files
    ));
    text.push_str(&format!(
        "Delete temp files on exit: {}\n",
        if settings.delete_temp_on_exit {
            "yes"
        } else {
            "no"
        }
    ));
    text.push_str("Engine path overrides:\n");
    if settings.engine_paths.is_empty() {
        text.push_str("  (none — bundled copies and PATH are used)\n");
    } else {
        for (engine, path) in &settings.engine_paths {
            text.push_str(&format!("  {engine}: {path}\n"));
        }
    }

    text.push_str("\nLog files\n---------\n");
    if info.log_files.is_empty() {
        text.push_str("(no log files yet)\n");
    } else {
        for file in &info.log_files {
            text.push_str(&format!("{} — {} bytes\n", file.name, file.bytes));
        }
    }

    text.push_str(
        "\nPrivacy: this report is generated locally. It contains paths and \
         health information, never file contents. Nothing is uploaded.\n",
    );
    Ok(text)
}

/// Writes the report and copies the current log files into a new folder under
/// `destination`. Existing files are never replaced: a new timestamped folder
/// is created for every export.
pub fn export(
    database: &Database,
    engines: &[EngineInfo],
    settings: &AppSettings,
    destination: &Path,
) -> Result<ExportResult, ConversionError> {
    if !destination.is_dir() {
        return Err(ConversionError::Other(format!(
            "the export folder does not exist: {}",
            destination.display()
        )));
    }

    let text = report(database, engines, settings)?;
    let now = system_time_ms(SystemTime::now()).unwrap_or(0);
    let mut folder = destination.join(format!(
        "Universal-Converter-Diagnostics-{}",
        timestamp_slug(now)
    ));
    let mut suffix = 1;
    while folder.exists() {
        folder = destination.join(format!(
            "Universal-Converter-Diagnostics-{}-{suffix}",
            timestamp_slug(now)
        ));
        suffix += 1;
    }
    std::fs::create_dir_all(&folder).map_err(|error| {
        ConversionError::Other(format!(
            "could not create the diagnostics folder {}: {error}",
            folder.display()
        ))
    })?;

    let report_file = folder.join("diagnostics.txt");
    std::fs::write(&report_file, text).map_err(|error| {
        ConversionError::Other(format!(
            "could not write {}: {error}",
            report_file.display()
        ))
    })?;

    let logs_folder = folder.join("logs");
    std::fs::create_dir_all(&logs_folder).map_err(|error| {
        ConversionError::Other(format!(
            "could not create {}: {error}",
            logs_folder.display()
        ))
    })?;

    let mut copied = Vec::new();
    let mut skipped = Vec::new();
    let mut copied_bytes = 0u64;
    for entry in std::fs::read_dir(paths::logs_root())
        .map_err(|error| ConversionError::Other(format!("could not read the log folder: {error}")))?
        .filter_map(Result::ok)
    {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if copied_bytes.saturating_add(metadata.len()) > MAX_EXPORTED_LOG_BYTES {
            skipped.push(name);
            continue;
        }
        match std::fs::copy(entry.path(), logs_folder.join(&name)) {
            Ok(bytes) => {
                copied_bytes = copied_bytes.saturating_add(bytes);
                copied.push(name);
            }
            Err(_) => skipped.push(name),
        }
    }

    Ok(ExportResult {
        directory: folder.display().to_string(),
        report_file: report_file.display().to_string(),
        log_files: copied,
        skipped_logs: skipped,
    })
}

fn timestamp_slug(ms: u64) -> String {
    let (year, month, day, hour, minute, second) = utc_parts(ms);
    format!("{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}")
}

fn format_utc(ms: u64) -> String {
    let (year, month, day, hour, minute, second) = utc_parts(ms);
    format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02} UTC")
}

/// Civil date from a Unix timestamp, independent of the machine's locale.
fn utc_parts(ms: u64) -> (i64, u32, u32, u32, u32, u32) {
    let seconds = (ms / 1000) as i64;
    let days = seconds.div_euclid(86_400);
    let time = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    (
        year,
        month,
        day,
        (time / 3600) as u32,
        ((time % 3600) / 60) as u32,
        (time % 60) as u32,
    )
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_index + 2) / 5 + 1) as u32;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_are_formatted_in_utc_without_a_locale_dependency() {
        // 2026-11-02T18:15:00Z
        assert_eq!(format_utc(1_793_643_300_000), "2026-11-02 18:15:00 UTC");
        assert_eq!(timestamp_slug(1_793_643_300_000), "20261102-181500");
        assert_eq!(utc_parts(0), (1970, 1, 1, 0, 0, 0));
    }
}
