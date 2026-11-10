use crate::core::format::FormatId;
use crate::core::job::{ConversionJob, JobStatus};
use crate::core::settings::AppSettings;
use crate::engines::EngineId;
use crate::error::ConversionError;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

mod backup;

pub use backup::{BackupPreview, read_backup};

const SETTINGS_KEY: &str = "app";

/// Round-trip an enum through its serde string form, so the values stored in the
/// database can never drift from the values sent to the frontend.
fn code_of<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|json| json.as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn decoded<T: for<'de> Deserialize<'de>>(code: &str) -> Result<T, ConversionError> {
    serde_json::from_value(serde_json::Value::String(code.to_owned())).map_err(|error| {
        ConversionError::Database(format!("stored value '{code}' is unreadable: {error}"))
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub input_path: String,
    pub output_path: String,
    pub input_format: FormatId,
    pub output_format: FormatId,
    pub engine: EngineId,
    pub status: JobStatus,
    pub input_bytes: u64,
    pub output_bytes: Option<u64>,
    pub error: Option<String>,
    pub error_kind: Option<String>,
    pub created_at_ms: u64,
    pub finished_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub engine: EngineId,
    pub output_format: FormatId,
    pub settings: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteEntry {
    pub path: String,
    pub format: FormatId,
    pub added_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStats {
    pub history: u64,
    pub presets: u64,
    pub workflows: u64,
    pub automation_rules: u64,
    pub automation_log: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationLogEntry {
    pub id: i64,
    pub rule_id: Option<String>,
    pub level: String,
    pub message: String,
    pub path: Option<String>,
    pub created_at_ms: u64,
}

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, ConversionError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                ConversionError::Database(format!(
                    "could not create the database folder {}: {error}",
                    parent.display()
                ))
            })?;
        }

        let connection = Connection::open(path).map_err(|error| {
            ConversionError::Database(format!("could not open {}: {error}", path.display()))
        })?;
        connection
            .execute_batch(include_str!("schema.sql"))
            .map_err(|error| {
                ConversionError::Database(format!("could not migrate the schema: {error}"))
            })?;

        Ok(Database {
            connection: Mutex::new(connection),
        })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, ConversionError> {
        self.connection
            .lock()
            .map_err(|_| ConversionError::Database("the database lock was poisoned".to_owned()))
    }

    pub fn record_job(&self, job: &ConversionJob) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO conversion_history (
                     id, input_path, output_path, input_format, output_format, engine, status,
                     input_bytes, output_bytes, error, error_kind, created_at_ms, finished_at_ms
                   ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
                   ON CONFLICT(id) DO UPDATE SET
                     status = excluded.status,
                     output_bytes = excluded.output_bytes,
                     error = excluded.error,
                     error_kind = excluded.error_kind,
                     finished_at_ms = excluded.finished_at_ms",
                params![
                    job.id,
                    job.input_path,
                    job.output_path,
                    code_of(&job.input_format),
                    code_of(&job.output_format),
                    code_of(&job.engine),
                    code_of(&job.status),
                    job.input_bytes as i64,
                    job.output_bytes.map(|value| value as i64),
                    job.error,
                    job.error_kind,
                    job.created_at_ms as i64,
                    job.finished_at_ms.map(|value| value as i64),
                ],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        connection
            .execute(
                "INSERT INTO recent_files (path, format, last_used_ms) VALUES (?1,?2,?3)
                 ON CONFLICT(path) DO UPDATE SET last_used_ms = excluded.last_used_ms",
                params![
                    job.input_path,
                    code_of(&job.input_format),
                    job.created_at_ms as i64
                ],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    /// Snapshot written as soon as a job is accepted. Removed when the job
    /// settles; a row still present at startup means the process died first.
    pub fn record_pending_job(&self, job: &ConversionJob) -> Result<(), ConversionError> {
        let json = serde_json::to_string(job)
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO pending_jobs (id, job, submitted_ms) VALUES (?1,?2,?3)
                 ON CONFLICT(id) DO UPDATE SET job = excluded.job, submitted_ms = excluded.submitted_ms",
                params![job.id, json, job.created_at_ms as i64],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    pub fn clear_pending_job(&self, id: &str) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        connection
            .execute("DELETE FROM pending_jobs WHERE id = ?1", params![id])
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    /// Drains the pending table. Unreadable rows are dropped with a warning
    /// rather than blocking every future start-up.
    pub fn take_pending_jobs(&self) -> Result<Vec<ConversionJob>, ConversionError> {
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction()
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let rows = {
            let mut statement = transaction
                .prepare("SELECT id, job FROM pending_jobs ORDER BY submitted_ms ASC")
                .map_err(|error| ConversionError::Database(error.to_string()))?;

            statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|error| ConversionError::Database(error.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| ConversionError::Database(error.to_string()))?
        };
        transaction
            .execute("DELETE FROM pending_jobs", [])
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        transaction
            .commit()
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        let mut jobs = Vec::with_capacity(rows.len());
        for (id, json) in rows {
            match serde_json::from_str::<ConversionJob>(&json) {
                Ok(job) => jobs.push(job),
                Err(error) => log::warn!("dropping unreadable pending job {id}: {error}"),
            }
        }
        Ok(jobs)
    }

    pub fn history(&self, limit: i64, offset: i64) -> Result<Vec<HistoryEntry>, ConversionError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT id, input_path, output_path, input_format, output_format, engine, status,
                        input_bytes, output_bytes, error, error_kind, created_at_ms, finished_at_ms
                 FROM conversion_history
                 ORDER BY created_at_ms DESC, rowid DESC
                 LIMIT ?1 OFFSET ?2",
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        let rows = statement
            .query_map(params![limit, offset], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, Option<i64>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, i64>(11)?,
                    row.get::<_, Option<i64>>(12)?,
                ))
            })
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        let mut entries = Vec::new();
        for row in rows {
            let row = row.map_err(|error| ConversionError::Database(error.to_string()))?;
            entries.push(HistoryEntry {
                id: row.0,
                input_path: row.1,
                output_path: row.2,
                input_format: decoded(&row.3)?,
                output_format: decoded(&row.4)?,
                engine: decoded(&row.5)?,
                status: decoded(&row.6)?,
                input_bytes: row.7.max(0) as u64,
                output_bytes: row.8.map(|value| value.max(0) as u64),
                error: row.9,
                error_kind: row.10,
                created_at_ms: row.11.max(0) as u64,
                finished_at_ms: row.12.map(|value| value.max(0) as u64),
            });
        }
        Ok(entries)
    }

    pub fn clear_history(&self) -> Result<u64, ConversionError> {
        let connection = self.lock()?;
        connection
            .execute("DELETE FROM conversion_history", [])
            .map(|removed| removed as u64)
            .map_err(|error| ConversionError::Database(error.to_string()))
    }

    /// Final state of one job, used by the workflow runner when the queue has
    /// already forgotten a finished job because the user cleared the list.
    pub fn job_outcome(
        &self,
        job_id: &str,
    ) -> Result<Option<(JobStatus, Option<String>)>, ConversionError> {
        let connection = self.lock()?;
        let row = connection
            .query_row(
                "SELECT status, error FROM conversion_history WHERE id = ?1",
                params![job_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        match row {
            Some((status, error)) => Ok(Some((decoded(&status)?, error))),
            None => Ok(None),
        }
    }

    /// "Forget this file": drops its history rows and its recent-files entry.
    /// The converted file itself is never touched.
    pub fn forget_history_of(&self, path: &str) -> Result<u64, ConversionError> {
        let connection = self.lock()?;
        let removed = connection
            .execute(
                "DELETE FROM conversion_history WHERE input_path = ?1",
                params![path],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        connection
            .execute("DELETE FROM recent_files WHERE path = ?1", params![path])
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        connection
            .execute("DELETE FROM favorite_files WHERE path = ?1", params![path])
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(removed as u64)
    }

    pub fn list_favorites(&self) -> Result<Vec<FavoriteEntry>, ConversionError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT path, format, added_at_ms FROM favorite_files ORDER BY added_at_ms DESC",
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let mut entries = Vec::new();
        for row in rows {
            let (path, code, added) =
                row.map_err(|error| ConversionError::Database(error.to_string()))?;
            entries.push(FavoriteEntry {
                path,
                format: decoded(&code)?,
                added_at_ms: added.max(0) as u64,
            });
        }
        Ok(entries)
    }

    pub fn set_favorite(
        &self,
        path: &str,
        format: FormatId,
        favorite: bool,
    ) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        if favorite {
            connection
                .execute(
                    "INSERT INTO favorite_files (path, format, added_at_ms) VALUES (?1,?2,?3)
                     ON CONFLICT(path) DO UPDATE SET format = excluded.format",
                    params![path, code_of(&format), crate::utils::time::now_ms() as i64],
                )
                .map_err(|error| ConversionError::Database(error.to_string()))?;
        } else {
            connection
                .execute("DELETE FROM favorite_files WHERE path = ?1", params![path])
                .map_err(|error| ConversionError::Database(error.to_string()))?;
        }
        Ok(())
    }

    pub fn recent_files(&self, limit: i64) -> Result<Vec<(String, FormatId)>, ConversionError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare("SELECT path, format FROM recent_files ORDER BY last_used_ms DESC LIMIT ?1")
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let rows = statement
            .query_map(params![limit], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        let mut output = Vec::new();
        for row in rows {
            let (path, code) = row.map_err(|error| ConversionError::Database(error.to_string()))?;
            output.push((path, decoded(&code)?));
        }
        Ok(output)
    }

    pub fn load_settings(&self) -> Result<AppSettings, ConversionError> {
        let connection = self.lock()?;
        let stored = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![SETTINGS_KEY],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        match stored {
            Some(json) => serde_json::from_str(&json).map_err(|error| {
                ConversionError::Database(format!("stored settings are corrupt: {error}"))
            }),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), ConversionError> {
        let json = serde_json::to_string(settings)
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![SETTINGS_KEY, json],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    /// Row counts for the diagnostics report. Read-only and cheap; the counts
    /// never include the contents of a job, only how many rows exist.
    pub fn stats(&self) -> Result<DatabaseStats, ConversionError> {
        let connection = self.lock()?;
        let row = connection
            .query_row(
                "SELECT
                    (SELECT COUNT(*) FROM conversion_history),
                    (SELECT COUNT(*) FROM presets),
                    (SELECT COUNT(*) FROM workflows),
                    (SELECT COUNT(*) FROM automation_rules),
                    (SELECT COUNT(*) FROM automation_log)",
                [],
                |row| {
                    Ok(DatabaseStats {
                        history: row.get::<_, i64>(0)?.max(0) as u64,
                        presets: row.get::<_, i64>(1)?.max(0) as u64,
                        workflows: row.get::<_, i64>(2)?.max(0) as u64,
                        automation_rules: row.get::<_, i64>(3)?.max(0) as u64,
                        automation_log: row.get::<_, i64>(4)?.max(0) as u64,
                    })
                },
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(row)
    }

    pub fn list_presets(&self) -> Result<Vec<Preset>, ConversionError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, engine, output_format, settings FROM presets ORDER BY name COLLATE NOCASE",
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        let mut presets = Vec::new();
        for row in rows {
            let (id, name, engine, output_format, settings) =
                row.map_err(|error| ConversionError::Database(error.to_string()))?;
            presets.push(Preset {
                id,
                name,
                engine: decoded(&engine)?,
                output_format: decoded(&output_format)?,
                settings: serde_json::from_str(&settings).unwrap_or(serde_json::Value::Null),
            });
        }
        Ok(presets)
    }

    pub fn save_preset(&self, preset: &Preset) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO presets (id, name, engine, output_format, settings, created_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               engine = excluded.engine,
               output_format = excluded.output_format,
               settings = excluded.settings",
                params![
                    preset.id,
                    preset.name,
                    code_of(&preset.engine),
                    code_of(&preset.output_format),
                    preset.settings.to_string(),
                    crate::utils::time::now_ms() as i64
                ],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    pub fn delete_preset(&self, id: &str) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        connection
            .execute("DELETE FROM presets WHERE id = ?1", params![id])
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    pub fn list_automation_rules(
        &self,
    ) -> Result<Vec<crate::automation::AutomationRule>, ConversionError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, input_dir, output_dir, input_formats, output_format, mode,
                        settings, enabled
                 FROM automation_rules
                 ORDER BY created_at_ms ASC, rowid ASC",
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, i64>(8)?,
                ))
            })
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        let mut rules = Vec::new();
        for row in rows {
            let (id, name, input_dir, output_dir, formats, output_format, mode, settings, enabled) =
                row.map_err(|error| ConversionError::Database(error.to_string()))?;
            let format_codes: Vec<String> = serde_json::from_str(&formats).unwrap_or_default();
            let mut input_formats = Vec::with_capacity(format_codes.len());
            for code in format_codes {
                input_formats.push(decoded(&code)?);
            }
            rules.push(crate::automation::AutomationRule {
                id,
                name,
                input_dir,
                output_dir,
                input_formats,
                output_format: decoded(&output_format)?,
                mode: decoded(&mode)?,
                settings: serde_json::from_str(&settings).unwrap_or(serde_json::Value::Null),
                enabled: enabled != 0,
            });
        }
        Ok(rules)
    }

    /// Inserts or updates a rule. Validation happens in the automation module
    /// before this is called; the database only stores what it is given.
    pub fn save_automation_rule(
        &self,
        rule: &crate::automation::AutomationRule,
    ) -> Result<(), ConversionError> {
        let formats = serde_json::to_string(&rule.input_formats)
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO automation_rules (
                     id, name, input_dir, output_dir, input_formats, output_format, mode,
                     settings, enabled, created_at_ms
                   ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
                   ON CONFLICT(id) DO UPDATE SET
                     name = excluded.name,
                     input_dir = excluded.input_dir,
                     output_dir = excluded.output_dir,
                     input_formats = excluded.input_formats,
                     output_format = excluded.output_format,
                     mode = excluded.mode,
                     settings = excluded.settings,
                     enabled = excluded.enabled",
                params![
                    rule.id,
                    rule.name,
                    rule.input_dir,
                    rule.output_dir,
                    formats,
                    code_of(&rule.output_format),
                    code_of(&rule.mode),
                    rule.settings.to_string(),
                    if rule.enabled { 1 } else { 0 },
                    crate::utils::time::now_ms() as i64
                ],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    pub fn delete_automation_rule(&self, id: &str) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        connection
            .execute("DELETE FROM automation_rules WHERE id = ?1", params![id])
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    pub fn append_automation_log(
        &self,
        rule_id: Option<&str>,
        level: &str,
        message: &str,
        path: Option<&str>,
    ) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO automation_log (rule_id, level, message, path, created_at_ms)
                 VALUES (?1,?2,?3,?4,?5)",
                params![
                    rule_id,
                    level,
                    message,
                    path,
                    crate::utils::time::now_ms() as i64
                ],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    pub fn automation_logs(&self, limit: i64) -> Result<Vec<AutomationLogEntry>, ConversionError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT id, rule_id, level, message, path, created_at_ms
                 FROM automation_log
                 ORDER BY created_at_ms DESC, rowid DESC
                 LIMIT ?1",
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let rows = statement
            .query_map(params![limit.max(1)], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            })
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        let mut logs = Vec::new();
        for row in rows {
            let entry = row.map_err(|error| ConversionError::Database(error.to_string()))?;
            logs.push(AutomationLogEntry {
                id: entry.0,
                rule_id: entry.1,
                level: entry.2,
                message: entry.3,
                path: entry.4,
                created_at_ms: entry.5.max(0) as u64,
            });
        }
        Ok(logs)
    }

    pub fn clear_automation_log(&self) -> Result<u64, ConversionError> {
        let connection = self.lock()?;
        connection
            .execute("DELETE FROM automation_log", [])
            .map(|removed| removed as u64)
            .map_err(|error| ConversionError::Database(error.to_string()))
    }

    pub fn automation_paused(&self) -> Result<bool, ConversionError> {
        let connection = self.lock()?;
        let stored = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'automation_paused'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(stored.as_deref() == Some("1"))
    }

    pub fn set_automation_paused(&self, paused: bool) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO app_settings (key, value) VALUES ('automation_paused', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![if paused { "1" } else { "0" }],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    pub fn list_workflows(
        &self,
    ) -> Result<Vec<crate::workflow::WorkflowDefinition>, ConversionError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare("SELECT id, name, steps FROM workflows ORDER BY created_at_ms ASC, rowid ASC")
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|error| ConversionError::Database(error.to_string()))?;

        let mut workflows = Vec::new();
        for row in rows {
            let (id, name, steps) =
                row.map_err(|error| ConversionError::Database(error.to_string()))?;
            let steps: Vec<crate::workflow::WorkflowStep> =
                serde_json::from_str(&steps).map_err(|error| {
                    ConversionError::Database(format!(
                        "workflow '{name}' steps are corrupt: {error}"
                    ))
                })?;
            workflows.push(crate::workflow::WorkflowDefinition { id, name, steps });
        }
        Ok(workflows)
    }

    pub fn save_workflow(
        &self,
        workflow: &crate::workflow::WorkflowDefinition,
    ) -> Result<(), ConversionError> {
        let steps = serde_json::to_string(&workflow.steps)
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO workflows (id, name, steps, created_at_ms)
                 VALUES (?1,?2,?3,?4)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   steps = excluded.steps",
                params![
                    workflow.id,
                    workflow.name,
                    steps,
                    crate::utils::time::now_ms() as i64
                ],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    pub fn delete_workflow(&self, id: &str) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        connection
            .execute("DELETE FROM workflows WHERE id = ?1", params![id])
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }

    /// Keeps the last-seen engine builds so Settings can flag a silent upgrade.
    pub fn remember_engine_version(
        &self,
        id: EngineId,
        version: Option<&str>,
        available: bool,
    ) -> Result<(), ConversionError> {
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO engine_versions (engine, version, unavailable, detected_ms)
                 VALUES (?1,?2,?3,?4)
                 ON CONFLICT(engine) DO UPDATE SET
                   version = excluded.version,
                   unavailable = excluded.unavailable,
                   detected_ms = excluded.detected_ms",
                params![
                    code_of(&id),
                    version,
                    if available { 0 } else { 1 },
                    crate::utils::time::now_ms() as i64
                ],
            )
            .map_err(|error| ConversionError::Database(error.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::job::JobRequest;
    use std::path::PathBuf;

    fn temp_db(name: &str) -> (Database, PathBuf) {
        let file = std::env::temp_dir().join(format!("uc-test-{name}.db"));
        let _ = std::fs::remove_file(&file);
        let _ = std::fs::remove_file(format!("{}-wal", file.display()));
        let _ = std::fs::remove_file(format!("{}-shm", file.display()));
        (Database::open(&file).unwrap(), file)
    }

    fn sample_job(id: &str, status: JobStatus) -> ConversionJob {
        let request = JobRequest::for_test(
            &["C:/data/photo.jpg"],
            FormatId::Png,
            serde_json::json!({ "quality": 88 }),
        );
        let mut job = ConversionJob::new(
            &request,
            FormatId::Jpeg,
            EngineId::Image,
            PathBuf::from("C:/data/Converted/photo.png"),
            2048,
        );
        job.id = id.to_owned();
        job.status = status;
        job.output_bytes = Some(1024);
        job
    }

    #[test]
    fn fresh_database_starts_with_default_settings() {
        let (db, file) = temp_db("defaults");
        let settings = db.load_settings().unwrap();
        assert_eq!(settings.concurrent_jobs, 2);
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn settings_round_trip() {
        let (db, file) = temp_db("settings");
        let mut settings = AppSettings::default();
        settings.concurrent_jobs = 7;
        settings.theme = crate::core::settings::ThemeChoice::Light;
        db.save_settings(&settings).unwrap();

        let reloaded = db.load_settings().unwrap();
        assert_eq!(reloaded.concurrent_jobs, 7);
        assert_eq!(reloaded.theme, crate::core::settings::ThemeChoice::Light);
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn job_is_recorded_and_read_back() {
        let (db, file) = temp_db("history");
        db.record_job(&sample_job("job-1", JobStatus::Completed))
            .unwrap();
        // Second write must update the same row, never duplicate it.
        db.record_job(&sample_job("job-1", JobStatus::Failed))
            .unwrap();

        let history = db.history(10, 0).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].status, JobStatus::Failed);
        assert_eq!(history[0].input_format, FormatId::Jpeg);
        assert_eq!(history[0].output_format, FormatId::Png);
        assert_eq!(history[0].engine, EngineId::Image);
        assert_eq!(history[0].output_bytes, Some(1024));
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn recent_files_dedupe_and_order() {
        let (db, file) = temp_db("recent");
        db.record_job(&sample_job("r-1", JobStatus::Completed))
            .unwrap();
        db.record_job(&sample_job("r-2", JobStatus::Completed))
            .unwrap();
        let recent = db.recent_files(5).unwrap();
        assert_eq!(recent.len(), 1, "same input path must collapse to one row");
        assert_eq!(recent[0].1, FormatId::Jpeg);
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn favourites_are_stored_removed_and_follow_forget_history() {
        let (db, file) = temp_db("favorites");
        db.set_favorite("C:/data/photo.jpg", FormatId::Jpeg, true)
            .unwrap();
        db.set_favorite("C:/data/song.mp3", FormatId::Mp3, true)
            .unwrap();
        let favorites = db.list_favorites().unwrap();
        assert_eq!(favorites.len(), 2);
        assert!(favorites.iter().any(|entry| entry.format == FormatId::Mp3));

        // Pinning twice must not duplicate the row.
        db.set_favorite("C:/data/photo.jpg", FormatId::Jpeg, true)
            .unwrap();
        assert_eq!(db.list_favorites().unwrap().len(), 2);

        db.set_favorite("C:/data/photo.jpg", FormatId::Jpeg, false)
            .unwrap();
        assert_eq!(db.list_favorites().unwrap().len(), 1);

        db.set_favorite("C:/data/song.mp3", FormatId::Mp3, true)
            .unwrap();
        db.forget_history_of("C:/data/song.mp3").unwrap();
        assert!(db.list_favorites().unwrap().is_empty());
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn presets_survive_a_reload() {
        let (db, file) = temp_db("presets");
        db.save_preset(&Preset {
            id: "p1".to_owned(),
            name: "Web 1600".to_owned(),
            engine: EngineId::Image,
            output_format: FormatId::Webp,
            settings: serde_json::json!({ "quality": 82, "resizeMode": "width" }),
        })
        .unwrap();

        let presets = db.list_presets().unwrap();
        assert_eq!(presets.len(), 1);
        assert_eq!(presets[0].settings["quality"], 82);
        assert_eq!(presets[0].engine, EngineId::Image);

        db.delete_preset("p1").unwrap();
        assert!(db.list_presets().unwrap().is_empty());
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn clearing_history_empties_it_but_keeps_settings() {
        let (db, file) = temp_db("clear");
        db.record_job(&sample_job("c-1", JobStatus::Completed))
            .unwrap();
        assert_eq!(db.clear_history().unwrap(), 1);
        assert!(db.history(10, 0).unwrap().is_empty());
        assert!(db.load_settings().is_ok());
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn forgetting_one_file_leaves_the_others_alone() {
        let (db, file) = temp_db("forget");
        db.record_job(&sample_job("f-1", JobStatus::Completed))
            .unwrap();
        db.record_job(&sample_job("f-2", JobStatus::Failed))
            .unwrap();
        let mut other = sample_job("f-3", JobStatus::Completed);
        other.input_path = "C:/data/song.mp3".to_owned();
        db.record_job(&other).unwrap();
        assert_eq!(db.history(10, 0).unwrap().len(), 3);

        // Both photo.jpg attempts go, the mp3 job and its recent entry stay.
        assert_eq!(db.forget_history_of("C:/data/photo.jpg").unwrap(), 2);
        let left = db.history(10, 0).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].input_path, "C:/data/song.mp3");
        let recent = db.recent_files(10).unwrap();
        assert_eq!(recent.len(), 1, "forgotten path must leave Recents too");
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn engine_versions_are_upserted() {
        let (db, file) = temp_db("engines");
        db.remember_engine_version(EngineId::Media, Some("ffmpeg version 7.1"), false)
            .unwrap();
        db.remember_engine_version(EngineId::Media, Some("ffmpeg version 8.0"), false)
            .unwrap();
        let connection = db.connection.lock().unwrap();
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM engine_versions WHERE engine = 'media'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "re-detecting an engine must update, not append");
        drop(connection);
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn reopening_the_same_file_keeps_rows() {
        let file = std::env::temp_dir().join("uc-test-persist.db");
        let _ = std::fs::remove_file(&file);
        {
            let db = Database::open(&file).unwrap();
            db.record_job(&sample_job("persist-1", JobStatus::Completed))
                .unwrap();
        }
        let reopened = Database::open(&file).unwrap();
        assert_eq!(reopened.history(10, 0).unwrap().len(), 1);
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn corrupt_stored_settings_are_reported_not_swallowed() {
        let (db, file) = temp_db("corrupt");
        {
            let connection = db.connection.lock().unwrap();
            connection
                .execute(
                    "INSERT INTO app_settings (key, value) VALUES ('app','{not json')
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [],
                )
                .unwrap();
        }
        let error = db.load_settings().expect_err("bad JSON must surface");
        assert!(matches!(error, ConversionError::Database(_)), "{error}");
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn pending_jobs_are_drained_once() {
        let (db, file) = temp_db("pending");
        let job = sample_job("pending-1", JobStatus::Queued);
        db.record_pending_job(&job).unwrap();
        db.record_pending_job(&job).unwrap();

        let drained = db.take_pending_jobs().unwrap();
        assert_eq!(drained.len(), 1, "the primary key prevents duplicates");
        assert_eq!(drained[0].id, "pending-1");
        assert_eq!(drained[0].settings["quality"], 88);
        assert!(db.take_pending_jobs().unwrap().is_empty());
        std::fs::remove_file(file).ok();
    }

    fn backup_fixture(name: &str) -> (Database, PathBuf) {
        let (db, file) = temp_db(&format!("backup-{name}"));
        let settings = AppSettings {
            concurrent_jobs: 5,
            ..AppSettings::default()
        };
        db.save_settings(&settings).unwrap();

        db.save_preset(&Preset {
            id: "preset-1".to_owned(),
            name: "Web small".to_owned(),
            engine: EngineId::Image,
            output_format: FormatId::Webp,
            settings: serde_json::json!({ "quality": 70 }),
        })
        .unwrap();

        db.save_workflow(&crate::workflow::WorkflowDefinition {
            id: "workflow-1".to_owned(),
            name: "Shrink and convert".to_owned(),
            steps: vec![crate::workflow::WorkflowStep {
                operation: crate::workflow::WorkflowOperation::Convert,
                output_format: FormatId::Webp,
                settings: serde_json::json!({ "quality": 75 }),
            }],
        })
        .unwrap();

        let input = std::env::temp_dir().join(format!("uc-test-backup-{name}-in"));
        let output = std::env::temp_dir().join(format!("uc-test-backup-{name}-out"));
        let _ = std::fs::create_dir_all(&input);
        let _ = std::fs::create_dir_all(&output);
        db.save_automation_rule(&crate::automation::AutomationRule {
            id: "rule-1".to_owned(),
            name: "Screenshots".to_owned(),
            input_dir: input.display().to_string(),
            output_dir: output.display().to_string(),
            input_formats: vec![FormatId::Png],
            output_format: FormatId::Jpeg,
            mode: crate::automation::AutomationMode::Convert,
            settings: serde_json::json!({ "quality": 80 }),
            enabled: true,
        })
        .unwrap();

        db.set_favorite("C:/data/shot.png", FormatId::Png, true)
            .unwrap();
        db.record_job(&sample_job("history-1", JobStatus::Completed))
            .unwrap();
        (db, file)
    }

    #[test]
    fn a_validated_backup_round_trips_every_section() {
        let (db, db_file) = backup_fixture("roundtrip");
        let backup_file = std::env::temp_dir().join("uc-test-roundtrip-backup.json");
        let _ = std::fs::remove_file(&backup_file);

        let preview = db.write_backup(&backup_file, "1.0.0-test").unwrap();
        assert_eq!(preview.history, 1);
        assert_eq!(preview.presets, 1);
        assert_eq!(preview.workflows, 1);
        assert_eq!(preview.automation_rules, 1);
        assert_eq!(preview.favorites, 1);

        let text = std::fs::read_to_string(&backup_file).unwrap();
        assert!(!text.to_ascii_lowercase().contains("password"));

        // Replace the live data so the restore has something real to undo.
        db.clear_history().unwrap();
        db.delete_preset("preset-1").unwrap();
        db.delete_workflow("workflow-1").unwrap();
        db.delete_automation_rule("rule-1").unwrap();
        db.set_favorite("C:/data/shot.png", FormatId::Png, false)
            .unwrap();
        let mut changed = db.load_settings().unwrap();
        changed.concurrent_jobs = 1;
        db.save_settings(&changed).unwrap();

        let bundle = read_backup(&backup_file).unwrap();
        db.restore_bundle(&bundle).unwrap();

        assert_eq!(db.history(10, 0).unwrap().len(), 1);
        assert_eq!(db.list_presets().unwrap()[0].name, "Web small");
        assert_eq!(db.list_workflows().unwrap()[0].name, "Shrink and convert");
        assert_eq!(db.list_automation_rules().unwrap()[0].id, "rule-1");
        assert_eq!(db.list_favorites().unwrap()[0].path, "C:/data/shot.png");
        assert_eq!(db.load_settings().unwrap().concurrent_jobs, 5);

        let _ = std::fs::remove_file(backup_file);
        let _ = std::fs::remove_file(db_file);
        let _ = std::fs::remove_dir_all(std::env::temp_dir().join("uc-test-backup-roundtrip-in"));
        let _ = std::fs::remove_dir_all(std::env::temp_dir().join("uc-test-backup-roundtrip-out"));
    }

    #[test]
    fn corrupted_or_foreign_backups_are_refused_without_touching_data() {
        let (db, db_file) = backup_fixture("corrupt");
        let bad = std::env::temp_dir().join("uc-test-bad-backup.json");

        std::fs::write(&bad, b"{ not json").unwrap();
        assert!(read_backup(&bad).is_err());

        std::fs::write(
            &bad,
            serde_json::json!({
                "format": "some-other-tool",
                "version": 1,
                "appVersion": "1.0.0",
                "createdAtMs": 0,
                "settings": AppSettings::default(),
                "presets": [],
                "workflows": [],
                "automationRules": [],
                "favorites": [],
                "history": []
            })
            .to_string(),
        )
        .unwrap();
        let error = read_backup(&bad).expect_err("foreign format must be refused");
        assert!(
            error
                .to_string()
                .contains("not created by Universal Converter")
        );
        assert_eq!(db.list_presets().unwrap().len(), 1, "nothing was replaced");

        let _ = std::fs::remove_file(bad);
        let _ = std::fs::remove_file(db_file);
        let _ = std::fs::remove_dir_all(std::env::temp_dir().join("uc-test-backup-corrupt-in"));
        let _ = std::fs::remove_dir_all(std::env::temp_dir().join("uc-test-backup-corrupt-out"));
    }
}
