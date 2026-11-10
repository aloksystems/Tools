use crate::core::job::{ConversionJob, JobStatus};
use crate::engines::ProgressSink;
use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Single channel name the frontend listens on. Keep in sync with
/// `src/hooks/useJobEvents.ts`.
pub const JOB_EVENT: &str = "conversion://job";

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum JobEvent {
    #[serde(rename_all = "camelCase")]
    Added { job: Box<ConversionJob> },
    #[serde(rename_all = "camelCase")]
    Progress {
        job_id: String,
        /// 0 – 100, matching the value stored on the job.
        progress: f64,
        stage: String,
    },
    #[serde(rename_all = "camelCase")]
    Status {
        job_id: String,
        status: JobStatus,
        error: Option<String>,
        error_kind: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    QueueStats { active: usize, queued: usize },
}

/// How a job reaches the UI. `TauriEmitter` in the running app; a recorder in
/// tests, which is what lets the whole queue be exercised without a window.
pub trait JobEmitter: Send + Sync {
    fn emit(&self, event: JobEvent);
}

pub struct TauriEmitter {
    app: AppHandle,
}

impl TauriEmitter {
    pub fn new(app: &AppHandle) -> Self {
        TauriEmitter { app: app.clone() }
    }
}

impl JobEmitter for TauriEmitter {
    fn emit(&self, event: JobEvent) {
        // Emission can legitimately fail while the window is closing; a conversion
        // must not be marked failed because a UI event could not be posted.
        let _ = self.app.emit(JOB_EVENT, &event);
    }
}

/// Progress updates arrive far faster than a UI needs them. 120 ms keeps the
/// progress bar smooth without flooding the IPC channel during a large batch.
pub struct EventSink {
    emitter: Arc<dyn JobEmitter>,
    job_id: String,
    last_sent: MutexInstant,
}

#[derive(Default)]
pub struct MutexInstant(std::sync::Mutex<Option<Instant>>);

impl MutexInstant {
    /// True for the first report of a job, then at most once per `minimum`.
    fn should_send(&self, minimum: Duration) -> bool {
        let mut guard = match self.0.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        match *guard {
            Some(last) if last.elapsed() < minimum => false,
            _ => {
                *guard = Some(Instant::now());
                true
            }
        }
    }
}

impl EventSink {
    pub fn new(emitter: &Arc<dyn JobEmitter>, job_id: &str) -> Self {
        EventSink {
            emitter: Arc::clone(emitter),
            job_id: job_id.to_owned(),
            last_sent: MutexInstant::default(),
        }
    }

    /// Always emitted, regardless of throttling — terminal states must not drop.
    pub fn status(&self, status: JobStatus, error: Option<String>, error_kind: Option<String>) {
        self.emitter.emit(JobEvent::Status {
            job_id: self.job_id.clone(),
            status,
            error,
            error_kind,
        });
    }
}

impl ProgressSink for EventSink {
    fn report(&self, fraction: f64, stage: &str) {
        let clamped = fraction.clamp(0.0, 1.0);
        if !self.last_sent.should_send(Duration::from_millis(120)) {
            return;
        }
        self.emitter.emit(JobEvent::Progress {
            job_id: self.job_id.clone(),
            progress: clamped * 100.0,
            stage: stage.to_owned(),
        });
    }
}
