use crate::core::job::JobStatus;
use crate::core::presets::{scrub_secrets, settings_have_secret, validate_preset};
use crate::core::settings::AppSettings;
use crate::database::{Database, FavoriteEntry, HistoryEntry, Preset};
use crate::error::ConversionError;
use crate::workflow::{WorkflowDefinition, validate_workflow};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

pub const BACKUP_FORMAT: &str = "universal-converter.backup";
pub const BACKUP_VERSION: u32 = 1;
const MAX_BACKUP_BYTES: u64 = 256 * 1024 * 1024;
const MAX_HISTORY_ROWS: usize = 100_000;
const MAX_PRESETS: usize = 5_000;
const MAX_WORKFLOWS: usize = 1_000;
const MAX_RULES: usize = 1_000;
const MAX_FAVORITES: usize = 20_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupBundle {
    pub format: String,
    pub version: u32,
    pub app_version: String,
    pub created_at_ms: u64,
    pub settings: AppSettings,
    pub presets: Vec<Preset>,
    pub workflows: Vec<WorkflowDefinition>,
    pub automation_rules: Vec<crate::automation::AutomationRule>,
    pub favorites: Vec<FavoriteEntry>,
    pub history: Vec<HistoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    pub format: String,
    pub version: u32,
    pub app_version: String,
    pub created_at_ms: u64,
    pub presets: usize,
    pub workflows: usize,
    pub automation_rules: usize,
    pub favorites: usize,
    pub history: usize,
}

impl BackupBundle {
    pub fn preview(&self) -> BackupPreview {
        BackupPreview {
            format: self.format.clone(),
            version: self.version,
            app_version: self.app_version.clone(),
            created_at_ms: self.created_at_ms,
            presets: self.presets.len(),
            workflows: self.workflows.len(),
            automation_rules: self.automation_rules.len(),
            favorites: self.favorites.len(),
            history: self.history.len(),
        }
    }
}

fn portable(message: impl Into<String>) -> ConversionError {
    ConversionError::Other(message.into())
}

/// Reads and fully validates a backup before anything is replaced. Every check
/// happens up front so a bad file can never leave the database half restored.
pub fn read_backup(path: &Path) -> Result<BackupBundle, ConversionError> {
    let metadata = std::fs::metadata(path)
        .map_err(|error| portable(format!("could not read {}: {error}", path.display())))?;
    if !metadata.is_file() {
        return Err(portable(format!("{} is not a file", path.display())));
    }
    if metadata.len() > MAX_BACKUP_BYTES {
        return Err(portable(format!(
            "this backup is larger than {} MB, so it is not a settings backup Universal Converter wrote",
            MAX_BACKUP_BYTES / (1024 * 1024)
        )));
    }
    let text = std::fs::read_to_string(path)
        .map_err(|error| portable(format!("could not read {}: {error}", path.display())))?;
    let mut bundle: BackupBundle = serde_json::from_str(&text)
        .map_err(|error| portable(format!("this is not a valid backup file: {error}")))?;
    validate_bundle(&mut bundle)?;
    Ok(bundle)
}

fn validate_bundle(bundle: &mut BackupBundle) -> Result<(), ConversionError> {
    if bundle.format != BACKUP_FORMAT {
        return Err(portable(
            "this file was not created by Universal Converter's backup command",
        ));
    }
    if bundle.version != BACKUP_VERSION {
        return Err(portable(format!(
            "backup version {} is not supported; this build understands version {BACKUP_VERSION}",
            bundle.version
        )));
    }
    if bundle.history.len() > MAX_HISTORY_ROWS {
        return Err(portable(format!(
            "this backup contains more than {MAX_HISTORY_ROWS} history rows and is not accepted"
        )));
    }
    if bundle.presets.len() > MAX_PRESETS
        || bundle.workflows.len() > MAX_WORKFLOWS
        || bundle.automation_rules.len() > MAX_RULES
        || bundle.favorites.len() > MAX_FAVORITES
    {
        return Err(portable(
            "this backup contains an unreasonable number of entries",
        ));
    }

    let mut preset_names = HashSet::new();
    for preset in &bundle.presets {
        validate_preset(preset)
            .map_err(|message| portable(format!("invalid preset: {message}")))?;
        if let Some(path) = settings_have_secret(&preset.settings) {
            return Err(portable(format!(
                "preset '{}' contains a secret-looking key ({path}); backups never store passwords",
                preset.name
            )));
        }
        if !preset_names.insert(preset.name.clone()) {
            return Err(portable(format!(
                "two presets are named '{}'; the backup is ambiguous",
                preset.name
            )));
        }
    }

    let mut workflow_names = HashSet::new();
    for workflow in &mut bundle.workflows {
        validate_workflow(workflow)?;
        if !workflow_names.insert(workflow.name.clone()) {
            return Err(portable(format!(
                "two workflows are named '{}'; the backup is ambiguous",
                workflow.name
            )));
        }
    }

    for rule in &mut bundle.automation_rules {
        crate::automation::validate_rule(rule)?;
    }

    let mut favorite_paths = HashSet::new();
    for favorite in &bundle.favorites {
        if favorite.path.trim().is_empty() {
            return Err(portable("a favorite has an empty path"));
        }
        if !favorite_paths.insert(favorite.path.clone()) {
            return Err(portable("the backup lists the same favorite twice"));
        }
    }

    for entry in &mut bundle.history {
        // A backup taken while the app was running must not resurrect a job as
        // if it were still queued. It never produced a trustworthy output.
        if !entry.status.is_finished() {
            entry.status = JobStatus::Failed;
            entry.error_kind = Some("interrupted".to_owned());
            entry.error = Some(
                "This job was still unfinished when the backup was written; it has no verified output."
                    .to_owned(),
            );
            entry.finished_at_ms = Some(entry.created_at_ms);
            entry.output_bytes = None;
        }
    }

    Ok(())
}

impl Database {
    pub fn backup_bundle(&self, app_version: &str) -> Result<BackupBundle, ConversionError> {
        let mut presets = self.list_presets()?;
        let mut workflows = self.list_workflows()?;
        let mut automation_rules = self.list_automation_rules()?;
        let mut scrubbed = 0_usize;

        for preset in &mut presets {
            let (settings, removed) = scrub_secrets(&preset.settings);
            scrubbed += removed.len();
            preset.settings = settings;
        }
        for workflow in &mut workflows {
            for step in &mut workflow.steps {
                let (settings, removed) = scrub_secrets(&step.settings);
                scrubbed += removed.len();
                step.settings = settings;
            }
        }
        for rule in &mut automation_rules {
            let (settings, removed) = scrub_secrets(&rule.settings);
            scrubbed += removed.len();
            rule.settings = settings;
        }
        if scrubbed > 0 {
            log::warn!("removed {scrubbed} secret-looking key(s) while writing a backup");
        }

        let bundle = BackupBundle {
            format: BACKUP_FORMAT.to_owned(),
            version: BACKUP_VERSION,
            app_version: app_version.to_owned(),
            created_at_ms: crate::utils::time::now_ms(),
            settings: self.load_settings()?,
            presets,
            workflows,
            automation_rules,
            favorites: self.list_favorites()?,
            history: self.history(MAX_HISTORY_ROWS as i64, 0)?,
        };
        Ok(bundle)
    }

    /// Writes a bundle and returns the same preview `inspect_backup` would show.
    pub fn write_backup(
        &self,
        path: &Path,
        app_version: &str,
    ) -> Result<BackupPreview, ConversionError> {
        if let Some(parent) = path.parent()
            && !parent.is_dir()
        {
            return Err(portable(format!(
                "the folder {} does not exist",
                parent.display()
            )));
        }
        let bundle = self.backup_bundle(app_version)?;
        let json = serde_json::to_string_pretty(&bundle)
            .map_err(|error| portable(format!("could not encode the backup: {error}")))?;
        std::fs::write(path, json)
            .map_err(|error| portable(format!("could not write {}: {error}", path.display())))?;
        Ok(bundle.preview())
    }

    /// Replaces the user-created data after `read_backup` has validated every
    /// row. Runs in one SQLite transaction, so a failure changes nothing.
    pub fn restore_bundle(&self, bundle: &BackupBundle) -> Result<(), ConversionError> {
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction()
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        for table in [
            "conversion_history",
            "presets",
            "workflows",
            "automation_rules",
            "favorite_files",
            "pending_jobs",
            "automation_log",
        ] {
            transaction
                .execute(&format!("DELETE FROM {table}"), [])
                .map_err(|error| ConversionError::Database(error.to_string()))?;
        }

        let settings = serde_json::to_string(&bundle.settings)
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        transaction
            .execute(
                "INSERT INTO app_settings (key, value) VALUES ('app', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                rusqlite::params![settings],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        let now = crate::utils::time::now_ms() as i64;
        for preset in &bundle.presets {
            transaction
                .execute(
                    "INSERT INTO presets (id, name, engine, output_format, settings, created_at_ms)
                     VALUES (?1,?2,?3,?4,?5,?6)",
                    rusqlite::params![
                        preset.id,
                        preset.name,
                        super::code_of(&preset.engine),
                        super::code_of(&preset.output_format),
                        preset.settings.to_string(),
                        now
                    ],
                )
                .map_err(|error| ConversionError::Database(error.to_string()))?;
        }

        for workflow in &bundle.workflows {
            let steps = serde_json::to_string(&workflow.steps)
                .map_err(|error| ConversionError::Database(error.to_string()))?;
            transaction
                .execute(
                    "INSERT INTO workflows (id, name, steps, created_at_ms) VALUES (?1,?2,?3,?4)",
                    rusqlite::params![workflow.id, workflow.name, steps, now],
                )
                .map_err(|error| ConversionError::Database(error.to_string()))?;
        }

        for rule in &bundle.automation_rules {
            let formats = serde_json::to_string(&rule.input_formats)
                .map_err(|error| ConversionError::Database(error.to_string()))?;
            transaction
                .execute(
                    "INSERT INTO automation_rules (
                         id, name, input_dir, output_dir, input_formats, output_format, mode,
                         settings, enabled, created_at_ms
                       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                    rusqlite::params![
                        rule.id,
                        rule.name,
                        rule.input_dir,
                        rule.output_dir,
                        formats,
                        super::code_of(&rule.output_format),
                        super::code_of(&rule.mode),
                        rule.settings.to_string(),
                        if rule.enabled { 1_i64 } else { 0_i64 },
                        now
                    ],
                )
                .map_err(|error| ConversionError::Database(error.to_string()))?;
        }

        for favorite in &bundle.favorites {
            transaction
                .execute(
                    "INSERT INTO favorite_files (path, format, added_at_ms) VALUES (?1,?2,?3)",
                    rusqlite::params![
                        favorite.path,
                        super::code_of(&favorite.format),
                        favorite.added_at_ms as i64
                    ],
                )
                .map_err(|error| ConversionError::Database(error.to_string()))?;
        }

        for entry in &bundle.history {
            transaction
                .execute(
                    "INSERT INTO conversion_history (
                         id, input_path, output_path, input_format, output_format, engine, status,
                         input_bytes, output_bytes, error, error_kind, created_at_ms, finished_at_ms
                       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
                    rusqlite::params![
                        entry.id,
                        entry.input_path,
                        entry.output_path,
                        super::code_of(&entry.input_format),
                        super::code_of(&entry.output_format),
                        super::code_of(&entry.engine),
                        super::code_of(&entry.status),
                        entry.input_bytes as i64,
                        entry.output_bytes.map(|value| value as i64),
                        entry.error,
                        entry.error_kind,
                        entry.created_at_ms as i64,
                        entry.finished_at_ms.map(|value| value as i64),
                    ],
                )
                .map_err(|error| ConversionError::Database(error.to_string()))?;
        }

        transaction
            .commit()
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }
}
