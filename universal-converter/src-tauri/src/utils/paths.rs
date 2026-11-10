use crate::core::format::FormatId;
use crate::core::settings::{AppSettings, CollisionPolicy, OutputDirectoryMode};
use crate::error::ConversionError;
use std::path::{Path, PathBuf};

pub const SUBFOLDER_NAME: &str = "Converted";

/// Local, offline application storage. Everything the app remembers lives here;
/// nothing is sent anywhere.
///
/// `C:\Users\<you>\AppData\Roaming\UniversalConverter\`
/// with `database/`, `cache/`, `temp/`, `logs/` and `presets/` beneath it.
pub fn data_root() -> PathBuf {
    #[cfg(windows)]
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(dirs_fallback);
    #[cfg(not(windows))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs_fallback());

    base.join("UniversalConverter")
}

fn dirs_fallback() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
}

/// Create the storage tree once at startup so failures surface immediately
/// rather than halfway through a batch.
pub fn ensure_storage_layout() -> Result<Vec<PathBuf>, ConversionError> {
    let root = data_root();
    let directories = ["database", "cache", "temp", "logs", "presets"]
        .iter()
        .map(|name| root.join(name))
        .collect::<Vec<_>>();

    for directory in &directories {
        std::fs::create_dir_all(directory).map_err(|error| {
            ConversionError::Other(format!(
                "could not create {} : {error}",
                directory.display()
            ))
        })?;
    }
    Ok(directories)
}

pub fn database_file() -> PathBuf {
    data_root().join("database").join("converter.db")
}

pub fn temp_root() -> PathBuf {
    data_root().join("temp")
}

pub fn logs_root() -> PathBuf {
    data_root().join("logs")
}

pub fn cache_root() -> PathBuf {
    data_root().join("cache")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputDecision {
    /// Safe to write here.
    Proceed(PathBuf),
    /// A file already exists there and the policy says to leave it be.
    Skipped(PathBuf),
}

/// Where a converted file should go, honouring the user's directory mode.
/// A per-job `override_directory` (the "save somewhere else for this batch"
/// picker) wins over the app-wide mode.
pub fn target_directory(
    input: &Path,
    settings: &AppSettings,
    override_directory: Option<&Path>,
) -> PathBuf {
    if let Some(directory) = override_directory.filter(|path| !path.as_os_str().is_empty()) {
        return directory.to_path_buf();
    }
    match settings.output_directory_mode {
        OutputDirectoryMode::Source => input
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(".")),
        OutputDirectoryMode::Subfolder => input
            .parent()
            .map(|parent| parent.join(SUBFOLDER_NAME))
            .unwrap_or_else(|| PathBuf::from(SUBFOLDER_NAME)),
        OutputDirectoryMode::Custom => settings
            .custom_output_directory
            .as_ref()
            .map(PathBuf::from)
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| input.parent().map(Path::to_path_buf).unwrap_or_default()),
    }
}

fn stem_of(input: &Path) -> String {
    let name = input
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let lower = name.to_ascii_lowercase();
    for suffix in [".tar.gz", ".tar.bz2", ".tar.xz"] {
        if lower.ends_with(suffix) {
            return name[..name.len() - suffix.len()].to_owned();
        }
    }
    input
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "converted".to_owned())
}

/// `name.ext`, `name (1).ext`, `name (2).ext`…
pub fn uniquify(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    let extension = path
        .extension()
        .map(|ext| ext.to_string_lossy().into_owned());
    let parent = path.parent().unwrap_or_else(|| Path::new("."));

    for index in 1..=9_999 {
        let candidate = match &extension {
            Some(ext) => parent.join(format!("{stem} ({index}).{ext}")),
            None => parent.join(format!("{stem} ({index})")),
        };
        if !candidate.exists() {
            return candidate;
        }
    }
    path.to_path_buf()
}

/// Plan the destination for a job: one output format, any number of inputs.
/// Rejects any plan that would land on top of a source file. Multi-input jobs
/// (merge) and operations with a user-chosen name (split, reorder) pass the
/// extra inputs here; the stem of the first input is used when no name is given.
pub fn plan_output_job(
    sources: &[&Path],
    output_format: FormatId,
    settings: &AppSettings,
    override_directory: Option<&Path>,
    name_override: Option<&str>,
) -> Result<OutputDecision, ConversionError> {
    let first = sources
        .first()
        .copied()
        .ok_or_else(|| ConversionError::Other("a job needs at least one input file".to_owned()))?;

    let directory = target_directory(first, settings, override_directory);
    let stem = name_override
        .map(sanitize_name)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| stem_of(first));
    let candidate = directory.join(format!("{}.{}", stem, output_format.extension()));

    // Guard first, then the collision policy, so Overwrite can never eat an original.
    for source in sources {
        if paths_are_same(source, &candidate) {
            return Err(ConversionError::Other(format!(
                "refusing to overwrite the source file {}",
                source.display()
            )));
        }
    }

    if !candidate.exists() {
        return Ok(OutputDecision::Proceed(candidate));
    }

    match settings.collision_policy {
        CollisionPolicy::Rename => Ok(OutputDecision::Proceed(uniquify(&candidate))),
        CollisionPolicy::Overwrite => Ok(OutputDecision::Proceed(candidate)),
        CollisionPolicy::Skip => Ok(OutputDecision::Skipped(candidate)),
    }
}

/// Destination folder for an extraction. The folder is always newly created:
/// an existing folder is never merged into or replaced, whatever the collision
/// policy says, because doing so could overwrite files the user already had.
pub fn plan_output_directory(
    source: &Path,
    settings: &AppSettings,
    override_directory: Option<&Path>,
    name_override: Option<&str>,
) -> Result<OutputDecision, ConversionError> {
    let parent = override_directory
        .filter(|path| !path.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| {
            source
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| PathBuf::from("."))
        });
    let base = name_override
        .map(sanitize_name)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| stem_of(source));
    let candidate = parent.join(&base);

    if paths_are_same(source, &candidate) {
        return Err(ConversionError::Other(format!(
            "refusing to extract over the archive itself: {}",
            source.display()
        )));
    }

    if !candidate.exists() {
        return Ok(OutputDecision::Proceed(candidate));
    }

    if settings.collision_policy == CollisionPolicy::Skip {
        return Ok(OutputDecision::Skipped(candidate));
    }

    for index in 1..=9_999 {
        let alternative = parent.join(format!("{base} ({index})"));
        if !alternative.exists() {
            return Ok(OutputDecision::Proceed(alternative));
        }
    }
    Err(ConversionError::Other(format!(
        "could not find a free destination folder name next to {}",
        source.display()
    )))
}

/// Move a finished temp file onto its planned destination. Engines stage under
/// the app's temp root and only publish once the output has been validated, so a
/// failed job leaves nothing half-written next to the user's files. Falls back
/// to copy + remove when the temp volume and the destination differ.
pub fn commit_file(
    staged: &Path,
    destination: &Path,
    allow_overwrite: bool,
) -> Result<(), ConversionError> {
    crate::utils::limits::ensure_parent_dir(destination)?;
    if destination.is_dir() {
        return Err(ConversionError::Other(format!(
            "{} is a folder, not a file",
            destination.display()
        )));
    }
    if destination.exists() {
        if !allow_overwrite {
            return Err(ConversionError::Other(format!(
                "{} already exists",
                destination.display()
            )));
        }
        std::fs::remove_file(destination).map_err(|error| {
            ConversionError::Other(format!(
                "could not replace {}: {error}",
                destination.display()
            ))
        })?;
    }

    match std::fs::rename(staged, destination) {
        Ok(()) => Ok(()),
        // ERROR_NOT_SAME_DEVICE (17) and cross-volume failures: copy instead.
        Err(_) => {
            std::fs::copy(staged, destination).map_err(|error| {
                ConversionError::Other(format!("could not save {}: {error}", destination.display()))
            })?;
            std::fs::remove_file(staged).ok();
            Ok(())
        }
    }
}

/// A file or folder name the user typed, made safe to join onto a directory.
/// Separators, reserved characters and `..` cannot survive this, so the output
/// stays inside the planned folder.
pub fn sanitize_name(raw: &str) -> String {
    let mut cleaned = raw
        .chars()
        .filter(|character| {
            !matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            )
        })
        .filter(|character| !character.is_control())
        .collect::<String>();
    cleaned = cleaned.trim().trim_matches('.').to_owned();
    // Byte-length truncation would panic mid-way through a multi-byte name.
    cleaned.chars().take(120).collect()
}

/// Compare without caring about `.\` vs `/`, case, or a `\\?\` prefix.
pub fn paths_are_same(left: &Path, right: &Path) -> bool {
    normalize(left) == normalize(right)
}

fn normalize(path: &Path) -> String {
    let text = path
        .to_string_lossy()
        .replace('\\', "/")
        .trim_start_matches(r"\\?\")
        .to_ascii_lowercase();
    text.trim_matches('/').to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_with(mode: OutputDirectoryMode, custom: Option<&str>) -> AppSettings {
        AppSettings {
            output_directory_mode: mode,
            custom_output_directory: custom.map(String::from),
            ..AppSettings::default()
        }
    }

    fn plan_one(
        input: &Path,
        output_format: FormatId,
        settings: &AppSettings,
    ) -> Result<OutputDecision, ConversionError> {
        plan_output_job(&[input], output_format, settings, None, None)
    }

    #[test]
    fn subfolder_mode_is_default_target() {
        let dir = std::env::temp_dir();
        let input = dir.join("photo.jpg");
        let target = target_directory(
            &input,
            &settings_with(OutputDirectoryMode::Subfolder, None),
            None,
        );
        assert_eq!(target, dir.join(SUBFOLDER_NAME));
    }

    #[test]
    fn custom_directory_is_used() {
        let input = std::env::temp_dir().join("photo.jpg");
        let target = target_directory(
            &input,
            &settings_with(OutputDirectoryMode::Custom, Some("D:/out")),
            None,
        );
        assert_eq!(target, PathBuf::from("D:/out"));
    }

    #[test]
    fn custom_mode_without_directory_falls_back_to_source() {
        let input = std::env::temp_dir().join("photo.jpg");
        let target = target_directory(
            &input,
            &settings_with(OutputDirectoryMode::Custom, None),
            None,
        );
        assert_eq!(target, input.parent().unwrap());
    }

    #[test]
    fn per_job_override_beats_the_app_wide_mode() {
        let input = std::env::temp_dir().join("photo.jpg");
        let settings = settings_with(OutputDirectoryMode::Subfolder, None);
        assert_eq!(
            target_directory(&input, &settings, Some(Path::new("E:/elsewhere"))),
            PathBuf::from("E:/elsewhere")
        );
        // An empty picker selection must not redirect the batch into the CWD.
        assert_eq!(
            target_directory(&input, &settings, Some(Path::new(""))),
            input.parent().unwrap().join(SUBFOLDER_NAME)
        );
    }

    #[test]
    fn same_format_same_folder_refuses_to_clobber_source() {
        let dir = std::env::temp_dir();
        let input = dir.join("clobber-me.png");
        let _ = std::fs::remove_file(&input);
        std::fs::write(&input, b"not really a png").unwrap();

        let result = plan_one(
            &input,
            FormatId::Png,
            &settings_with(OutputDirectoryMode::Source, None),
        );
        let error = result.expect_err("writing onto the source must be refused");
        assert!(
            error.to_string().contains("source file"),
            "unexpected message: {error}"
        );
        assert!(input.exists(), "source file must survive the attempt");
        std::fs::remove_file(&input).ok();
    }

    #[test]
    fn overwrite_policy_still_refuses_to_clobber_source() {
        let dir = std::env::temp_dir();
        let input = dir.join("clobber-me-too.png");
        let _ = std::fs::remove_file(&input);
        std::fs::write(&input, b"not really a png").unwrap();

        let mut settings = settings_with(OutputDirectoryMode::Source, None);
        settings.collision_policy = CollisionPolicy::Overwrite;
        let error = plan_one(&input, FormatId::Png, &settings)
            .expect_err("the source file is never a legal target, whatever the policy says");
        assert!(
            error.to_string().contains("source file"),
            "unexpected message: {error}"
        );
        assert_eq!(
            std::fs::read(&input).unwrap(),
            b"not really a png",
            "source bytes must be untouched"
        );
        std::fs::remove_file(&input).ok();
    }

    #[test]
    fn rename_policy_avoids_existing_file() {
        let dir = std::env::temp_dir().join("uc-collision-test");
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("clip.jpg");
        std::fs::write(&input, b"src").unwrap();
        std::fs::write(dir.join("clip.png"), b"taken").unwrap();

        let decision = plan_one(
            &input,
            FormatId::Png,
            &settings_with(OutputDirectoryMode::Source, None),
        )
        .unwrap();
        assert_eq!(
            decision,
            OutputDecision::Proceed(dir.join("clip (1).png")),
            "rename policy should step to the next free name"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn skip_policy_reports_the_existing_path() {
        let dir = std::env::temp_dir().join("uc-skip-test");
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("note.txt");
        std::fs::write(&input, b"src").unwrap();
        std::fs::write(dir.join("note.html"), b"taken").unwrap();

        let mut settings = settings_with(OutputDirectoryMode::Source, None);
        settings.collision_policy = CollisionPolicy::Skip;
        let decision = plan_one(&input, FormatId::Html, &settings).unwrap();
        assert_eq!(decision, OutputDecision::Skipped(dir.join("note.html")));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn path_equality_ignores_separators_and_case() {
        assert!(paths_are_same(
            Path::new(r"C:\Users\Alok\Out.PNG"),
            Path::new("c:/users/alok/out.png")
        ));
        assert!(!paths_are_same(
            Path::new(r"C:\a\out.png"),
            Path::new(r"C:\b\out.png")
        ));
    }

    #[test]
    fn a_chosen_name_replaces_the_first_input_stem() {
        let dir = std::env::temp_dir().join("uc-merge-name-test");
        std::fs::create_dir_all(&dir).unwrap();
        let first = dir.join("cover.png");
        let second = dir.join("body.png");
        std::fs::write(&first, b"a").unwrap();
        std::fs::write(&second, b"b").unwrap();

        let settings = settings_with(OutputDirectoryMode::Source, None);
        let decision = plan_output_job(
            &[first.as_path(), second.as_path()],
            FormatId::Pdf,
            &settings,
            None,
            Some("holiday album"),
        )
        .unwrap();
        assert_eq!(
            decision,
            OutputDecision::Proceed(dir.join("holiday album.pdf")),
            "merge output should use the name the user typed"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_merge_may_not_be_named_onto_any_of_its_sources() {
        let dir = std::env::temp_dir().join("uc-merge-guard-test");
        std::fs::create_dir_all(&dir).unwrap();
        let first = dir.join("a.pdf");
        let second = dir.join("b.pdf");
        std::fs::write(&first, b"a").unwrap();
        std::fs::write(&second, b"b").unwrap();

        let mut settings = settings_with(OutputDirectoryMode::Source, None);
        // Even the most aggressive policy must not clobber the second source.
        settings.collision_policy = CollisionPolicy::Overwrite;
        let error = plan_output_job(
            &[first.as_path(), second.as_path()],
            FormatId::Pdf,
            &settings,
            None,
            Some("b"),
        )
        .expect_err("naming the output after a source file must be refused");
        assert!(
            error.to_string().contains("refusing to overwrite"),
            "unexpected message: {error}"
        );
        assert_eq!(
            std::fs::read(&second).unwrap(),
            b"b",
            "source bytes changed"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn extraction_folder_is_created_next_to_the_archive() {
        let dir = std::env::temp_dir().join("uc-extract-plan-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let archive = dir.join("photos.zip");
        std::fs::write(&archive, b"PK\x03\x04").unwrap();

        let settings = settings_with(OutputDirectoryMode::Source, None);
        let decision = plan_output_directory(&archive, &settings, None, None).unwrap();
        assert_eq!(decision, OutputDecision::Proceed(dir.join("photos")));

        std::fs::create_dir_all(dir.join("photos")).unwrap();
        let decision = plan_output_directory(&archive, &settings, None, None).unwrap();
        assert_eq!(
            decision,
            OutputDecision::Proceed(dir.join("photos (1)")),
            "an existing folder must never be reused"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn compound_archive_stems_drop_every_suffix() {
        assert_eq!(stem_of(Path::new("backup.tar.gz")), "backup");
        assert_eq!(stem_of(Path::new("backup.tar.bz2")), "backup");
        assert_eq!(stem_of(Path::new("backup.tar.xz")), "backup");
        assert_eq!(stem_of(Path::new("backup.zip")), "backup");
    }

    #[test]
    fn extraction_refuses_to_target_the_archive_file() {
        let dir = std::env::temp_dir().join("uc-extract-guard-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let archive = dir.join("photos.zip");
        std::fs::write(&archive, b"PK\x03\x04").unwrap();

        let settings = settings_with(OutputDirectoryMode::Source, None);
        let error = plan_output_directory(&archive, &settings, None, Some("photos.zip"))
            .expect_err("the archive itself is never a destination");
        assert!(error.to_string().contains("archive itself"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_typed_name_cannot_escape_the_output_folder() {
        assert_eq!(
            sanitize_name(r"..\..\Windows\system32\evil"),
            "Windowssystem32evil"
        );
        assert_eq!(sanitize_name("  report:v2  "), "reportv2");
        assert_eq!(sanitize_name("../../etc/passwd"), "etcpasswd");
        assert!(sanitize_name("...").is_empty(), "dots alone are not a name");
        // Truncation counts characters, so a Devanagari name cannot cut a
        // multi-byte code point in half and panic the planner.
        assert_eq!(sanitize_name(&"रिपोर्ट".repeat(40)).chars().count(), 120);
    }
}
