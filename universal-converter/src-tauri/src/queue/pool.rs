use crate::core::job::{ConversionJob, JobRequest, JobStatus};
use crate::core::manager::{ConversionManager, PlanOutcome};
use crate::core::settings::AppSettings;
use crate::database::Database;
use crate::engines::{CancellationToken, ConversionEngine, EngineContext};
use crate::error::{AppError, ConversionError};
use crate::queue::events::{EventSink, JobEmitter, JobEvent};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Condvar, Mutex, RwLock};

/// How many finished rows the UI keeps in memory. History lives in SQLite.
const MAX_JOBS_KEPT: usize = 500;

/// More threads than permits, so raising the concurrency limit in Settings takes
/// effect without a restart. Extra workers simply block on the gate.
const WORKER_THREADS: usize = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitOutcome {
    pub input_path: String,
    pub accepted: bool,
    pub job: Option<ConversionJob>,
    /// Populated when the file was rejected before it ever reached the queue.
    pub error: Option<AppError>,
    /// Set when an existing output was left alone per the collision policy.
    pub skipped_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueStats {
    pub active: usize,
    pub queued: usize,
    pub limit: usize,
}

/// Counting semaphore. Blocking is deliberate: a queued job should wait for a
/// permit rather than be dropped or run out of memory.
struct Gate {
    running: Mutex<usize>,
    available: Condvar,
    limit: AtomicUsize,
}

struct Permit<'a>(&'a Gate);

impl Gate {
    fn new(limit: usize) -> Self {
        Gate {
            running: Mutex::new(0),
            available: Condvar::new(),
            limit: AtomicUsize::new(limit.max(1)),
        }
    }

    fn set_limit(&self, limit: usize) {
        self.limit.store(limit.max(1), Ordering::SeqCst);
        // Wake blocked workers so they re-evaluate against the new ceiling.
        self.available.notify_all();
    }

    fn acquire(&self) -> Permit<'_> {
        let mut running = match self.running.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        loop {
            let limit = self.limit.load(Ordering::SeqCst);
            if *running < limit {
                *running += 1;
                return Permit(self);
            }
            running = match self.available.wait(running) {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
        }
    }
}

impl Drop for Permit<'_> {
    fn drop(&mut self) {
        let mut running = match self.0.running.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        *running = running.saturating_sub(1);
        self.0.available.notify_one();
    }
}

struct Shared {
    emitter: Arc<dyn JobEmitter>,
    manager: Arc<ConversionManager>,
    database: Arc<Database>,
    settings: RwLock<AppSettings>,
    jobs: Mutex<Vec<ConversionJob>>,
    tokens: Mutex<HashMap<String, CancellationToken>>,
    /// In-memory only. Removed when the job finishes, is cancelled or is
    /// dropped; never copied into the job or written to history.
    secrets: Mutex<HashMap<String, String>>,
    standard: Gate,
    heavy: Gate,
    temp_dir: PathBuf,
    sender: Sender<String>,
    receiver: Mutex<Receiver<String>>,
}

/// Worker-pool queue. Bounded on purpose: unlimited parallelism turns a 200-file
/// batch into an out-of-memory crash on a small machine.
pub struct ConversionQueue {
    shared: Arc<Shared>,
}

impl ConversionQueue {
    pub fn new(
        emitter: Arc<dyn JobEmitter>,
        manager: Arc<ConversionManager>,
        database: Arc<Database>,
        settings: AppSettings,
        temp_dir: PathBuf,
    ) -> Self {
        let (sender, receiver) = std::sync::mpsc::channel();
        let limit = settings.concurrent_jobs.max(1);

        let shared = Arc::new(Shared {
            emitter,
            manager,
            database,
            settings: RwLock::new(settings),
            jobs: Mutex::new(Vec::new()),
            tokens: Mutex::new(HashMap::new()),
            secrets: Mutex::new(HashMap::new()),
            standard: Gate::new(limit),
            // Half the slots, rounded up, so heavy jobs cannot crowd out everything else.
            heavy: Gate::new(limit.div_ceil(2)),
            temp_dir,
            sender,
            receiver: Mutex::new(receiver),
        });

        for index in 0..WORKER_THREADS {
            let worker_shared = Arc::clone(&shared);
            let name = format!("uc-worker-{index}");
            let spawned = std::thread::Builder::new()
                .name(name)
                .spawn(move || worker_loop(worker_shared));
            match spawned {
                // Dropping the handle detaches the thread: workers live until the
                // channel closes, which is when the process exits.
                Ok(_handle) => {}
                Err(error) => {
                    log::error!("could not start conversion worker {index}: {error}");
                }
            }
        }

        ConversionQueue { shared }
    }

    pub fn snapshot(&self) -> Vec<ConversionJob> {
        match self.shared.jobs.lock() {
            Ok(jobs) => jobs.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }

    pub fn stats(&self) -> QueueStats {
        stats_of(&self.shared)
    }

    pub fn settings(&self) -> AppSettings {
        current_settings(&self.shared)
    }

    /// Runs once at startup. Any job row left behind by a process that stopped
    /// without settling it becomes a visible failed job with an honest message;
    /// completed outputs are never touched and nothing is restarted silently.
    pub fn recover_interrupted(&self) -> usize {
        let pending = match self.shared.database.take_pending_jobs() {
            Ok(jobs) => jobs,
            Err(error) => {
                log::error!("could not read interrupted jobs: {error}");
                return 0;
            }
        };
        if pending.is_empty() {
            return 0;
        }

        let mut recovered = Vec::with_capacity(pending.len());
        for mut job in pending {
            job.mark_interrupted();
            self.write_history(&job);
            log::warn!(
                "marked interrupted job {} ({}) as failed",
                job.id,
                job.input_name
            );
            recovered.push(job);
        }

        {
            let mut jobs = lock(&self.shared.jobs);
            for job in recovered.iter().rev() {
                jobs.insert(0, job.clone());
            }
            if jobs.len() > MAX_JOBS_KEPT {
                jobs.truncate(MAX_JOBS_KEPT);
            }
        }
        self.emit_stats();
        recovered.len()
    }

    /// Applies a new concurrency ceiling to both gates immediately.
    pub fn apply_settings(&self, settings: AppSettings) {
        let limit = settings.concurrent_jobs.max(1);
        {
            let mut guard = match self.shared.settings.write() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            *guard = settings;
        }
        self.shared.standard.set_limit(limit);
        self.shared.heavy.set_limit(limit.div_ceil(2));
    }

    pub fn submit(&self, requests: Vec<JobRequest>) -> Vec<SubmitOutcome> {
        let settings = self.settings();
        let mut outcomes = Vec::with_capacity(requests.len());
        let mut accepted: Vec<(ConversionJob, Option<String>)> = Vec::new();

        for request in requests {
            let input_path = request.input_path.clone();
            match self.shared.manager.plan(&request, &settings) {
                Ok(PlanOutcome::Ready { job, secret }) => accepted.push((*job, secret)),
                Ok(PlanOutcome::Skipped(path)) => outcomes.push(SubmitOutcome {
                    input_path,
                    accepted: false,
                    job: None,
                    error: None,
                    skipped_path: Some(path.display().to_string()),
                }),
                Err(error) => outcomes.push(SubmitOutcome {
                    input_path,
                    accepted: false,
                    job: None,
                    error: Some(error.into()),
                    skipped_path: None,
                }),
            }
        }

        if !accepted.is_empty() {
            // The recovery row exists before a worker can see the id. If the
            // process dies at any point after this, the next startup can say so.
            for (job, _) in &accepted {
                if let Err(error) = self.shared.database.record_pending_job(job) {
                    log::warn!("could not persist pending job {}: {error}", job.id);
                }
            }
            {
                let mut jobs = lock(&self.shared.jobs);
                for (job, _) in accepted.iter().rev() {
                    jobs.insert(0, job.clone());
                }
                if jobs.len() > MAX_JOBS_KEPT {
                    jobs.truncate(MAX_JOBS_KEPT);
                }
            }
            {
                let mut tokens = lock(&self.shared.tokens);
                for (job, _) in accepted.iter() {
                    tokens.insert(job.id.clone(), CancellationToken::new());
                }
            }
            {
                // Secrets must be in place before a worker can receive the id.
                let mut secrets = lock(&self.shared.secrets);
                for (job, secret) in &accepted {
                    if let Some(secret) = secret {
                        secrets.insert(job.id.clone(), secret.clone());
                    }
                }
            }
            for (job, _) in accepted.iter() {
                self.shared.emitter.emit(JobEvent::Added {
                    job: Box::new(job.clone()),
                });
                let _ = self.shared.sender.send(job.id.clone());
            }
            self.emit_stats();
        }

        outcomes.extend(accepted.into_iter().map(|(job, _)| SubmitOutcome {
            input_path: job.input_path.clone(),
            accepted: true,
            skipped_path: None,
            error: None,
            job: Some(job),
        }));
        outcomes
    }

    pub fn cancel(&self, job_id: &str) -> Result<(), AppError> {
        let mut jobs = lock(&self.shared.jobs);
        let index = jobs
            .iter()
            .position(|job| job.id == job_id)
            .ok_or_else(|| {
                AppError::new(
                    "notFound",
                    format!("no job with id {job_id} is in the queue"),
                )
            })?;

        if jobs[index].status.is_finished() {
            return Err(AppError::new(
                "alreadyFinished",
                format!(
                    "{} already finished as {:?}",
                    jobs[index].input_name, jobs[index].status
                ),
            ));
        }

        let token = lock(&self.shared.tokens).remove(job_id);
        if let Some(token) = token {
            token.cancel();
        }
        lock(&self.shared.secrets).remove(job_id);

        let job = &mut jobs[index];
        // A running job keeps its status until the engine notices the token;
        // a job still in the queue is settled here, because no worker will pick it up.
        if job.status == JobStatus::Queued {
            job.mark_cancelled();
            self.shared.emitter.emit(JobEvent::Status {
                job_id: job_id.to_owned(),
                status: JobStatus::Cancelled,
                error: None,
                error_kind: None,
            });
            self.write_history(job);
            if let Err(error) = self.shared.database.clear_pending_job(job_id) {
                log::warn!("could not clear pending job {job_id}: {error}");
            }
        }
        drop(jobs);
        self.emit_stats();
        Ok(())
    }

    pub fn retry(&self, job_id: &str) -> Result<(), AppError> {
        let mut jobs = lock(&self.shared.jobs);
        let index = jobs
            .iter()
            .position(|job| job.id == job_id)
            .ok_or_else(|| {
                AppError::new(
                    "notFound",
                    format!("no job with id {job_id} is in the queue"),
                )
            })?;

        let job = &mut jobs[index];
        if !job.status.is_finished() {
            return Err(AppError::new(
                "stillRunning",
                format!("{} is not finished yet", job.input_name),
            ));
        }

        job.status = JobStatus::Queued;
        job.progress = 0.0;
        job.error = None;
        job.error_kind = None;
        job.finished_at_ms = None;
        job.started_at_ms = None;
        job.output_bytes = None;
        let id = job.id.clone();
        if let Err(error) = self.shared.database.record_pending_job(job) {
            log::warn!("could not persist retried job {id}: {error}");
        }

        lock(&self.shared.tokens).insert(id.clone(), CancellationToken::new());
        self.shared.emitter.emit(JobEvent::Added {
            job: Box::new(job.clone()),
        });
        drop(jobs);

        self.shared
            .sender
            .send(id)
            .map_err(|_| AppError::new("queueClosed", "the conversion queue has shut down"))?;
        self.emit_stats();
        Ok(())
    }

    pub fn clear_finished(&self) {
        {
            let mut jobs = lock(&self.shared.jobs);
            jobs.retain(|job| !job.status.is_finished());
        }
        self.emit_stats();
    }

    fn write_history(&self, job: &ConversionJob) {
        if let Err(error) = self.shared.database.record_job(job) {
            log::warn!("could not record {} in history: {error}", job.input_name);
        }
    }

    fn emit_stats(&self) {
        emit_stats(&self.shared);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn current_settings(shared: &Shared) -> AppSettings {
    match shared.settings.read() {
        Ok(guard) => guard.clone(),
        Err(poisoned) => poisoned.into_inner().clone(),
    }
}

fn worker_loop(shared: Arc<Shared>) {
    loop {
        // One worker waits on the channel at a time; the others block on the
        // mutex behind it. Dispatch is serial, execution is parallel.
        let job_id = {
            let receiver = lock(&shared.receiver);
            match receiver.recv() {
                Ok(id) => id,
                Err(_) => return,
            }
        };
        run_job(&shared, &job_id);
    }
}

/// A worker's whole life for one job: take a permit, re-check the job was not
/// cancelled while waiting, convert, then record the outcome.
fn run_job(shared: &Arc<Shared>, job_id: &str) {
    let Some((engine, planned)) = job_engine(shared, job_id) else {
        return;
    };

    // Video encodes get the tighter gate so several 4K transcodes cannot stack
    // up; audio extraction and image work stay on the standard gate.
    let _permit = if engine.is_heavy_job(&planned) {
        shared.heavy.acquire()
    } else {
        shared.standard.acquire()
    };

    let Some(job) = claim(shared, job_id) else {
        return;
    };

    // The token was inserted at submit; a fresh one is the fallback so a retried
    // job can never end up without a cancellation handle.
    let token = lock(&shared.tokens)
        .get(&job.id)
        .cloned()
        .unwrap_or_default();

    let sink = EventSink::new(&shared.emitter, &job.id);
    sink.status(JobStatus::Processing, None, None);

    let secret = lock(&shared.secrets).get(&job.id).cloned();
    let settings = current_settings(shared);
    let context = EngineContext {
        job: &job,
        temp_dir: &shared.temp_dir,
        progress: &sink,
        cancel: &token,
        settings: &settings,
        secret: secret.as_deref(),
    };
    let result = engine.convert(&context);

    finish(shared, &job.id, &sink, result);
}

fn job_engine(
    shared: &Arc<Shared>,
    job_id: &str,
) -> Option<(Arc<dyn ConversionEngine>, ConversionJob)> {
    let (engine_id, job) = {
        let jobs = lock(&shared.jobs);
        let job = jobs.iter().find(|job| job.id == job_id)?;
        (job.engine, job.clone())
    };
    match shared.manager.engine(engine_id) {
        Some(engine) => Some((engine, job)),
        None => {
            let error = ConversionError::EngineUnavailable {
                engine: engine_id.label().to_owned(),
                reason: "it is not registered with the conversion manager".to_owned(),
            };
            let message = error.to_string();
            let snapshot = {
                let mut jobs = lock(&shared.jobs);
                let job = jobs.iter_mut().find(|job| job.id == job_id)?;
                job.mark_failed(&error);
                job.clone()
            };
            if let Err(record_error) = shared.database.record_job(&snapshot) {
                log::warn!(
                    "could not record {} in history: {record_error}",
                    snapshot.input_name
                );
            }
            if let Err(clear_error) = shared.database.clear_pending_job(job_id) {
                log::warn!("could not clear pending job {job_id}: {clear_error}");
            }
            shared.emitter.emit(JobEvent::Status {
                job_id: job_id.to_owned(),
                status: JobStatus::Failed,
                error: Some(message),
                error_kind: Some("engineUnavailable".to_owned()),
            });
            None
        }
    }
}

/// Marks the job running, returning None when it was cancelled while queued.
fn claim(shared: &Arc<Shared>, job_id: &str) -> Option<ConversionJob> {
    let mut jobs = lock(&shared.jobs);
    let job = jobs.iter_mut().find(|job| job.id == job_id)?;
    if job.status != JobStatus::Queued {
        return None;
    }
    job.mark_started();
    Some(job.clone())
}

fn finish(
    shared: &Arc<Shared>,
    job_id: &str,
    sink: &EventSink,
    result: Result<u64, ConversionError>,
) {
    let mut jobs = lock(&shared.jobs);
    let Some(job) = jobs.iter_mut().find(|job| job.id == job_id) else {
        return;
    };

    match result {
        Ok(output_bytes) => {
            job.mark_completed(output_bytes);
            sink.status(JobStatus::Completed, None, None);
        }
        Err(ConversionError::Cancelled) => {
            job.mark_cancelled();
            sink.status(JobStatus::Cancelled, None, None);
        }
        Err(error) => {
            let kind = error.kind().to_owned();
            let message = error.to_string();
            job.mark_failed(&error);
            sink.status(JobStatus::Failed, Some(message), Some(kind));
        }
    }

    let snapshot = job.clone();
    drop(jobs);
    let _ = lock(&shared.tokens).remove(job_id);
    // The password dies with the job, before history is written.
    let _ = lock(&shared.secrets).remove(job_id);
    if let Err(error) = shared.database.record_job(&snapshot) {
        log::warn!(
            "could not record {} in history: {error}",
            snapshot.input_name
        );
    }
    if let Err(error) = shared.database.clear_pending_job(job_id) {
        log::warn!("could not clear pending job {job_id}: {error}");
    }
    emit_stats(shared);
}

fn stats_of(shared: &Shared) -> QueueStats {
    let jobs = lock(&shared.jobs);
    QueueStats {
        active: jobs
            .iter()
            .filter(|job| job.status == JobStatus::Processing)
            .count(),
        queued: jobs
            .iter()
            .filter(|job| job.status == JobStatus::Queued)
            .count(),
        limit: current_settings(shared).concurrent_jobs.max(1),
    }
}

fn emit_stats(shared: &Arc<Shared>) {
    let stats = stats_of(shared);
    shared.emitter.emit(JobEvent::QueueStats {
        active: stats.active,
        queued: stats.queued,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::format::FormatId;
    use crate::core::job::JobRequest;
    use crate::core::manager::ConversionManager;
    use crate::core::settings::{AppSettings, OutputDirectoryMode};
    use crate::database::Database;
    use std::path::Path;
    use std::time::Duration;

    /// Stands in for the window: records events instead of posting them.
    #[derive(Default)]
    struct Recorder(Mutex<Vec<JobEvent>>);

    impl JobEmitter for Recorder {
        fn emit(&self, event: JobEvent) {
            lock(&self.0).push(event);
        }
    }

    struct Harness {
        queue: ConversionQueue,
        database: Arc<Database>,
        events: Arc<Recorder>,
    }

    fn harness(name: &str) -> Harness {
        let dir = std::env::temp_dir().join(format!("uc-queue-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let events = Arc::new(Recorder::default());
        let emitter: Arc<dyn JobEmitter> = events.clone() as Arc<dyn JobEmitter>;
        let database = Arc::new(Database::open(&dir.join("queue.db")).unwrap());
        let queue = ConversionQueue::new(
            emitter,
            Arc::new(ConversionManager::new()),
            Arc::clone(&database),
            AppSettings {
                concurrent_jobs: 2,
                output_directory_mode: OutputDirectoryMode::Source,
                ..AppSettings::default()
            },
            dir.join("temp"),
        );
        Harness {
            queue,
            database,
            events,
        }
    }

    /// A real PNG on disk, written by the real encoder.
    fn write_png(dir: &Path, name: &str) -> PathBuf {
        use image::{DynamicImage, ImageBuffer, Rgba};
        let path = dir.join(name);
        let mut buffer: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(6, 6);
        for pixel in buffer.pixels_mut() {
            *pixel = Rgba([200, 30, 30, 255]);
        }
        DynamicImage::ImageRgba8(buffer).save(&path).unwrap();
        path
    }

    fn wait_for_finish(queue: &ConversionQueue, id: &str) -> ConversionJob {
        for _ in 0..400 {
            let found = queue.snapshot().into_iter().find(|job| job.id == id);
            if let Some(job) = found.filter(|job| job.status.is_finished()) {
                return job;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!("job {id} never reached a terminal state");
    }

    /// The whole pipeline: plan, queue, worker, engine, history, events.
    #[test]
    fn queue_runs_a_real_conversion_end_to_end() {
        let h = harness("e2e");
        let source = write_png(
            std::env::temp_dir().join("uc-queue-e2e").as_path(),
            "photo.png",
        );

        let outcomes = h.queue.submit(vec![JobRequest::for_test(
            &[&source.display().to_string()],
            FormatId::Jpeg,
            serde_json::json!({ "quality": 82 }),
        )]);

        assert_eq!(outcomes.len(), 1);
        assert!(
            outcomes[0].accepted,
            "the planner rejected a job it should run: {:?}",
            outcomes[0].error
        );
        let id = outcomes[0].job.as_ref().unwrap().id.clone();

        let finished = wait_for_finish(&h.queue, &id);
        assert_eq!(
            finished.status,
            JobStatus::Completed,
            "{:?}",
            finished.error
        );
        assert!(
            Path::new(&finished.output_path).is_file(),
            "output must exist"
        );
        assert!(
            finished.output_bytes.unwrap_or(0) > 0,
            "output must not be empty"
        );
        assert_eq!(
            crate::core::format::detect_from_path(Path::new(&finished.output_path)),
            FormatId::Jpeg,
            "the bytes written must really be a JPEG"
        );
        assert_eq!(
            source.extension().and_then(|e| e.to_str()),
            Some("png"),
            "the source file must still be the PNG we started with"
        );

        let history = h.database.history(10, 0).unwrap();
        assert_eq!(history.len(), 1, "a finished job must be recorded once");
        assert_eq!(history[0].status, JobStatus::Completed);

        let recorded = lock(&h.events.0);
        assert!(
            matches!(recorded.first(), Some(JobEvent::Added { .. })),
            "the UI must be told about the job before it runs"
        );
        assert!(
            recorded.iter().any(|event| matches!(
                event,
                JobEvent::Status {
                    status: JobStatus::Completed,
                    ..
                }
            )),
            "a terminal Completed status event must reach the UI"
        );
        assert!(
            recorded
                .iter()
                .any(|event| matches!(event, JobEvent::Progress { .. })),
            "progress must be reported while converting"
        );
    }

    #[test]
    fn cancelling_an_unknown_job_reports_instead_of_panicking() {
        let h = harness("cancel");
        let error = h
            .queue
            .cancel("not-a-real-job")
            .expect_err("an unknown id must be refused");
        assert_eq!(error.kind, "notFound");
    }

    #[test]
    fn jobs_left_pending_by_a_crash_become_visible_interrupted_failures() {
        let h = harness("recovery");
        let source = write_png(
            std::env::temp_dir().join("uc-queue-recovery").as_path(),
            "crash.png",
        );
        let request = JobRequest::for_test(
            &[&source.display().to_string()],
            FormatId::Jpeg,
            serde_json::json!({}),
        );
        let mut job = ConversionJob::new(
            &request,
            FormatId::Png,
            crate::engines::EngineId::Image,
            source.with_extension("jpg"),
            128,
        );
        job.id = "interrupted-1".to_owned();
        h.database.record_pending_job(&job).unwrap();

        assert_eq!(h.queue.recover_interrupted(), 1);
        let recovered = h
            .queue
            .snapshot()
            .into_iter()
            .find(|job| job.id == "interrupted-1")
            .expect("the recovered job must be visible for review and retry");
        assert_eq!(recovered.status, JobStatus::Failed);
        assert_eq!(recovered.error_kind.as_deref(), Some("interrupted"));
        assert!(recovered.error.unwrap().contains("do not use"));

        let history = h.database.history(10, 0).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].status, JobStatus::Failed);
        assert!(h.database.take_pending_jobs().unwrap().is_empty());
    }
}
