use crate::core::format::FormatId;
use crate::core::job::{JobOperation, JobRequest, JobStatus};
use crate::core::presets::settings_have_secret;
use crate::database::Database;
use crate::error::ConversionError;
use crate::queue::pool::ConversionQueue;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use uuid::Uuid;

pub const MAX_STEPS: usize = 6;
pub const MAX_INPUTS: usize = 500;
const MAX_RUNS_KEPT: usize = 100;
const POLL: Duration = Duration::from_millis(150);
/// A step that never reports back would otherwise pin a run forever. Engines
/// have their own per-command timeouts; this is the last line of defence.
const STEP_TIMEOUT: Duration = Duration::from_secs(60 * 60);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowOperation {
    #[default]
    Convert,
    Ocr,
}

impl From<WorkflowOperation> for JobOperation {
    fn from(value: WorkflowOperation) -> Self {
        match value {
            WorkflowOperation::Convert => JobOperation::Convert,
            WorkflowOperation::Ocr => JobOperation::Ocr,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkflowStep {
    pub operation: WorkflowOperation,
    pub output_format: FormatId,
    pub settings: serde_json::Value,
}

impl Default for WorkflowStep {
    fn default() -> Self {
        WorkflowStep {
            operation: WorkflowOperation::Convert,
            output_format: FormatId::Unknown,
            settings: serde_json::Value::Null,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[derive(Default)]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    pub steps: Vec<WorkflowStep>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkflowRequest {
    pub workflow_id: String,
    pub input_paths: Vec<String>,
    pub output_dir: String,
    /// Only for single-file runs; a batch names every output after its input.
    #[serde(default)]
    pub output_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RunStatus {
    Running,
    Completed,
    CompletedWithErrors,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: String,
    pub workflow_id: String,
    pub workflow_name: String,
    pub status: RunStatus,
    pub total: usize,
    pub completed: usize,
    pub failed: usize,
    pub total_steps: usize,
    pub current_step: usize,
    pub current_input: Option<String>,
    pub active_job_id: Option<String>,
    pub outputs: Vec<String>,
    pub errors: Vec<String>,
    pub started_at_ms: u64,
    pub finished_at_ms: Option<u64>,
}

pub fn validate_workflow(workflow: &mut WorkflowDefinition) -> Result<(), ConversionError> {
    workflow.name = workflow.name.trim().to_owned();
    if workflow.id.trim().is_empty() {
        workflow.id = Uuid::new_v4().to_string();
    }
    if workflow.name.is_empty() {
        return Err(ConversionError::Other(
            "give the workflow a name".to_owned(),
        ));
    }
    if workflow.name.chars().count() > 80 {
        return Err(ConversionError::Other(
            "workflow names are limited to 80 characters".to_owned(),
        ));
    }
    if workflow.steps.is_empty() {
        return Err(ConversionError::Other(
            "a workflow needs at least one step".to_owned(),
        ));
    }
    if workflow.steps.len() > MAX_STEPS {
        return Err(ConversionError::Other(format!(
            "workflows are limited to {MAX_STEPS} steps"
        )));
    }
    for (index, step) in workflow.steps.iter().enumerate() {
        let number = index + 1;
        if step.output_format == FormatId::Unknown {
            return Err(ConversionError::Other(format!(
                "step {number} has no output format"
            )));
        }
        if step.operation == WorkflowOperation::Ocr
            && !crate::engines::ocr::OCR_OUTPUTS.contains(&step.output_format)
        {
            return Err(ConversionError::Other(format!(
                "step {number} is OCR, which can only write plain text or a searchable PDF"
            )));
        }
        if !step.settings.is_object() && !step.settings.is_null() {
            return Err(ConversionError::Other(format!(
                "step {number} stores settings that are not an object"
            )));
        }
        if let Some(path) = settings_have_secret(&step.settings) {
            return Err(ConversionError::Other(format!(
                "step {number} contains a secret-looking key ({path}); passwords are never stored in a workflow"
            )));
        }
    }
    Ok(())
}

fn invalid_name(name: &str) -> Option<char> {
    name.chars().find(|character| {
        matches!(
            character,
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
        )
    })
}

fn file_label(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_owned())
}

pub struct WorkflowService {
    database: Arc<Database>,
    queue: Arc<ConversionQueue>,
    temp_dir: PathBuf,
    runs: Mutex<HashMap<String, WorkflowRun>>,
    cancelled: Mutex<HashSet<String>>,
}

enum WaitOutcome {
    Completed,
    Failed(String),
    Cancelled,
}

impl WorkflowService {
    pub fn new(
        database: Arc<Database>,
        queue: Arc<ConversionQueue>,
        temp_dir: PathBuf,
    ) -> Arc<Self> {
        Arc::new(WorkflowService {
            database,
            queue,
            temp_dir,
            runs: Mutex::new(HashMap::new()),
            cancelled: Mutex::new(HashSet::new()),
        })
    }

    pub fn runs(&self) -> Vec<WorkflowRun> {
        let mut runs: Vec<WorkflowRun> = self.lock_runs().values().cloned().collect();
        runs.sort_by(|left, right| {
            right
                .started_at_ms
                .cmp(&left.started_at_ms)
                .then_with(|| right.id.cmp(&left.id))
        });
        runs
    }

    /// Validates the request, registers the run and starts its thread. Step
    /// outputs that are not final go to the app temp folder, never next to the
    /// originals.
    pub fn start(
        self: &Arc<Self>,
        workflow: WorkflowDefinition,
        request: WorkflowRequest,
    ) -> Result<WorkflowRun, ConversionError> {
        let mut workflow = workflow;
        validate_workflow(&mut workflow)?;
        if request.input_paths.is_empty() {
            return Err(ConversionError::Other(
                "add at least one file to run this workflow".to_owned(),
            ));
        }
        if request.input_paths.len() > MAX_INPUTS {
            return Err(ConversionError::Other(format!(
                "a workflow run handles at most {MAX_INPUTS} files at once"
            )));
        }
        for input in &request.input_paths {
            if !Path::new(input).is_file() {
                return Err(ConversionError::Other(format!(
                    "{} is not a file that can be read",
                    file_label(input)
                )));
            }
        }

        let output_dir = request.output_dir.trim();
        if output_dir.is_empty() {
            return Err(ConversionError::Other(
                "choose a folder for the finished files".to_owned(),
            ));
        }
        std::fs::create_dir_all(output_dir).map_err(|error| {
            ConversionError::Other(format!("could not create {output_dir}: {error}"))
        })?;
        if !Path::new(output_dir).is_dir() {
            return Err(ConversionError::Other(format!(
                "{output_dir} is not a folder"
            )));
        }

        let output_name = request
            .output_name
            .map(|name| name.trim().to_owned())
            .filter(|name| !name.is_empty());
        if let Some(name) = output_name.as_deref() {
            if request.input_paths.len() > 1 {
                return Err(ConversionError::Other(
                    "a batch run names every output after its input; clear the custom name"
                        .to_owned(),
                ));
            }
            if name.chars().count() > 120 {
                return Err(ConversionError::Other(
                    "output names are limited to 120 characters".to_owned(),
                ));
            }
            if let Some(character) = invalid_name(name) {
                return Err(ConversionError::Other(format!(
                    "the output name contains '{character}', which Windows does not allow"
                )));
            }
            if name.ends_with('.') || name.ends_with(' ') {
                return Err(ConversionError::Other(
                    "the output name cannot end with a dot or a space".to_owned(),
                ));
            }
        }

        let now = crate::utils::time::now_ms();
        let run = WorkflowRun {
            id: Uuid::new_v4().to_string(),
            workflow_id: workflow.id.clone(),
            workflow_name: workflow.name.clone(),
            status: RunStatus::Running,
            total: request.input_paths.len(),
            completed: 0,
            failed: 0,
            total_steps: workflow.steps.len(),
            current_step: 0,
            current_input: None,
            active_job_id: None,
            outputs: Vec::new(),
            errors: Vec::new(),
            started_at_ms: now,
            finished_at_ms: None,
        };

        {
            let mut runs = self
                .runs
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            runs.insert(run.id.clone(), run.clone());
            if runs.len() > MAX_RUNS_KEPT {
                let mut finished: Vec<(u64, String)> = runs
                    .values()
                    .filter(|entry| entry.status != RunStatus::Running)
                    .map(|entry| (entry.started_at_ms, entry.id.clone()))
                    .collect();
                finished.sort();
                let excess = runs.len().saturating_sub(MAX_RUNS_KEPT);
                for (_, id) in finished.into_iter().take(excess) {
                    runs.remove(&id);
                }
            }
        }

        let service = Arc::clone(self);
        let run_id = run.id.clone();
        let inputs = request.input_paths.clone();
        let output_dir = PathBuf::from(output_dir);
        let thread_name = format!("uc-workflow-{}", &run_id[..8.min(run_id.len())]);
        if let Err(error) = std::thread::Builder::new()
            .name(thread_name)
            .spawn(move || {
                execute(
                    service.clone(),
                    run_id,
                    workflow,
                    inputs,
                    output_dir,
                    output_name,
                );
            })
        {
            self.lock_runs().remove(&run.id);
            return Err(ConversionError::Other(format!(
                "could not start the workflow runner: {error}"
            )));
        }
        Ok(run)
    }

    pub fn cancel(&self, run_id: &str) -> Result<(), ConversionError> {
        let status = {
            let runs = self.lock_runs();
            runs.get(run_id).map(|run| run.status)
        };
        match status {
            None => {
                return Err(ConversionError::Other(
                    "that workflow run is no longer known".to_owned(),
                ));
            }
            Some(RunStatus::Running) => {}
            Some(_) => {
                return Err(ConversionError::Other(
                    "that workflow run already finished".to_owned(),
                ));
            }
        }
        self.cancelled
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(run_id.to_owned());
        let active = {
            let runs = self.lock_runs();
            runs.get(run_id).and_then(|run| run.active_job_id.clone())
        };
        if let Some(job_id) = active {
            let _ = self.queue.cancel(&job_id);
        }
        Ok(())
    }

    pub fn clear_finished(&self) -> u64 {
        let mut removed_ids = Vec::new();
        {
            let mut runs = self.lock_runs();
            runs.retain(|id, run| {
                let keep = run.status == RunStatus::Running;
                if !keep {
                    removed_ids.push(id.clone());
                }
                keep
            });
        }
        if !removed_ids.is_empty() {
            let mut cancelled = self
                .cancelled
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            for id in &removed_ids {
                cancelled.remove(id);
            }
        }
        removed_ids.len() as u64
    }

    fn lock_runs(&self) -> std::sync::MutexGuard<'_, HashMap<String, WorkflowRun>> {
        self.runs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn update(&self, run_id: &str, mutate: impl FnOnce(&mut WorkflowRun)) {
        if let Some(run) = self.lock_runs().get_mut(run_id) {
            mutate(run);
        }
    }

    fn is_cancelled(&self, run_id: &str) -> bool {
        self.cancelled
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .contains(run_id)
    }

    fn finish(
        &self,
        run_id: &str,
        status: RunStatus,
        completed: usize,
        failed: usize,
        outputs: Vec<String>,
        errors: Vec<String>,
    ) {
        self.update(run_id, |run| {
            run.status = status;
            run.completed = completed;
            run.failed = failed;
            run.outputs = outputs;
            run.errors = errors;
            run.current_step = 0;
            run.current_input = None;
            run.active_job_id = None;
            run.finished_at_ms = Some(crate::utils::time::now_ms());
        });
        if let Ok(mut cancelled) = self.cancelled.lock() {
            cancelled.remove(run_id);
        }
    }
}

fn execute(
    service: Arc<WorkflowService>,
    run_id: String,
    workflow: WorkflowDefinition,
    inputs: Vec<String>,
    output_dir: PathBuf,
    output_name: Option<String>,
) {
    let intermediate_root = service
        .temp_dir
        .join("workflows")
        .join(format!("run-{run_id}"));
    let mut completed = 0_usize;
    let mut failed = 0_usize;
    let mut outputs: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut cancelled = false;

    'inputs: for input in &inputs {
        if service.is_cancelled(&run_id) {
            cancelled = true;
            break;
        }
        service.update(&run_id, |run| {
            run.current_input = Some(input.clone());
            run.current_step = 0;
            run.active_job_id = None;
        });

        let mut current = input.clone();
        for (index, step) in workflow.steps.iter().enumerate() {
            if service.is_cancelled(&run_id) {
                cancelled = true;
                break 'inputs;
            }
            let final_step = index + 1 == workflow.steps.len();
            let step_dir = if final_step {
                output_dir.clone()
            } else {
                intermediate_root.join(format!("step-{}", index + 1))
            };
            if !final_step && let Err(error) = std::fs::create_dir_all(&step_dir) {
                errors.push(format!(
                    "{}: could not prepare step {}: {error}",
                    file_label(input),
                    index + 1
                ));
                failed += 1;
                continue 'inputs;
            }

            let request = JobRequest {
                input_path: current.clone(),
                output_format: step.output_format,
                operation: step.operation.into(),
                settings: step.settings.clone(),
                output_directory: Some(step_dir.display().to_string()),
                extra_inputs: Vec::new(),
                output_name: if final_step {
                    output_name.clone()
                } else {
                    None
                },
                selected_entries: Vec::new(),
                password: None,
            };
            let Some(outcome) = service.queue.submit(vec![request]).pop() else {
                errors.push(format!(
                    "{}: the queue returned no result",
                    file_label(input)
                ));
                failed += 1;
                continue 'inputs;
            };
            if !outcome.accepted {
                let message = outcome
                    .error
                    .map(|error| error.message)
                    .or_else(|| {
                        outcome
                            .skipped_path
                            .map(|path| format!("left the existing output {path} alone"))
                    })
                    .unwrap_or_else(|| "the file was rejected".to_owned());
                errors.push(format!(
                    "{}: step {} was not queued: {message}",
                    file_label(input),
                    index + 1
                ));
                failed += 1;
                continue 'inputs;
            }
            let Some(job) = outcome.job else {
                errors.push(format!("{}: the queue returned no job", file_label(input)));
                failed += 1;
                continue 'inputs;
            };

            service.update(&run_id, |run| {
                run.current_step = index + 1;
                run.active_job_id = Some(job.id.clone());
            });

            match wait_for_job(&service, &job.id, &run_id) {
                WaitOutcome::Completed => {
                    current = job.output_path.clone();
                    if final_step {
                        outputs.push(job.output_path.clone());
                    }
                }
                WaitOutcome::Failed(message) => {
                    errors.push(format!(
                        "{}: step {} failed: {message}",
                        file_label(input),
                        index + 1
                    ));
                    failed += 1;
                    continue 'inputs;
                }
                WaitOutcome::Cancelled => {
                    cancelled = true;
                    break 'inputs;
                }
            }
        }

        completed += 1;
        service.update(&run_id, |run| {
            run.completed = completed;
            run.failed = failed;
            run.current_step = 0;
            run.current_input = None;
            run.active_job_id = None;
            run.outputs = outputs.clone();
            run.errors = errors.clone();
        });
    }

    let status = if cancelled {
        RunStatus::Cancelled
    } else if completed == 0 {
        RunStatus::Failed
    } else if failed > 0 {
        RunStatus::CompletedWithErrors
    } else {
        RunStatus::Completed
    };
    service.finish(&run_id, status, completed, failed, outputs, errors);
    // Only the run's own intermediate folder is removed; user files are untouched.
    if intermediate_root.exists()
        && let Err(error) = std::fs::remove_dir_all(&intermediate_root)
    {
        log::warn!(
            "could not remove workflow scratch {}: {error}",
            intermediate_root.display()
        );
    }
}

fn wait_for_job(service: &WorkflowService, job_id: &str, run_id: &str) -> WaitOutcome {
    let started = std::time::Instant::now();
    loop {
        if service.is_cancelled(run_id) {
            let _ = service.queue.cancel(job_id);
        }
        if let Some(job) = service
            .queue
            .snapshot()
            .into_iter()
            .find(|job| job.id == job_id)
        {
            match job.status {
                JobStatus::Completed => return WaitOutcome::Completed,
                JobStatus::Failed => {
                    return WaitOutcome::Failed(
                        job.error
                            .unwrap_or_else(|| "the conversion failed".to_owned()),
                    );
                }
                JobStatus::Cancelled => return WaitOutcome::Cancelled,
                JobStatus::Queued | JobStatus::Processing => {}
            }
        } else if let Ok(Some((status, error))) = service.database.job_outcome(job_id) {
            match status {
                JobStatus::Completed => return WaitOutcome::Completed,
                JobStatus::Failed => {
                    return WaitOutcome::Failed(
                        error.unwrap_or_else(|| "the conversion failed".to_owned()),
                    );
                }
                JobStatus::Cancelled => return WaitOutcome::Cancelled,
                JobStatus::Queued | JobStatus::Processing => {}
            }
        }

        if started.elapsed() > STEP_TIMEOUT {
            let _ = service.queue.cancel(job_id);
            return WaitOutcome::Failed(
                "the step did not finish within 60 minutes and was cancelled".to_owned(),
            );
        }
        std::thread::sleep(POLL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::manager::ConversionManager;
    use crate::core::settings::AppSettings;
    use crate::queue::events::{JobEmitter, JobEvent};

    struct Silent;

    impl JobEmitter for Silent {
        fn emit(&self, _event: JobEvent) {}
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("uc-wf-{name}-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch");
        dir
    }

    fn workflow() -> WorkflowDefinition {
        WorkflowDefinition {
            id: String::new(),
            name: "Poster pipeline".to_owned(),
            steps: vec![
                WorkflowStep {
                    operation: WorkflowOperation::Convert,
                    output_format: FormatId::Jpeg,
                    settings: serde_json::json!({ "quality": 85 }),
                },
                WorkflowStep {
                    operation: WorkflowOperation::Convert,
                    output_format: FormatId::Webp,
                    settings: serde_json::json!({ "quality": 70 }),
                },
            ],
        }
    }

    fn setup(
        name: &str,
    ) -> (
        PathBuf,
        Arc<Database>,
        Arc<ConversionQueue>,
        Arc<WorkflowService>,
    ) {
        let dir = scratch(name);
        let database = Arc::new(Database::open(&dir.join("db.sqlite")).unwrap());
        let queue = Arc::new(ConversionQueue::new(
            Arc::new(Silent),
            Arc::new(ConversionManager::new()),
            Arc::clone(&database),
            AppSettings::default(),
            dir.join("temp"),
        ));
        let service = WorkflowService::new(Arc::clone(&database), queue.clone(), dir.join("temp"));
        (dir, database, queue, service)
    }

    fn wait_for(service: &WorkflowService, run_id: &str) -> WorkflowRun {
        for _ in 0..400 {
            if let Some(run) = service.runs().into_iter().find(|run| run.id == run_id)
                && run.status != RunStatus::Running
            {
                return run;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("workflow run never finished");
    }

    #[test]
    fn validation_refuses_empty_names_too_many_steps_and_secrets() {
        let mut unnamed = workflow();
        unnamed.name = "  ".to_owned();
        assert!(validate_workflow(&mut unnamed).is_err());

        let mut too_many = workflow();
        too_many.steps = vec![WorkflowStep::default(); MAX_STEPS + 1];
        assert!(validate_workflow(&mut too_many).is_err());

        let mut ocr_bad = workflow();
        ocr_bad.steps[0].operation = WorkflowOperation::Ocr;
        ocr_bad.steps[0].output_format = FormatId::Jpeg;
        assert!(validate_workflow(&mut ocr_bad).is_err());

        let mut secret = workflow();
        secret.steps[0].settings = serde_json::json!({ "nested": { "password": "never-store" } });
        let error = validate_workflow(&mut secret).expect_err("secret must be refused");
        assert!(error.to_string().contains("password"));
        assert!(!error.to_string().contains("never-store"));

        let mut valid = workflow();
        validate_workflow(&mut valid).unwrap();
        assert!(!valid.id.is_empty());
    }

    #[test]
    fn requests_with_missing_files_or_batch_names_are_refused() {
        let (dir, _database, _queue, service) = setup("request");
        let mut stored = workflow();
        validate_workflow(&mut stored).unwrap();
        let output = dir.join("out");

        let missing = WorkflowRequest {
            workflow_id: stored.id.clone(),
            input_paths: vec![dir.join("nope.png").display().to_string()],
            output_dir: output.display().to_string(),
            output_name: None,
        };
        assert!(service.start(stored.clone(), missing).is_err());

        let input = dir.join("one.png");
        image::RgbaImage::new(4, 4).save(&input).unwrap();
        let named_batch = WorkflowRequest {
            workflow_id: stored.id.clone(),
            input_paths: vec![input.display().to_string(), input.display().to_string()],
            output_dir: output.display().to_string(),
            output_name: Some("same".to_owned()),
        };
        assert!(service.start(stored.clone(), named_batch).is_err());

        let path_name = WorkflowRequest {
            workflow_id: stored.id.clone(),
            input_paths: vec![input.display().to_string()],
            output_dir: output.display().to_string(),
            output_name: Some("bad/name".to_owned()),
        };
        assert!(service.start(stored, path_name).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// The real pipeline: two steps, real engines, a final WebP beside the user's
    /// folder, and no scratch folder left behind.
    #[test]
    fn a_two_step_workflow_produces_the_final_format_and_cleans_up() {
        let (dir, _database, _queue, service) = setup("e2e");
        let mut stored = workflow();
        validate_workflow(&mut stored).unwrap();
        let stored_id = stored.id.clone();

        let input = dir.join("poster.png");
        let mut image = image::RgbaImage::new(32, 24);
        for pixel in image.pixels_mut() {
            *pixel = image::Rgba([120, 30, 200, 255]);
        }
        image.save(&input).unwrap();

        let output_dir = dir.join("finished");
        let request = WorkflowRequest {
            workflow_id: stored_id.clone(),
            input_paths: vec![input.display().to_string()],
            output_dir: output_dir.display().to_string(),
            output_name: None,
        };
        let run = service.start(stored, request).unwrap();
        assert_eq!(run.status, RunStatus::Running);
        assert_eq!(run.total, 1);
        assert_eq!(run.total_steps, 2);

        let finished = wait_for(&service, &run.id);
        assert_eq!(
            finished.status,
            RunStatus::Completed,
            "{:?}",
            finished.errors
        );
        assert_eq!(finished.completed, 1);
        assert_eq!(finished.failed, 0);
        assert_eq!(finished.outputs.len(), 1);
        let final_path = Path::new(&finished.outputs[0]);
        assert!(final_path.is_file(), "the final file must exist");
        assert_eq!(
            crate::core::format::detect_from_path(final_path),
            FormatId::Webp
        );
        assert!(input.is_file(), "the original must never be deleted");
        assert!(
            !dir.join("temp").join("workflows").exists()
                || std::fs::read_dir(dir.join("temp").join("workflows"))
                    .map(|mut entries| entries.next().is_none())
                    .unwrap_or(true),
            "intermediate step folders must be cleaned up"
        );
        std::fs::remove_dir_all(&dir).ok();
    }
}
