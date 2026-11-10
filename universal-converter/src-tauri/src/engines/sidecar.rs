use crate::engines::CancellationToken;
use crate::error::ConversionError;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{LazyLock, RwLock};
use std::time::{Duration, Instant};

/// `CREATE_NO_WINDOW` — stops a console flashing behind the app on Windows.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const POLL: Duration = Duration::from_millis(120);

/// Paths chosen in Settings → Engines. Windows has no per-process environment
/// block for a GUI app, so overrides live here instead of mutating the process
/// environment (which is unsafe once worker threads exist).
static USER_OVERRIDES: LazyLock<RwLock<HashMap<String, PathBuf>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

pub fn set_user_overrides(paths: HashMap<String, PathBuf>) {
    if let Ok(mut overrides) = USER_OVERRIDES.write() {
        *overrides = paths;
    }
}

/// The configured path for an environment-style key, if any. Kept separate
/// from `locate` so callers with their own search order (LibreOffice, OCR
/// language data) can still honour the Settings choice.
pub fn user_override(env_key: &str) -> Option<PathBuf> {
    USER_OVERRIDES
        .read()
        .ok()
        .and_then(|overrides| overrides.get(env_key).cloned())
}

fn user_override_candidate(env_key: &str, names: &[&str]) -> Option<PathBuf> {
    let path = user_override(env_key)?;
    if path.is_file() {
        return Some(path);
    }
    if path.is_dir() {
        return names
            .iter()
            .map(|name| path.join(name))
            .find(|candidate| candidate.is_file());
    }
    None
}

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    }
}

/// Find an engine binary. Order: the path saved in Settings, the `UC_*`
/// environment variable, the copy bundled with the app, then PATH. Uses
/// `env::split_paths`, never a shell lookup.
pub fn locate(env_key: &str, binary: &str, bundled_dir: &str) -> Option<PathBuf> {
    // A configured path that is wrong must not silently fall back to another
    // build; the probe reports the engine as unavailable instead.
    if user_override(env_key).is_some() {
        return user_override_candidate(env_key, &[&exe(binary)]);
    }

    if let Some(override_path) = std::env::var_os(env_key) {
        let path = PathBuf::from(&override_path);
        if path.is_file() {
            return Some(path);
        }
    }

    if let Some(path) = bundled_candidate(bundled_dir, binary) {
        return Some(path);
    }

    search_path(binary)
}

/// Walks up from the executable so `target/debug/` during dev still finds
/// `resources/ffmpeg/ffmpeg.exe` at the repository root.
fn bundled_candidate(dir: &str, binary: &str) -> Option<PathBuf> {
    bundled_file(dir, &exe(binary))
}

/// Same search order as `locate`, for a payload that is loaded into this
/// process rather than executed — the PDFium DLL, for instance.
pub fn locate_library(env_key: &str, file_name: &str, bundled_dir: &str) -> Option<PathBuf> {
    if user_override(env_key).is_some() {
        return user_override_candidate(env_key, &[file_name]);
    }

    if let Some(override_path) = std::env::var_os(env_key) {
        let path = PathBuf::from(&override_path);
        if path.is_file() {
            return Some(path);
        }
    }

    if let Some(path) = bundled_file(bundled_dir, file_name) {
        return Some(path);
    }

    let joined = std::env::var_os("PATH")?;
    std::env::split_paths(&joined)
        .filter(|directory| !directory.as_os_str().is_empty())
        .map(|directory| directory.join(file_name))
        .find(|candidate| candidate.is_file())
}

fn bundled_file(dir: &str, file_name: &str) -> Option<PathBuf> {
    let mut cursor = std::env::current_exe().ok()?.parent()?.to_path_buf();
    for _ in 0..5 {
        for layout in [
            cursor.join("resources").join(dir),
            cursor.join("binaries").join(dir),
            cursor.join("../../resources").join(dir),
        ] {
            let candidate = layout.join(file_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
        if !cursor.pop() {
            break;
        }
    }
    None
}

fn search_path(binary: &str) -> Option<PathBuf> {
    let names: Vec<String> = if cfg!(windows) {
        vec![exe(binary), format!("{binary}.com"), binary.to_owned()]
    } else {
        vec![binary.to_owned()]
    };
    search_path_named(&names.iter().map(String::as_str).collect::<Vec<_>>())
}

/// PATH lookup for a list of exact file names, in preference order. Used where
/// the console variant matters (`soffice.com` never opens a window).
pub fn search_path_named(names: &[&str]) -> Option<PathBuf> {
    let joined = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&joined) {
        if directory.as_os_str().is_empty() {
            continue;
        }
        for name in names {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// A concrete path from Settings or a `UC_*_PATH` value: either the executable
/// itself or a directory containing one of `names`.
pub fn override_candidate(env_key: &str, names: &[&str]) -> Option<PathBuf> {
    if user_override(env_key).is_some() {
        return user_override_candidate(env_key, names);
    }

    let raw = std::env::var_os(env_key)?;
    let path = PathBuf::from(raw);
    if path.is_file() {
        return Some(path);
    }
    if path.is_dir() {
        for name in names {
            let candidate = path.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Exact-name lookup in the bundled resources tree, walking up from the
/// executable so a development build finds the repository copy.
pub fn bundled_named(dir: &str, names: &[&str]) -> Option<PathBuf> {
    names.iter().find_map(|name| bundled_file(dir, name))
}

/// Look for an executable in a list of well-known install directories.
pub fn installed_named(directories: &[PathBuf], names: &[&str]) -> Option<PathBuf> {
    directories.iter().find_map(|directory| {
        names
            .iter()
            .map(|name| directory.join(name))
            .find(|candidate| candidate.is_file())
    })
}

/// Environment variables that hold a standard Windows install root, without
/// hard-coding a user's drive letter or locale path.
pub fn program_files_dirs() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for key in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
        if let Some(value) = std::env::var_os(key) {
            let path = PathBuf::from(value);
            if !roots.contains(&path) {
                roots.push(path);
            }
        }
    }
    roots
}

/// Arguments are handed to the OS as argv. There is no `cmd /C` anywhere, so a
/// filename containing `&&`, `|` or `^` stays data.
fn configure(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.stdin(Stdio::null());
}

fn spawn_failure(program: &Path, error: &std::io::Error) -> ConversionError {
    ConversionError::Other(format!("could not start {}: {error}", program.display()))
}

fn exit_failure(label: &str, code: Option<i32>) -> ConversionError {
    ConversionError::Other(format!(
        "{label} exited with {}",
        code.map(|value| value.to_string())
            .unwrap_or_else(|| "a signal".to_owned())
    ))
}

/// Same as `exit_failure`, plus the tail of what the tool said. Files and
/// reasons live there; callers strip anything they consider secret before
/// building the argv, so this text is safe to show.
fn exit_failure_detailed(label: &str, code: Option<i32>, stderr: &str) -> ConversionError {
    if stderr.trim().is_empty() {
        return exit_failure(label, code);
    }
    let mut detail = stderr.trim().to_owned();
    if detail.chars().count() > 800 {
        let keep: String = detail.chars().take(800).collect();
        detail = format!("{keep}…");
    }
    ConversionError::Other(format!(
        "{label} failed: {detail} (exit {})",
        code.map(|value| value.to_string())
            .unwrap_or_else(|| "signal".to_owned())
    ))
}

/// Result of a short-lived process whose output was captured in full.
pub struct Captured {
    pub stdout: Vec<u8>,
    pub stderr: String,
    pub status: std::process::ExitStatus,
}

/// Run a short command, draining both pipes concurrently and bounding each.
/// Used for structured output (ffprobe JSON, encoder tables) and raw payloads
/// (a PNG written to `pipe:1`). Both pipes are read on their own threads so the
/// child can never block on a full pipe while we wait for it to exit.
pub fn capture(
    program: &Path,
    args: &[&str],
    max_stdout: usize,
    timeout: Duration,
) -> Result<Captured, ConversionError> {
    let mut command = Command::new(program);
    configure(&mut command);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| spawn_failure(program, &error))?;
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();
    let label = program.display().to_string();

    std::thread::scope(|scope| {
        let stdout_reader = scope.spawn(|| {
            let mut collected: Vec<u8> = Vec::new();
            if let Some(pipe) = stdout.as_mut() {
                let mut scratch = [0u8; 8192];
                loop {
                    match pipe.read(&mut scratch) {
                        Ok(0) | Err(_) => break,
                        Ok(read) => {
                            collected.extend_from_slice(&scratch[..read]);
                            if collected.len() >= max_stdout {
                                break;
                            }
                        }
                    }
                }
            }
            collected
        });
        let stderr_reader = scope.spawn(|| {
            let mut collected: Vec<u8> = Vec::new();
            if let Some(pipe) = stderr.as_mut() {
                let mut scratch = [0u8; 4096];
                loop {
                    match pipe.read(&mut scratch) {
                        Ok(0) | Err(_) => break,
                        Ok(read) => {
                            if collected.len() < MAX_DIAGNOSTIC {
                                collected.extend_from_slice(&scratch[..read]);
                            }
                        }
                    }
                }
            }
            String::from_utf8_lossy(&collected).trim().to_owned()
        });

        let deadline = Instant::now() + timeout;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => {}
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(ConversionError::Other(format!("{label}: {error}")));
                }
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Err(ConversionError::Timeout {
                    seconds: timeout.as_secs().max(1),
                });
            }
            std::thread::sleep(POLL);
        };

        // The pipes close when the child exits, so these joins are bounded.
        let stdout = stdout_reader.join().unwrap_or_default();
        let stderr = stderr_reader.join().unwrap_or_default();
        Ok(Captured {
            stdout,
            stderr,
            status,
        })
    })
}

/// Run a short command and capture a bounded slice of stdout. For `--version`
/// probes, where the output is known to be small.
pub fn run_capturing(
    program: &Path,
    args: &[&str],
    max_bytes: usize,
    timeout: Duration,
) -> Result<String, ConversionError> {
    let captured = capture(program, args, max_bytes, timeout)?;
    if !captured.status.success() {
        return Err(exit_failure_detailed(
            &program.display().to_string(),
            captured.status.code(),
            &captured.stderr,
        ));
    }

    let mut text = String::from_utf8_lossy(&captured.stdout).trim().to_owned();
    if text.len() > 400 {
        text.truncate(400);
        if let Some(cut) = text.char_indices().last() {
            text.truncate(cut.0.min(400));
        }
    }
    Ok(text)
}

/// Like `run_capturing` but never truncates stdout — ffprobe JSON and encoder
/// tables do not fit in a version-line budget.
pub fn run_capturing_full(
    program: &Path,
    args: &[&str],
    max_bytes: usize,
    timeout: Duration,
) -> Result<String, ConversionError> {
    let captured = capture(program, args, max_bytes, timeout)?;
    if !captured.status.success() {
        return Err(exit_failure_detailed(
            &program.display().to_string(),
            captured.status.code(),
            &captured.stderr,
        ));
    }
    Ok(String::from_utf8_lossy(&captured.stdout).trim().to_owned())
}

/// A child process the queue can actually stop: polled, cancellable, bounded.
/// stderr is drained on its own thread so a chatty tool can neither deadlock the
/// pipe nor grow without limit; its tail explains failures to the user.
pub struct Sidecar {
    child: Child,
    label: String,
    stderr: Option<std::thread::JoinHandle<String>>,
    stdout: Option<std::thread::JoinHandle<String>>,
    lines: Option<std::sync::mpsc::Receiver<String>>,
}

/// Enough of a tool's stderr to name the file and the reason, not enough to
/// carry a whole document back into the UI.
const MAX_DIAGNOSTIC: usize = 8 * 1024;

/// Outcome of a child that ran to completion. Kept separate from the error type
/// so a caller can recognise tool-specific messages (a wrong archive password)
/// and map them to a typed error.
pub struct ExitInfo {
    pub success: bool,
    pub code: Option<i32>,
    pub stderr: String,
}

impl Sidecar {
    pub fn start(program: &Path, args: &[&str]) -> Result<Self, ConversionError> {
        Self::start_in(program, args, None)
    }

    /// Same as `start`, with a working directory. 7-Zip stores paths relative to
    /// the current directory, so archive creation relies on this.
    pub fn start_in(
        program: &Path,
        args: &[&str],
        current_dir: Option<&Path>,
    ) -> Result<Self, ConversionError> {
        Self::spawn(program, args, current_dir, false)
    }

    /// Pipes stdout so `wait_streaming` can forward 7-Zip's `-bsp1` percentages
    /// while the process runs. Lines are queued with a bounded channel: if the
    /// consumer stalls, progress lines are dropped rather than deadlocking the
    /// child on a full pipe.
    pub fn start_streaming(
        program: &Path,
        args: &[&str],
        current_dir: Option<&Path>,
    ) -> Result<Self, ConversionError> {
        Self::spawn(program, args, current_dir, true)
    }

    fn spawn(
        program: &Path,
        args: &[&str],
        current_dir: Option<&Path>,
        stream_stdout: bool,
    ) -> Result<Self, ConversionError> {
        let mut command = Command::new(program);
        configure(&mut command);
        command
            .args(args)
            .stdout(if stream_stdout {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stderr(Stdio::piped());
        if let Some(directory) = current_dir {
            command.current_dir(directory);
        }
        let mut child = command
            .spawn()
            .map_err(|error| spawn_failure(program, &error))?;
        let stderr = child.stderr.take().and_then(|mut pipe| {
            std::thread::Builder::new()
                .name("uc-sidecar-stderr".to_owned())
                .spawn(move || {
                    let mut collected: Vec<u8> = Vec::new();
                    let mut scratch = [0u8; 4096];
                    loop {
                        match pipe.read(&mut scratch) {
                            Ok(0) | Err(_) => break,
                            Ok(read) => {
                                if collected.len() < MAX_DIAGNOSTIC {
                                    collected.extend_from_slice(&scratch[..read]);
                                }
                            }
                        }
                    }
                    String::from_utf8_lossy(&collected).trim().to_owned()
                })
                .ok()
        });
        let mut lines = None;
        let stdout = match child.stdout.take() {
            Some(mut pipe) if stream_stdout => {
                let (sender, receiver) = std::sync::mpsc::sync_channel::<String>(512);
                lines = Some(receiver);
                std::thread::Builder::new()
                    .name("uc-sidecar-stdout".to_owned())
                    .spawn(move || {
                        let mut collected: Vec<u8> = Vec::new();
                        let mut scratch = [0u8; 2048];
                        let mut pending: Vec<u8> = Vec::new();
                        loop {
                            match pipe.read(&mut scratch) {
                                Ok(0) | Err(_) => break,
                                Ok(read) => {
                                    if collected.len() < MAX_DIAGNOSTIC {
                                        collected.extend_from_slice(&scratch[..read]);
                                    }
                                    pending.extend_from_slice(&scratch[..read]);
                                    let mut start = 0;
                                    let mut index = 0;
                                    while index < pending.len() {
                                        if matches!(pending[index], b'\r' | b'\n') {
                                            if index > start {
                                                let line =
                                                    String::from_utf8_lossy(&pending[start..index]);
                                                if !line.trim().is_empty() {
                                                    let _ = sender.try_send(line.trim().to_owned());
                                                }
                                            }
                                            start = index + 1;
                                        }
                                        index += 1;
                                    }
                                    pending.drain(..start);
                                    // A tool that never emits a separator must
                                    // not grow this buffer without bound.
                                    if pending.len() > 16 * 1024 {
                                        pending.clear();
                                    }
                                }
                            }
                        }
                        if !pending.is_empty() {
                            let text = String::from_utf8_lossy(&pending);
                            if !text.trim().is_empty() {
                                let _ = sender.try_send(text.trim().to_owned());
                            }
                        }
                        String::from_utf8_lossy(&collected).trim().to_owned()
                    })
                    .ok()
            }
            _ => None,
        };
        Ok(Sidecar {
            child,
            label: program.display().to_string(),
            stderr,
            stdout,
            lines,
        })
    }

    /// Blocks until the process exits, is cancelled or times out. On success the
    /// returned string is whatever the tool wrote to stderr (often progress
    /// notes); on failure it is folded into the error message.
    pub fn wait(
        &mut self,
        cancel: &CancellationToken,
        timeout: Duration,
    ) -> Result<String, ConversionError> {
        let info = self.wait_info(cancel, timeout)?;
        if info.success {
            Ok(info.stderr)
        } else {
            Err(exit_failure_detailed(&self.label, info.code, &info.stderr))
        }
    }

    /// Like `wait`, but returns the exit details instead of turning a non-zero
    /// exit into a generic error. Cancellation and timeout stay typed errors and
    /// always terminate the child.
    pub fn wait_info(
        &mut self,
        cancel: &CancellationToken,
        timeout: Duration,
    ) -> Result<ExitInfo, ConversionError> {
        self.wait_internal(cancel, timeout, None)
    }

    /// Same as `wait_info`, forwarding streamed stdout lines to `on_line` while
    /// the child runs. The callback is borrowed, so it can report straight into
    /// the job's progress sink without an `'static` clone.
    pub fn wait_streaming(
        &mut self,
        cancel: &CancellationToken,
        timeout: Duration,
        on_line: &dyn Fn(&str),
    ) -> Result<ExitInfo, ConversionError> {
        self.wait_internal(cancel, timeout, Some(on_line))
    }

    fn wait_internal(
        &mut self,
        cancel: &CancellationToken,
        timeout: Duration,
        on_line: Option<&dyn Fn(&str)>,
    ) -> Result<ExitInfo, ConversionError> {
        let deadline = Instant::now() + timeout;
        loop {
            self.drain_lines(on_line);
            match self.child.try_wait() {
                Ok(Some(status)) => {
                    let _ = self.child.wait();
                    let stderr = self.finish_pipes();
                    self.drain_lines(on_line);
                    return Ok(ExitInfo {
                        success: status.success(),
                        code: status.code(),
                        stderr,
                    });
                }
                Ok(None) => {}
                Err(error) => {
                    self.terminate();
                    return Err(ConversionError::Other(format!("{}: {error}", self.label)));
                }
            }
            if cancel.is_cancelled() {
                self.terminate();
                return Err(ConversionError::Cancelled);
            }
            if Instant::now() >= deadline {
                self.terminate();
                return Err(ConversionError::Timeout {
                    seconds: timeout.as_secs().max(1),
                });
            }
            std::thread::sleep(POLL);
        }
    }

    fn drain_lines(&self, on_line: Option<&dyn Fn(&str)>) {
        let (Some(receiver), Some(on_line)) = (&self.lines, on_line) else {
            return;
        };
        while let Ok(line) = receiver.try_recv() {
            on_line(&line);
        }
    }

    fn terminate(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = self.finish_pipes();
    }

    fn finish_pipes(&mut self) -> String {
        let _ = self.stdout.take().and_then(|handle| handle.join().ok());
        self.stderr
            .take()
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locate_returns_none_for_absent_binary() {
        assert!(locate("UC_DEFINITELY_MISSING", "uc-no-such-binary-xyz", "nope").is_none());
        assert!(
            locate_library(
                "UC_DEFINITELY_MISSING",
                "uc-no-such-library-xyz.dll",
                "nope"
            )
            .is_none()
        );
    }

    #[test]
    fn bundled_lookup_does_not_confuse_a_directory_for_a_binary() {
        // `resources` exists in this repo but holds no executables yet.
        assert!(bundled_candidate(".", ".").is_none());
    }

    #[test]
    fn spawn_of_missing_binary_errors_without_panicking() {
        let cancel = CancellationToken::new();
        let result = Sidecar::start(Path::new("uc-definitely-not-installed.exe"), &["-version"]);
        match result {
            Err(error) => assert!(error.to_string().contains("could not start")),
            Ok(mut sidecar) => {
                let _ = sidecar.wait(&cancel, Duration::from_secs(1));
            }
        }
    }

    #[test]
    fn full_capture_keeps_structured_output_beyond_the_version_budget() {
        let Some(cmd) = search_path("cmd") else {
            return;
        };
        let long = "x".repeat(1_200);
        let captured = capture(
            &cmd,
            &["/c", "echo", &long],
            8 * 1024,
            Duration::from_secs(10),
        )
        .expect("cmd should run");
        assert!(captured.status.success());
        // `cmd` ends the line with CRLF, so the newline byte count is platform
        // specific; what matters is that the full 1,200-character line survived.
        let text = String::from_utf8_lossy(&captured.stdout);
        assert_eq!(
            text.trim_end_matches(['\r', '\n']).len(),
            1_200,
            "the whole line must survive"
        );
    }

    #[test]
    fn cancel_before_wait_reports_cancelled_not_crash() {
        // `cmd.exe` exists everywhere and would otherwise linger; the point is
        // that cancellation produces a typed error, never a hang.
        let Some(cmd) = search_path("cmd") else {
            return;
        };
        let cancel = CancellationToken::new();
        cancel.cancel();
        let mut sidecar = Sidecar::start(&cmd, &["/c", "ping", "-n", "5", "127.0.0.1"])
            .expect("cmd.exe should start");
        let error = sidecar
            .wait(&cancel, Duration::from_secs(10))
            .expect_err("pre-cancelled job must not run to completion");
        assert!(matches!(error, ConversionError::Cancelled), "got {error}");
    }
}
