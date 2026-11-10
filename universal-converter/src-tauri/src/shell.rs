use serde::Serialize;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

/// Paths received from Explorer ("Open with", context menu or a shortcut).
/// The UI drains this once after startup; the single-instance callback also
/// emits them so a running window reacts immediately.
#[derive(Default)]
pub struct OpenedFiles(pub Mutex<Vec<String>>);

impl OpenedFiles {
    pub fn push(&self, paths: Vec<String>) {
        if paths.is_empty() {
            return;
        }
        if let Ok(mut pending) = self.0.lock() {
            pending.extend(paths);
            pending.dedup();
        }
    }

    pub fn take(&self) -> Vec<String> {
        self.0
            .lock()
            .map(|mut pending| std::mem::take(&mut *pending))
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellIntegration {
    pub enabled: bool,
    pub supported: bool,
}

const CONTEXT_KEY: &str = r"Software\Classes\*\shell\UniversalConverter";
const CONTEXT_COMMAND_KEY: &str = r"Software\Classes\*\shell\UniversalConverter\command";
const APPLICATIONS_KEY: &str = r"Software\Classes\Applications\universal-converter.exe";
const APPLICATIONS_COMMAND_KEY: &str =
    r"Software\Classes\Applications\universal-converter.exe\shell\open\command";

/// Extensions offered in Explorer's "Open with" list. Nothing here changes the
/// default association; Windows still lets the user choose.
const OPEN_WITH_TYPES: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "tif", "ico", "pdf", "docx", "doc", "odt",
    "rtf", "txt", "html", "xlsx", "xls", "ods", "csv", "pptx", "ppt", "odp", "mp3", "wav", "flac",
    "aac", "m4a", "ogg", "opus", "mp4", "mkv", "mov", "avi", "webm", "zip", "7z", "tar", "gz",
    "bz2", "xz",
];

fn executable() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|error| format!("could not locate the application: {error}"))
}

fn quoted(path: &Path) -> String {
    format!("\"{}\"", path.display())
}

fn command_line(exe: &Path, flags: &str) -> String {
    format!("{} {flags}", quoted(exe))
}

/// Collects real files from a process command line. Recognises the context-menu
/// form (`--convert <path>`) and the bare paths Explorer passes for "Open with".
pub fn files_from_args<I>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = OsString>,
{
    let mut files = Vec::new();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let text = arg.to_string_lossy();
        if text == "--convert" {
            if let Some(next) = args.next() {
                let path = PathBuf::from(next);
                if path.exists() {
                    files.push(path.to_string_lossy().into_owned());
                }
            }
            continue;
        }
        if let Some(rest) = text.strip_prefix("--convert=") {
            let path = PathBuf::from(rest);
            if path.exists() {
                files.push(path.to_string_lossy().into_owned());
            }
            continue;
        }
        if text.starts_with('-') {
            continue;
        }
        let path = PathBuf::from(arg);
        if path.exists() {
            files.push(path.to_string_lossy().into_owned());
        }
    }
    files.sort();
    files.dedup();
    files
}

#[cfg(windows)]
pub fn integration_status() -> ShellIntegration {
    use winreg::enums::HKEY_CURRENT_USER;
    let hkcu = winreg::RegKey::predef(HKEY_CURRENT_USER);
    ShellIntegration {
        enabled: hkcu.open_subkey(CONTEXT_KEY).is_ok()
            && hkcu.open_subkey(APPLICATIONS_KEY).is_ok(),
        supported: true,
    }
}

#[cfg(not(windows))]
pub fn integration_status() -> ShellIntegration {
    ShellIntegration {
        enabled: false,
        supported: false,
    }
}

#[cfg(windows)]
pub fn set_integration(enabled: bool) -> Result<ShellIntegration, String> {
    use winreg::enums::HKEY_CURRENT_USER;
    let exe = executable()?;
    let hkcu = winreg::RegKey::predef(HKEY_CURRENT_USER);

    if enabled {
        let context = hkcu
            .create_subkey(CONTEXT_KEY)
            .map_err(|error| format!("could not create the Explorer menu: {error}"))?
            .0;
        let _ = context.set_value("MUIVerb", &"Convert with Universal Converter");
        let _ = context.set_value("Icon", &exe.to_string_lossy().to_string());
        let command = hkcu
            .create_subkey(CONTEXT_COMMAND_KEY)
            .map_err(|error| format!("could not register the menu command: {error}"))?
            .0;
        command
            .set_value("", &command_line(&exe, "--convert \"%1\""))
            .map_err(|error| format!("could not write the menu command: {error}"))?;
        drop(command);
        drop(context);

        let app = hkcu
            .create_subkey(APPLICATIONS_KEY)
            .map_err(|error| format!("could not register Open With: {error}"))?
            .0;
        let _ = app.set_value("FriendlyAppName", &"Universal Converter");
        let app_command = hkcu
            .create_subkey(APPLICATIONS_COMMAND_KEY)
            .map_err(|error| format!("could not register the Open With command: {error}"))?
            .0;
        app_command
            .set_value("", &command_line(&exe, "\"%1\""))
            .map_err(|error| format!("could not write the Open With command: {error}"))?;
        drop(app_command);

        for extension in OPEN_WITH_TYPES {
            if let Ok((key, _)) = app.create_subkey(format!("SupportedTypes\\.{extension}")) {
                let _ = key.set_value("", &"");
            }
        }
        drop(app);
    } else {
        let _ = hkcu.delete_subkey_all(CONTEXT_KEY);
        let _ = hkcu.delete_subkey_all(APPLICATIONS_KEY);
    }

    Ok(integration_status())
}

#[cfg(not(windows))]
pub fn set_integration(_enabled: bool) -> Result<ShellIntegration, String> {
    Err("Explorer integration is only available on Windows.".to_owned())
}

/// Called from the single-instance plugin: bring the window back and hand over
/// any files the second launch was asked to open.
pub fn focus_and_forward(app: &tauri::AppHandle, paths: Vec<String>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    if !paths.is_empty() {
        if let Some(state) = app.try_state::<OpenedFiles>() {
            state.push(paths.clone());
        }
        let _ = tauri::Emitter::emit(app, "converter://open-files", paths);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!("uc-shell-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let file = directory.join(name);
        std::fs::write(&file, b"x").unwrap();
        file
    }

    #[test]
    fn context_menu_arguments_are_read_but_switches_are_not() {
        let file = temp_file("photo.png");
        let missing = std::env::temp_dir().join("uc-shell-does-not-exist.png");
        let args = vec![
            OsString::from("--convert"),
            file.clone().into_os_string(),
            OsString::from("--flag"),
            missing.into_os_string(),
        ];
        let files = files_from_args(args);
        assert_eq!(files, vec![file.to_string_lossy().to_string()]);
    }

    #[test]
    fn bare_open_with_paths_are_accepted() {
        let first = temp_file("one.mp3");
        let second = temp_file("two.pdf");
        let files = files_from_args(vec![
            first.clone().into_os_string(),
            second.clone().into_os_string(),
            first.into_os_string(),
        ]);
        assert_eq!(files.len(), 2);
        assert!(files.contains(&second.to_string_lossy().to_string()));
    }

    #[test]
    fn duplicate_pending_paths_collapse() {
        let state = OpenedFiles::default();
        state.push(vec!["C:/a.png".to_owned(), "C:/a.png".to_owned()]);
        state.push(vec!["C:/b.png".to_owned()]);
        let drained = state.take();
        assert_eq!(drained, vec!["C:/a.png".to_owned(), "C:/b.png".to_owned()]);
        assert!(state.take().is_empty());
    }

    #[test]
    fn registry_paths_are_exact_and_per_user() {
        assert!(CONTEXT_KEY.starts_with(r"Software\Classes\*\shell\"));
        assert_eq!(
            APPLICATIONS_COMMAND_KEY,
            r"Software\Classes\Applications\universal-converter.exe\shell\open\command"
        );
        assert!(OPEN_WITH_TYPES.contains(&"pdf"));
        assert!(OPEN_WITH_TYPES.contains(&"7z"));
    }
}
