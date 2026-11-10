use crate::core::format::{self, FormatId};
use crate::core::job::{JobOperation, JobRequest};
use crate::core::presets::settings_have_secret;
use crate::database::Database;
use crate::engines::ocr;
use crate::error::ConversionError;
use crate::queue::pool::ConversionQueue;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};
use uuid::Uuid;

/// A file must be quiet this long before it is submitted, so a copy in progress
/// is never handed to an engine half-written.
const SETTLE: Duration = Duration::from_millis(1500);
const TICK: Duration = Duration::from_millis(250);
/// While paused, newly arrived paths wait this long for a resume.
const PENDING_LIFETIME: Duration = Duration::from_secs(10 * 60);
/// Re-processing the same unchanged file is suppressed for this long.
const DEDUPE_LIFETIME: Duration = Duration::from_secs(60 * 60);
const MAX_PENDING: usize = 10_000;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AutomationMode {
    #[default]
    Convert,
    Ocr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AutomationRule {
    pub id: String,
    pub name: String,
    pub input_dir: String,
    pub output_dir: String,
    /// Empty means every format the converter recognises.
    pub input_formats: Vec<FormatId>,
    pub output_format: FormatId,
    pub mode: AutomationMode,
    pub settings: serde_json::Value,
    pub enabled: bool,
}

impl Default for AutomationRule {
    fn default() -> Self {
        AutomationRule {
            id: String::new(),
            name: String::new(),
            input_dir: String::new(),
            output_dir: String::new(),
            input_formats: Vec::new(),
            output_format: FormatId::Unknown,
            mode: AutomationMode::Convert,
            settings: serde_json::Value::Null,
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationStatus {
    pub paused: bool,
    pub watching: usize,
    pub enabled_rules: usize,
    pub total_rules: usize,
}

fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// `notify` reports Windows paths in verbatim form (`\\?\C:\...`). Left alone,
/// history rows and "show in folder" would receive a path no other part of the
/// app produces, so the prefix is removed as soon as an event arrives.
fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path.to_path_buf()
}

/// Both paths are canonicalised first, so Windows casing differences do not
/// turn a nested folder into a false negative.
fn within(path: &Path, root: &Path) -> bool {
    if path.as_os_str().is_empty() || root.as_os_str().is_empty() {
        return false;
    }
    canonical(path).starts_with(canonical(root))
}

fn overlaps(first: &Path, second: &Path) -> bool {
    let first = canonical(first);
    let second = canonical(second);
    first == second || first.starts_with(&second) || second.starts_with(&first)
}

pub fn is_ignored_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if lower.is_empty() || lower.starts_with('~') || lower.starts_with('.') {
        return true;
    }
    if matches!(lower.as_str(), "thumbs.db" | "desktop.ini") {
        return true;
    }
    [
        ".tmp",
        ".temp",
        ".part",
        ".partial",
        ".download",
        ".crdownload",
        ".filepart",
        ".aria2",
        ".swp",
        ".lock",
    ]
    .iter()
    .any(|suffix| lower.ends_with(suffix))
}

fn format_matches(rule: &AutomationRule, detected: FormatId) -> bool {
    rule.input_formats.is_empty() || rule.input_formats.contains(&detected)
}

fn mode_accepts(mode: AutomationMode, detected: FormatId) -> bool {
    match mode {
        AutomationMode::Convert => true,
        AutomationMode::Ocr => ocr::is_ocr_input(detected),
    }
}

/// Validates a rule before it is stored, and normalises its fields. The output
/// folder is created here so the watcher never has to guess where it is.
pub fn validate_rule(rule: &mut AutomationRule) -> Result<(), ConversionError> {
    rule.name = rule.name.trim().to_owned();
    rule.input_dir = rule.input_dir.trim().to_owned();
    rule.output_dir = rule.output_dir.trim().to_owned();
    if rule.id.trim().is_empty() {
        rule.id = Uuid::new_v4().to_string();
    }
    if rule.name.is_empty() {
        return Err(ConversionError::Other(
            "give the automation rule a name".to_owned(),
        ));
    }
    if rule.name.chars().count() > 80 {
        return Err(ConversionError::Other(
            "rule names are limited to 80 characters".to_owned(),
        ));
    }
    if rule.input_dir.is_empty() || rule.output_dir.is_empty() {
        return Err(ConversionError::Other(
            "choose both a watched folder and an output folder".to_owned(),
        ));
    }

    let input = canonical(Path::new(&rule.input_dir));
    if !input.is_dir() {
        return Err(ConversionError::Other(format!(
            "the watched folder {} does not exist",
            rule.input_dir
        )));
    }
    std::fs::create_dir_all(&rule.output_dir).map_err(|error| {
        ConversionError::Other(format!(
            "could not create the output folder {}: {error}",
            rule.output_dir
        ))
    })?;
    let output = canonical(Path::new(&rule.output_dir));

    // Any nesting would let the watcher see its own output and loop. Refusing
    // the rule is clearer and safer than filtering paths after the fact.
    if overlaps(&input, &output) {
        return Err(ConversionError::Other(
            "the watched folder and the output folder must be separate and must not contain each other; otherwise converted files would trigger the watcher again"
                .to_owned(),
        ));
    }

    rule.input_formats.sort();
    rule.input_formats.dedup();
    rule.input_formats
        .retain(|format| *format != FormatId::Unknown);

    if rule.output_format == FormatId::Unknown {
        return Err(ConversionError::Other(
            "choose an output format for this rule".to_owned(),
        ));
    }
    if rule.mode == AutomationMode::Ocr && !ocr::OCR_OUTPUTS.contains(&rule.output_format) {
        return Err(ConversionError::Other(
            "OCR rules can write plain text or a searchable PDF".to_owned(),
        ));
    }

    if !rule.settings.is_object() && !rule.settings.is_null() {
        return Err(ConversionError::Other(
            "rule settings must be a JSON object".to_owned(),
        ));
    }
    if let Some(path) = settings_have_secret(&rule.settings) {
        return Err(ConversionError::Other(format!(
            "rule settings contain a secret-looking key ({path}); passwords cannot be stored in an automation rule"
        )));
    }
    Ok(())
}

#[derive(Default)]
struct Controls {
    sender: Mutex<Option<Sender<Control>>>,
}

pub struct AutomationService {
    database: Arc<Database>,
    queue: Arc<ConversionQueue>,
    paused: AtomicBool,
    watching: AtomicUsize,
    controls: Controls,
}

enum Control {
    Reload,
    Shutdown,
}

impl AutomationService {
    pub fn start(database: Arc<Database>, queue: Arc<ConversionQueue>) -> Arc<Self> {
        let paused = database.automation_paused().unwrap_or_else(|error| {
            log::warn!("could not read the automation pause state: {error}");
            false
        });
        let (sender, receiver) = channel();
        let service = Arc::new(AutomationService {
            database,
            queue,
            paused: AtomicBool::new(paused),
            watching: AtomicUsize::new(0),
            controls: Controls {
                sender: Mutex::new(Some(sender)),
            },
        });
        let thread_service = Arc::clone(&service);
        match std::thread::Builder::new()
            .name("uc-automation".to_owned())
            .spawn(move || watcher_loop(thread_service, receiver))
        {
            Ok(_) => {}
            Err(error) => log::error!("could not start the folder watcher: {error}"),
        }
        service
    }

    pub fn paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    pub fn status(&self) -> AutomationStatus {
        match self.database.list_automation_rules() {
            Ok(rules) => AutomationStatus {
                paused: self.paused(),
                watching: self.watching.load(Ordering::SeqCst),
                enabled_rules: rules.iter().filter(|rule| rule.enabled).count(),
                total_rules: rules.len(),
            },
            Err(error) => {
                log::warn!("could not read automation rules: {error}");
                AutomationStatus {
                    paused: self.paused(),
                    watching: self.watching.load(Ordering::SeqCst),
                    enabled_rules: 0,
                    total_rules: 0,
                }
            }
        }
    }

    pub fn set_paused(&self, paused: bool) -> Result<(), ConversionError> {
        self.database.set_automation_paused(paused)?;
        self.paused.store(paused, Ordering::SeqCst);
        let _ = self.database.append_automation_log(
            None,
            "info",
            if paused {
                "automation paused; new files wait until it is resumed"
            } else {
                "automation resumed"
            },
            None,
        );
        Ok(())
    }

    pub fn reload(&self) {
        if let Ok(guard) = self.controls.sender.lock()
            && let Some(sender) = guard.as_ref()
        {
            let _ = sender.send(Control::Reload);
        }
    }

    /// Stops the watcher thread. Used when the app shuts down and by tests.
    pub fn stop(&self) {
        if let Ok(mut guard) = self.controls.sender.lock()
            && let Some(sender) = guard.take()
        {
            let _ = sender.send(Control::Shutdown);
        }
    }
}

fn watcher_loop(service: Arc<AutomationService>, control: Receiver<Control>) {
    let (events_tx, events_rx) = channel();
    let mut watcher: Option<RecommendedWatcher> = None;
    let mut pending: HashMap<PathBuf, Instant> = HashMap::new();
    let mut dedupe: HashMap<(PathBuf, String), (u64, u64, Instant)> = HashMap::new();
    let mut reload = true;

    loop {
        if reload {
            drop(watcher.take());
            pending.clear();
            match build_watcher(&service.database, events_tx.clone()) {
                Ok((built, watching)) => {
                    watcher = Some(built);
                    service.watching.store(watching, Ordering::SeqCst);
                }
                Err(error) => {
                    service.watching.store(0, Ordering::SeqCst);
                    log::error!("folder watcher could not start: {error}");
                }
            }
            reload = false;
        }

        match control.recv_timeout(TICK) {
            Ok(Control::Reload) => {
                reload = true;
                continue;
            }
            Ok(Control::Shutdown) => return,
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }

        while let Ok(event) = events_rx.try_recv() {
            match event {
                Ok(event) => {
                    if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                        for path in event.paths {
                            if pending.len() < MAX_PENDING {
                                pending.insert(strip_verbatim_prefix(&path), Instant::now());
                            }
                        }
                    }
                }
                Err(error) => log::warn!("folder watcher reported an error: {error}"),
            }
        }

        let now = Instant::now();
        pending.retain(|_, seen| now.duration_since(*seen) < PENDING_LIFETIME);
        dedupe.retain(|_, (_, _, seen)| now.duration_since(*seen) < DEDUPE_LIFETIME);

        if service.paused() {
            continue;
        }

        let ready: Vec<PathBuf> = pending
            .iter()
            .filter(|(_, seen)| now.duration_since(**seen) >= SETTLE)
            .map(|(path, _)| path.clone())
            .collect();
        for path in ready {
            pending.remove(&path);
            process_file(&service, &path, &mut dedupe);
        }
    }
}

fn build_watcher(
    database: &Database,
    events: Sender<notify::Result<notify::Event>>,
) -> Result<(RecommendedWatcher, usize), String> {
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = events.send(event);
    })
    .map_err(|error| error.to_string())?;

    let rules = database
        .list_automation_rules()
        .map_err(|error| error.to_string())?;
    let mut roots: HashSet<PathBuf> = HashSet::new();
    let mut watching = 0;
    for rule in rules.iter().filter(|rule| rule.enabled) {
        let root = canonical(Path::new(&rule.input_dir));
        if !root.is_dir() {
            let _ = database.append_automation_log(
                Some(&rule.id),
                "error",
                &format!("watched folder {} is missing", rule.input_dir),
                None,
            );
            continue;
        }
        if !roots.insert(root.clone()) {
            // Two rules may watch the same folder; one subscription is enough.
            watching += 1;
            continue;
        }
        match watcher.watch(&root, RecursiveMode::Recursive) {
            Ok(()) => watching += 1,
            Err(error) => {
                let _ = database.append_automation_log(
                    Some(&rule.id),
                    "error",
                    &format!("could not watch {}: {error}", rule.input_dir),
                    None,
                );
            }
        }
    }
    Ok((watcher, watching))
}

struct PreparedRule {
    rule: AutomationRule,
    input_root: PathBuf,
    output_root: PathBuf,
}

fn process_file(
    service: &AutomationService,
    path: &Path,
    dedupe: &mut HashMap<(PathBuf, String), (u64, u64, Instant)>,
) {
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default();
    if is_ignored_name(&name) {
        return;
    }
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => metadata,
        _ => return,
    };
    let size = metadata.len();
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);

    let rules = match service.database.list_automation_rules() {
        Ok(rules) => rules,
        Err(error) => {
            log::warn!("automation could not read its rules: {error}");
            return;
        }
    };
    let prepared: Vec<PreparedRule> = rules
        .into_iter()
        .filter(|rule| rule.enabled)
        .map(|rule| PreparedRule {
            input_root: canonical(Path::new(&rule.input_dir)),
            output_root: canonical(Path::new(&rule.output_dir)),
            rule,
        })
        .collect();

    // Belt and braces: even if a rule file was edited by hand, a path inside
    // any output folder is never treated as a new input.
    if prepared
        .iter()
        .any(|prepared| within(path, &prepared.output_root))
    {
        return;
    }

    let detected = format::detect_from_path(path);
    if detected == FormatId::Unknown {
        return;
    }

    for prepared in &prepared {
        if !within(path, &prepared.input_root) {
            continue;
        }
        if !format_matches(&prepared.rule, detected) || !mode_accepts(prepared.rule.mode, detected)
        {
            continue;
        }
        let key = (path.to_path_buf(), prepared.rule.id.clone());
        if let Some((seen_size, seen_modified, _)) = dedupe.get(&key)
            && *seen_size == size
            && *seen_modified == modified
        {
            continue;
        }

        let request = JobRequest {
            input_path: path.display().to_string(),
            output_format: prepared.rule.output_format,
            operation: match prepared.rule.mode {
                AutomationMode::Convert => JobOperation::Convert,
                AutomationMode::Ocr => JobOperation::Ocr,
            },
            settings: prepared.rule.settings.clone(),
            output_directory: Some(prepared.rule.output_dir.clone()),
            extra_inputs: Vec::new(),
            output_name: None,
            selected_entries: Vec::new(),
            password: None,
        };
        let outcome = service.queue.submit(vec![request]).pop();
        let label = format!("{}: {}", prepared.rule.name, name);
        match outcome {
            Some(outcome) if outcome.accepted => {
                let output = outcome
                    .job
                    .as_ref()
                    .map(|job| job.output_path.clone())
                    .unwrap_or_default();
                let _ = service.database.append_automation_log(
                    Some(&prepared.rule.id),
                    "info",
                    &format!("{label} queued"),
                    Some(&output),
                );
                dedupe.insert(key, (size, modified, Instant::now()));
            }
            Some(outcome) => {
                let message = outcome
                    .error
                    .map(|error| error.message)
                    .or_else(|| {
                        outcome
                            .skipped_path
                            .map(|path| format!("left the existing output {path} alone"))
                    })
                    .unwrap_or_else(|| "the file was rejected".to_owned());
                let _ = service.database.append_automation_log(
                    Some(&prepared.rule.id),
                    "error",
                    &format!("{label} was not queued: {message}"),
                    Some(&path.display().to_string()),
                );
            }
            None => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::job::JobStatus;
    use crate::core::manager::ConversionManager;
    use crate::core::settings::AppSettings;
    use crate::queue::events::{JobEmitter, JobEvent};
    use std::sync::Mutex;

    #[derive(Default)]
    struct Silent(Mutex<Vec<JobEvent>>);

    impl JobEmitter for Silent {
        fn emit(&self, event: JobEvent) {
            if let Ok(mut events) = self.0.lock() {
                events.push(event);
            }
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("uc-auto-{name}-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch");
        dir
    }

    fn rule(input: &Path, output: &Path) -> AutomationRule {
        AutomationRule {
            id: String::new(),
            name: "Test rule".to_owned(),
            input_dir: input.display().to_string(),
            output_dir: output.display().to_string(),
            input_formats: Vec::new(),
            output_format: FormatId::Jpeg,
            mode: AutomationMode::Convert,
            settings: serde_json::json!({ "quality": 80 }),
            enabled: true,
        }
    }

    #[test]
    fn output_folders_inside_the_watched_folder_are_refused() {
        let dir = scratch("overlap");
        let input = dir.join("in");
        std::fs::create_dir_all(&input).unwrap();

        let mut nested = rule(&input, &input.join("out"));
        let error = validate_rule(&mut nested).expect_err("nesting must be refused");
        assert!(error.to_string().contains("must not contain"), "{error}");

        let mut same = rule(&input, &input);
        assert!(validate_rule(&mut same).is_err());

        let mut separate = rule(&input, &dir.join("out"));
        validate_rule(&mut separate).expect("separate folders are fine");
        assert!(
            dir.join("out").is_dir(),
            "validation creates the output folder"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn passwords_cannot_be_hidden_in_rule_settings() {
        let dir = scratch("secret");
        let input = dir.join("in");
        std::fs::create_dir_all(&input).unwrap();
        let mut settings_rule = rule(&input, &dir.join("out"));
        settings_rule.settings = serde_json::json!({ "nested": { "Password": "never-stored" } });
        let error = validate_rule(&mut settings_rule).expect_err("must refuse");
        assert!(error.to_string().contains("password"), "{error}");
        assert!(!error.to_string().contains("never-stored"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn transient_names_are_ignored() {
        for name in [
            "~$report.docx",
            ".hidden",
            "video.mp4.part",
            "download.crdownload",
            "notes.tmp",
            "Thumbs.db",
        ] {
            assert!(is_ignored_name(name), "{name} should be ignored");
        }
        for name in ["photo.jpg", "report.pdf", "clip.mp4"] {
            assert!(!is_ignored_name(name), "{name} should be accepted");
        }
    }

    #[test]
    fn format_filters_and_ocr_only_accept_what_they_can_read() {
        let mut rule = AutomationRule {
            input_formats: vec![FormatId::Png],
            ..AutomationRule::default()
        };
        assert!(format_matches(&rule, FormatId::Png));
        assert!(!format_matches(&rule, FormatId::Jpeg));
        rule.input_formats.clear();
        assert!(format_matches(&rule, FormatId::Jpeg));

        assert!(mode_accepts(AutomationMode::Convert, FormatId::Zip));
        assert!(mode_accepts(AutomationMode::Ocr, FormatId::Png));
        assert!(!mode_accepts(AutomationMode::Ocr, FormatId::Mp3));
    }

    #[test]
    fn paused_state_survives_a_database_reload() {
        let dir = scratch("paused");
        let db = Database::open(&dir.join("db.sqlite")).unwrap();
        assert!(!db.automation_paused().unwrap());
        db.set_automation_paused(true).unwrap();
        assert!(db.automation_paused().unwrap());
        db.set_automation_paused(false).unwrap();
        assert!(!db.automation_paused().unwrap());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// The whole watcher path: a real file arriving on disk, the real notify
    /// watcher, the shared queue and the image engine.
    #[test]
    fn a_new_file_in_a_watched_folder_is_really_converted() {
        let dir = scratch("e2e");
        let input = dir.join("in");
        let output = dir.join("out");
        std::fs::create_dir_all(&input).unwrap();

        let database = Arc::new(Database::open(&dir.join("db.sqlite")).unwrap());
        let emitter: Arc<dyn JobEmitter> = Arc::new(Silent::default());
        let queue = Arc::new(ConversionQueue::new(
            emitter,
            Arc::new(ConversionManager::new()),
            Arc::clone(&database),
            AppSettings::default(),
            dir.join("temp"),
        ));

        let mut stored = rule(&input, &output);
        validate_rule(&mut stored).unwrap();
        database.save_automation_rule(&stored).unwrap();

        let service = AutomationService::start(Arc::clone(&database), Arc::clone(&queue));
        // Give the watcher thread time to subscribe before the file appears.
        for _ in 0..40 {
            if service.status().watching > 0 {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(service.status().watching > 0, "the watcher never started");

        let source = input.join("photo.png");
        let mut image = image::RgbaImage::new(16, 16);
        for pixel in image.pixels_mut() {
            *pixel = image::Rgba([10, 120, 200, 255]);
        }
        image.save(&source).unwrap();

        let mut finished = None;
        for _ in 0..120 {
            if let Ok(history) = database.history(10, 0)
                && let Some(entry) = history.into_iter().find(|entry| {
                    canonical(Path::new(&entry.input_path)) == canonical(&source)
                        && entry.status == JobStatus::Completed
                })
            {
                finished = Some(entry);
                break;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        service.stop();

        let entry = finished.unwrap_or_else(|| {
            let logs = database.automation_logs(50).unwrap();
            let history = database.history(50, 0).unwrap();
            panic!("the watcher never queued a finished conversion; logs: {logs:?}; history: {history:?}");
        });
        assert!(Path::new(&entry.output_path).is_file());
        assert_eq!(
            crate::core::format::detect_from_path(Path::new(&entry.output_path)),
            FormatId::Jpeg
        );
        assert!(source.is_file(), "the watched original is never deleted");
        let logs = database.automation_logs(20).unwrap();
        assert!(logs.iter().any(|entry| entry.level == "info"));
        let _ = service;
        std::fs::remove_dir_all(&dir).ok();
    }
}
