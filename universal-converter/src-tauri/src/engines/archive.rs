use super::{
    ConversionEngine, EngineContext, EngineId, EngineInfo, ProgressSink, ScratchDir, checked_cancel,
};
use crate::core::format::{self, FormatId};
use crate::core::job::JobOperation;
use crate::core::settings::{AppSettings, CollisionPolicy};
use crate::error::ConversionError;
use crate::utils::{limits, paths};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

const ENV_KEY: &str = "UC_7ZIP_PATH";
const BUNDLED_DIR: &str = "7zip";
#[cfg(windows)]
const PROGRAM_NAMES: &[&str] = &["7z.exe", "7za.exe", "7zz.exe", "7z"];
#[cfg(not(windows))]
const PROGRAM_NAMES: &[&str] = &["7z", "7zz", "7za"];
const VERSION_TIMEOUT: Duration = Duration::from_secs(15);

/// Archive creation, extraction and repacking via 7-Zip.
///
/// The listing is the security boundary: every entry is validated before a
/// destination is created, extraction happens in a scratch folder, and the
/// extracted tree is checked again before it is moved into place.
pub struct ArchiveEngine;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    pub path: String,
    pub size: u64,
    pub packed_size: u64,
    pub is_directory: bool,
    pub encrypted: bool,
    pub is_link: bool,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveListing {
    pub format: FormatId,
    pub encrypted: bool,
    pub entries: Vec<ArchiveEntry>,
    pub file_count: u64,
    pub total_bytes: u64,
    pub total_packed_bytes: u64,
    pub has_links: bool,
}

/// What this machine's 7-Zip can really do, so the Studio only offers
/// containers that can be written and listings that can be read here.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveCapabilities {
    pub available: bool,
    pub version: Option<String>,
    pub reason: Option<String>,
    pub create_formats: Vec<FormatId>,
    pub extract_formats: Vec<FormatId>,
}

pub fn capabilities() -> ArchiveCapabilities {
    let info = ArchiveEngine.probe();
    ArchiveCapabilities {
        available: info.available,
        version: info.version,
        reason: info.unavailable_reason,
        create_formats: vec![
            FormatId::Zip,
            FormatId::SevenZ,
            FormatId::Tar,
            FormatId::TarGz,
            FormatId::TarBz2,
            FormatId::TarXz,
        ],
        extract_formats: vec![
            FormatId::Zip,
            FormatId::SevenZ,
            FormatId::Tar,
            FormatId::TarGz,
            FormatId::TarBz2,
            FormatId::TarXz,
            FormatId::Gz,
            FormatId::Bz2,
            FormatId::Xz,
            FormatId::Wim,
            FormatId::Cab,
        ],
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ArchiveSettings {
    compression: String,
    method: String,
    preserve_paths: bool,
    solid: bool,
    encrypt_headers: bool,
}

impl Default for ArchiveSettings {
    fn default() -> Self {
        ArchiveSettings {
            compression: "normal".to_owned(),
            method: "auto".to_owned(),
            preserve_paths: true,
            solid: true,
            encrypt_headers: true,
        }
    }
}

impl ArchiveSettings {
    fn level(&self) -> &'static str {
        match self.compression.as_str() {
            "store" => "0",
            "fast" => "1",
            "maximum" => "9",
            _ => "5",
        }
    }

    /// Validates that the chosen method can exist in the chosen container
    /// instead of silently dropping it.
    fn method_for(&self, output: FormatId) -> Result<Option<&'static str>, ConversionError> {
        let method = self.method.trim().to_ascii_lowercase();
        if method.is_empty() || method == "auto" {
            return Ok(None);
        }
        let mapped = match (output, method.as_str()) {
            (FormatId::SevenZ, "lzma2") => Some("LZMA2"),
            (FormatId::SevenZ, "lzma") => Some("LZMA"),
            (FormatId::SevenZ, "ppmd") => Some("PPMd"),
            (FormatId::SevenZ, "bzip2") => Some("BZip2"),
            (FormatId::SevenZ, "copy") => Some("Copy"),
            (FormatId::Zip, "deflate") => Some("Deflate"),
            (FormatId::Zip, "deflate64") => Some("Deflate64"),
            (FormatId::Zip, "bzip2") => Some("BZip2"),
            (FormatId::Zip, "lzma") => Some("LZMA"),
            (FormatId::Zip, "ppmd") => Some("PPMd"),
            (FormatId::Zip, "copy") => Some("Copy"),
            (FormatId::Tar | FormatId::TarGz | FormatId::TarBz2 | FormatId::TarXz, _) => {
                return Err(ConversionError::Other(
                    "TAR containers do not take a compression method; pick TAR.GZ, TAR.BZ2 or \
                     TAR.XZ for compression"
                        .to_owned(),
                ));
            }
            _ => {
                return Err(ConversionError::Other(format!(
                    "{} cannot use the {} compression method",
                    output.label(),
                    self.method
                )));
            }
        };
        Ok(mapped)
    }
}

pub fn locate_7zip() -> Option<PathBuf> {
    sidecar_override_or_bundle()
        .or_else(|| {
            let mut directories = Vec::new();
            for root in super::sidecar::program_files_dirs() {
                directories.push(root.join("7-Zip"));
            }
            super::sidecar::installed_named(&directories, PROGRAM_NAMES)
        })
        .or_else(|| super::sidecar::search_path_named(PROGRAM_NAMES))
}

fn sidecar_override_or_bundle() -> Option<PathBuf> {
    super::sidecar::override_candidate(ENV_KEY, PROGRAM_NAMES)
        .or_else(|| super::sidecar::bundled_named(BUNDLED_DIR, PROGRAM_NAMES))
}

fn version_of(program: &Path) -> Result<String, ConversionError> {
    let output = super::sidecar::run_capturing(program, &["i"], 8 * 1024, VERSION_TIMEOUT)?;
    let version = output
        .lines()
        .find(|line| line.to_ascii_lowercase().contains("7-zip"))
        .or_else(|| output.lines().next())
        .unwrap_or("7-Zip")
        .trim()
        .to_owned();
    Ok(version)
}

impl ConversionEngine for ArchiveEngine {
    fn id(&self) -> EngineId {
        EngineId::Archive
    }

    fn probe(&self) -> EngineInfo {
        let unavailable = |reason: String| EngineInfo {
            id: EngineId::Archive,
            label: EngineId::Archive.label().to_owned(),
            available: false,
            version: None,
            unavailable_reason: Some(reason),
        };
        let Some(program) = locate_7zip() else {
            return unavailable(format!(
                "7-Zip was not found. Install it, set {ENV_KEY} to 7z.exe, or place a copy in \
                 resources/{BUNDLED_DIR}."
            ));
        };
        match version_of(&program) {
            Ok(version) => EngineInfo {
                id: EngineId::Archive,
                label: EngineId::Archive.label().to_owned(),
                available: true,
                version: Some(version),
                unavailable_reason: None,
            },
            Err(error) => unavailable(format!(
                "7-Zip was found at {} but did not start: {error}",
                program.display()
            )),
        }
    }

    fn convert(&self, ctx: &EngineContext) -> Result<u64, ConversionError> {
        let program = locate_7zip().ok_or_else(|| self.probe().unavailable_error())?;
        let timeout = Duration::from_secs(ctx.settings.archive_timeout_seconds.max(1));
        let scratch = ScratchDir::create(ctx.temp_dir, &format!("archive-{}", ctx.job.id))?;

        match ctx.job.operation {
            JobOperation::CreateArchive => {
                let sources: Vec<PathBuf> = ctx
                    .job
                    .inputs
                    .iter()
                    .map(PathBuf::from)
                    .filter(|path| path.exists())
                    .collect();
                if sources.is_empty() {
                    return Err(ConversionError::Unreadable {
                        path: ctx.job.input_path.clone(),
                        reason: "no source file or folder still exists".to_owned(),
                    });
                }
                // Re-scan at execution time; the planner's check must not be the
                // only line between a link and the archive.
                scan_sources(
                    &sources.iter().map(PathBuf::as_path).collect::<Vec<_>>(),
                    ctx.settings,
                )?;
                let settings = parse_archive_settings(ctx.job);
                create_archive(
                    &program,
                    ctx,
                    scratch.path(),
                    &sources,
                    ctx.job.output_format,
                    &settings,
                    ctx.secret,
                    Path::new(&ctx.job.output_path),
                    timeout,
                )
            }
            JobOperation::ExtractArchive => {
                let source = Path::new(&ctx.job.input_path);
                let format = format::detect_from_path(source);
                if !format.is_archive_input() {
                    return Err(ConversionError::Unsupported {
                        input: format.label().to_owned(),
                        output: "archive contents".to_owned(),
                    });
                }
                let listing = inspect(source, ctx.secret, timeout)?;
                validate_listing(source, &listing, ctx.settings)?;
                if listing.encrypted && ctx.secret.is_none() {
                    return Err(ConversionError::NeedsPassword {
                        path: source.display().to_string(),
                    });
                }
                let selection = select_original_paths(&listing, &ctx.job.selected_entries)?;
                let staging = scratch.path().join("extract");
                extract_to_staging(
                    &program,
                    source,
                    format,
                    &staging,
                    ctx.secret,
                    &selection,
                    ctx.cancel,
                    timeout,
                    ctx.progress,
                )?;
                validate_extracted_tree(&staging)?;
                checked_cancel(ctx.cancel)?;
                ctx.progress
                    .report(0.93, "moving extracted files into place");
                let destination = Path::new(&ctx.job.output_path);
                let bytes = commit_directory(&staging, destination)?;
                ctx.progress.report(0.98, "extraction complete");
                Ok(bytes)
            }
            JobOperation::Convert => {
                let source = Path::new(&ctx.job.input_path);
                let input_format = format::detect_from_path(source);
                if !input_format.is_archive_input() || !ctx.job.output_format.is_creatable_archive()
                {
                    return Err(ConversionError::Unsupported {
                        input: input_format.label().to_owned(),
                        output: ctx.job.output_format.label().to_owned(),
                    });
                }
                let listing = inspect(source, ctx.secret, timeout)?;
                validate_listing(source, &listing, ctx.settings)?;
                if listing.encrypted && ctx.secret.is_none() {
                    return Err(ConversionError::NeedsPassword {
                        path: source.display().to_string(),
                    });
                }
                let staging = scratch.path().join("repack");
                extract_to_staging(
                    &program,
                    source,
                    input_format,
                    &staging,
                    ctx.secret,
                    &[],
                    ctx.cancel,
                    timeout,
                    ctx.progress,
                )?;
                validate_extracted_tree(&staging)?;

                let mut sources = Vec::new();
                for entry in std::fs::read_dir(&staging)
                    .map_err(|error| ConversionError::Other(error.to_string()))?
                    .flatten()
                {
                    sources.push(entry.path());
                }
                if sources.is_empty() {
                    return Err(ConversionError::Other(
                        "the archive contains no files to repack".to_owned(),
                    ));
                }
                let settings = ArchiveSettings {
                    // A password supplied here unlocks the input. Repacking does
                    // not silently re-encrypt the output with it.
                    ..parse_archive_settings(ctx.job)
                };
                create_archive(
                    &program,
                    ctx,
                    scratch.path(),
                    &sources,
                    ctx.job.output_format,
                    &settings,
                    None,
                    Path::new(&ctx.job.output_path),
                    timeout,
                )
            }
            // The queue routes OCR to its own engine; reaching 7-Zip with one is
            // a planner bug, and silently extracting nothing would hide it.
            JobOperation::Ocr => Err(ConversionError::Unsupported {
                input: ctx.job.input_format.label().to_owned(),
                output: ctx.job.output_format.label().to_owned(),
            }),
        }
    }

    fn is_heavy_job(&self, job: &crate::core::job::ConversionJob) -> bool {
        job.operation == JobOperation::CreateArchive || job.output_format == FormatId::SevenZ
    }
}

fn parse_archive_settings(job: &crate::core::job::ConversionJob) -> ArchiveSettings {
    super::parse_settings(&job.settings, ArchiveSettings::default())
}

/// Explicit, bounded scan used before creation. Rejects links and junctions so
/// an archive can never pull in a target outside the chosen folder.
pub struct SourceScan {
    pub bytes: u64,
    pub files: u64,
}

pub fn scan_sources(
    sources: &[&Path],
    settings: &AppSettings,
) -> Result<SourceScan, ConversionError> {
    let max_bytes = settings.max_input_mb.saturating_mul(1024 * 1024);
    let max_files = settings.max_extraction_files.max(1);
    let mut scan = SourceScan { bytes: 0, files: 0 };

    for source in sources {
        let metadata =
            std::fs::symlink_metadata(source).map_err(|error| ConversionError::Unreadable {
                path: source.display().to_string(),
                reason: error.to_string(),
            })?;
        if is_link_like(source, &metadata) {
            return Err(ConversionError::ArchiveSecurity {
                path: source.display().to_string(),
                reason: "symbolic links, junctions and reparse points are not archived".to_owned(),
            });
        }
        if metadata.is_file() {
            add_file(&mut scan, metadata.len(), source, max_bytes, max_files)?;
        } else if metadata.is_dir() {
            scan_directory(source, &mut scan, max_bytes, max_files)?;
        } else {
            return Err(ConversionError::Unreadable {
                path: source.display().to_string(),
                reason: "not a regular file or folder".to_owned(),
            });
        }
    }
    Ok(scan)
}

fn scan_directory(
    directory: &Path,
    scan: &mut SourceScan,
    max_bytes: u64,
    max_files: u64,
) -> Result<(), ConversionError> {
    let entries = std::fs::read_dir(directory).map_err(|error| ConversionError::Unreadable {
        path: directory.display().to_string(),
        reason: error.to_string(),
    })?;
    for entry in entries.flatten() {
        let path = entry.path();
        let metadata =
            std::fs::symlink_metadata(&path).map_err(|error| ConversionError::Unreadable {
                path: path.display().to_string(),
                reason: error.to_string(),
            })?;
        if is_link_like(&path, &metadata) {
            return Err(ConversionError::ArchiveSecurity {
                path: path.display().to_string(),
                reason: "the folder contains a symbolic link, junction or reparse point".to_owned(),
            });
        }
        if metadata.is_dir() {
            scan_directory(&path, scan, max_bytes, max_files)?;
        } else if metadata.is_file() {
            add_file(scan, metadata.len(), &path, max_bytes, max_files)?;
        }
    }
    Ok(())
}

fn add_file(
    scan: &mut SourceScan,
    bytes: u64,
    path: &Path,
    max_bytes: u64,
    max_files: u64,
) -> Result<(), ConversionError> {
    scan.files += 1;
    scan.bytes = scan.bytes.saturating_add(bytes);
    if scan.bytes > max_bytes {
        return Err(ConversionError::TooLarge {
            actual_mb: scan.bytes / (1024 * 1024),
            limit_mb: (max_bytes / (1024 * 1024)).max(1),
        });
    }
    if scan.files > max_files {
        return Err(ConversionError::ArchiveLimit {
            path: path.display().to_string(),
            detail: format!("more than {max_files} files"),
        });
    }
    Ok(())
}

#[cfg(windows)]
fn is_link_like(_path: &Path, metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_type().is_symlink()
        || (metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0
}

#[cfg(not(windows))]
fn is_link_like(_path: &Path, metadata: &std::fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[allow(clippy::too_many_arguments)]
fn create_archive(
    program: &Path,
    ctx: &EngineContext,
    scratch: &Path,
    sources: &[PathBuf],
    output_format: FormatId,
    settings: &ArchiveSettings,
    password: Option<&str>,
    destination: &Path,
    timeout: Duration,
) -> Result<u64, ConversionError> {
    if password.is_some()
        && matches!(
            output_format,
            FormatId::Tar | FormatId::TarGz | FormatId::TarBz2 | FormatId::TarXz
        )
    {
        return Err(ConversionError::Other(
            "TAR, TAR.GZ, TAR.BZ2 and TAR.XZ cannot be password-protected; choose ZIP or 7Z"
                .to_owned(),
        ));
    }
    settings.method_for(output_format)?;

    let extension = output_format.extension();
    let staged = scratch.join(format!("result.{extension}"));
    match output_format {
        FormatId::TarGz | FormatId::TarBz2 | FormatId::TarXz => {
            let tar = scratch.join("stage.tar");
            create_one(
                program,
                ctx,
                &tar,
                FormatId::Tar,
                sources,
                settings,
                None,
                timeout,
                0.05,
                0.45,
            )?;
            let compressor = match output_format {
                FormatId::TarGz => "gzip",
                FormatId::TarBz2 => "bzip2",
                _ => "xz",
            };
            ctx.progress.report(0.55, "compressing the TAR archive");
            run_7zip(
                program,
                &[
                    "a".to_owned(),
                    "-y".to_owned(),
                    "-t".to_owned() + compressor,
                    format!("-mx={}", settings.level()),
                    "-bsp1".to_owned(),
                    "-bso0".to_owned(),
                    staged.to_string_lossy().into_owned(),
                    tar.to_string_lossy().into_owned(),
                ],
                None,
                ctx.cancel,
                timeout,
                ctx.progress,
                0.55,
                0.85,
            )?;
            let _ = std::fs::remove_file(&tar);
        }
        _ => {
            create_one(
                program,
                ctx,
                &staged,
                output_format,
                sources,
                settings,
                password,
                timeout,
                0.05,
                0.8,
            )?;
        }
    }

    ctx.progress.report(0.88, "test-reading the new archive");
    test_archive(program, &staged, password, ctx.cancel, timeout)?;
    if !has_archive_signature(&staged, output_format) {
        return Err(ConversionError::InvalidOutput {
            path: destination.display().to_string(),
        });
    }

    // Never let the archive land on a source file.
    for source in sources {
        if paths::paths_are_same(source, destination) {
            return Err(ConversionError::Other(format!(
                "refusing to overwrite the source file {}",
                source.display()
            )));
        }
    }
    let allow_overwrite = ctx.settings.collision_policy == CollisionPolicy::Overwrite;
    paths::commit_file(&staged, destination, allow_overwrite)?;
    ctx.progress.report(0.97, "archive saved");
    std::fs::metadata(destination)
        .map(|meta| meta.len())
        .map_err(|_| ConversionError::InvalidOutput {
            path: destination.display().to_string(),
        })
}

#[allow(clippy::too_many_arguments)]
fn create_one(
    program: &Path,
    ctx: &EngineContext,
    archive: &Path,
    output_format: FormatId,
    sources: &[PathBuf],
    settings: &ArchiveSettings,
    password: Option<&str>,
    timeout: Duration,
    progress_from: f64,
    progress_to: f64,
) -> Result<(), ConversionError> {
    let type_flag = match output_format {
        FormatId::Zip => "-tzip",
        FormatId::SevenZ => "-t7z",
        FormatId::Tar => "-ttar",
        _ => {
            return Err(ConversionError::Unsupported {
                input: "files and folders".to_owned(),
                output: output_format.label().to_owned(),
            });
        }
    };
    let mut base = vec![
        "a".to_owned(),
        "-y".to_owned(),
        type_flag.to_owned(),
        format!("-mx={}", settings.level()),
        "-bsp1".to_owned(),
        "-bso0".to_owned(),
        archive.to_string_lossy().into_owned(),
    ];
    if let Some(method) = settings.method_for(output_format)? {
        base.push(format!("-m0={method}"));
    }
    if let Some(password) = password.filter(|value| !value.is_empty()) {
        base.push(format!("-p{password}"));
        match output_format {
            FormatId::SevenZ => {
                base.push(format!(
                    "-mhe={}",
                    if settings.encrypt_headers {
                        "on"
                    } else {
                        "off"
                    }
                ));
            }
            FormatId::Zip => base.push("-mem=AES256".to_owned()),
            _ => {}
        }
    }
    if output_format == FormatId::SevenZ {
        base.push(format!("-ms={}", if settings.solid { "on" } else { "off" }));
    }

    if settings.preserve_paths {
        let canonical = canonical_sources(sources)?;
        let parent = common_parent(&canonical).ok_or_else(|| {
            ConversionError::Other(
                "chosen files and folders must be on the same drive to keep their folders"
                    .to_owned(),
            )
        })?;
        let mut args = base;
        for source in &canonical {
            let relative = source.strip_prefix(&parent).map_err(|_| {
                ConversionError::Other("could not compute a relative archive path".to_owned())
            })?;
            if !relative.as_os_str().is_empty() {
                args.push(relative.to_string_lossy().into_owned());
            }
        }
        run_7zip(
            program,
            &args,
            Some(&parent),
            ctx.cancel,
            timeout,
            ctx.progress,
            progress_from,
            progress_to,
        )?;
        return Ok(());
    }

    // Flatten mode: each source is added from its own parent, and a directory
    // contributes its children rather than itself.
    let mut seen: HashSet<String> = HashSet::new();
    let mut calls: Vec<(PathBuf, Vec<String>)> = Vec::new();
    for source in sources {
        let canonical =
            std::fs::canonicalize(source).map_err(|error| ConversionError::Unreadable {
                path: source.display().to_string(),
                reason: error.to_string(),
            })?;
        if canonical.is_dir() {
            let mut names = Vec::new();
            for child in std::fs::read_dir(&canonical)
                .map_err(|error| ConversionError::Other(error.to_string()))?
                .flatten()
            {
                let name = child.file_name().to_string_lossy().into_owned();
                if !seen.insert(name.to_ascii_lowercase()) {
                    return Err(ConversionError::Other(format!(
                        "flattening would create two entries named {name}; rename one or keep folders"
                    )));
                }
                names.push(name);
            }
            if !names.is_empty() {
                calls.push((canonical, names));
            }
        } else {
            let name = canonical
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .ok_or_else(|| ConversionError::Other("a source has no file name".to_owned()))?;
            if !seen.insert(name.to_ascii_lowercase()) {
                return Err(ConversionError::Other(format!(
                    "flattening would create two entries named {name}; rename one or keep folders"
                )));
            }
            let parent = canonical.parent().unwrap_or_else(|| Path::new("."));
            calls.push((parent.to_path_buf(), vec![name]));
        }
    }
    let total = calls.len().max(1) as f64;
    for (index, (directory, names)) in calls.iter().enumerate() {
        let mut args = base.clone();
        args.extend(names.iter().cloned());
        let from = progress_from + (progress_to - progress_from) * (index as f64 / total);
        let to = progress_from + (progress_to - progress_from) * ((index + 1) as f64 / total);
        run_7zip(
            program,
            &args,
            Some(directory),
            ctx.cancel,
            timeout,
            ctx.progress,
            from,
            to,
        )?;
    }
    Ok(())
}

fn canonical_sources(sources: &[PathBuf]) -> Result<Vec<PathBuf>, ConversionError> {
    sources
        .iter()
        .map(|source| {
            std::fs::canonicalize(source).map_err(|error| ConversionError::Unreadable {
                path: source.display().to_string(),
                reason: error.to_string(),
            })
        })
        .collect()
}

fn common_parent(paths: &[PathBuf]) -> Option<PathBuf> {
    let mut parents = paths.iter().map(|path| {
        path.parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| path.clone())
    });
    let mut common = parents.next()?;
    for parent in parents {
        while !parent.starts_with(&common) {
            if !common.pop() {
                return None;
            }
        }
    }
    Some(common)
}

fn test_archive(
    program: &Path,
    archive: &Path,
    password: Option<&str>,
    cancel: &super::CancellationToken,
    timeout: Duration,
) -> Result<(), ConversionError> {
    let mut args = vec!["t".to_owned(), "-bso0".to_owned(), "-bse1".to_owned()];
    if let Some(password) = password.filter(|value| !value.is_empty()) {
        args.push(format!("-p{password}"));
    }
    args.push(archive.to_string_lossy().into_owned());
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut sidecar = super::sidecar::Sidecar::start(program, &refs)?;
    let info = sidecar.wait_info(cancel, timeout)?;
    if info.success {
        return Ok(());
    }
    Err(map_7zip_failure(archive, &info.stderr, password.is_some()))
}

fn has_archive_signature(path: &Path, expected: FormatId) -> bool {
    let mut buffer = [0u8; 512];
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let read = file.read(&mut buffer).unwrap_or(0);
    let head = &buffer[..read];
    match expected {
        FormatId::Zip => head.starts_with(b"PK\x03\x04") || head.starts_with(b"PK\x05\x06"),
        FormatId::SevenZ => head.starts_with(b"7z\xBC\xAF\x27\x1C"),
        FormatId::Tar => head.len() >= 262 && &head[257..262] == b"ustar",
        FormatId::TarGz => head.starts_with(b"\x1F\x8B"),
        FormatId::TarBz2 => head.starts_with(b"BZh"),
        FormatId::TarXz => head.starts_with(b"\xFD7zXZ\x00"),
        _ => false,
    }
}

/// Runs 7-Zip with argv only. `current_dir` exists because archive paths are
/// stored relative to it. Progress comes from `-bsp1` on stdout.
#[allow(clippy::too_many_arguments)]
fn run_7zip(
    program: &Path,
    args: &[String],
    current_dir: Option<&Path>,
    cancel: &super::CancellationToken,
    timeout: Duration,
    progress: &dyn ProgressSink,
    from: f64,
    to: f64,
) -> Result<(), ConversionError> {
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut sidecar = super::sidecar::Sidecar::start_streaming(program, &refs, current_dir)?;
    let info = sidecar.wait_streaming(cancel, timeout, &|line: &str| {
        if let Some(percent) = parse_percent(line) {
            let fraction = from + (to - from) * (percent / 100.0);
            progress.report(fraction.min(to), "compressing");
        }
    })?;
    if info.success {
        Ok(())
    } else {
        let path = args
            .iter()
            .find(|argument| !argument.starts_with('-'))
            .map(PathBuf::from)
            .unwrap_or_default();
        Err(map_7zip_failure(&path, &info.stderr, false))
    }
}

fn parse_percent(line: &str) -> Option<f64> {
    let percent = line.find('%')?;
    let digits: String = line[..percent]
        .chars()
        .rev()
        .take_while(|character| character.is_ascii_digit() || *character == ' ')
        .filter(|character| character.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    digits.parse::<f64>().ok().filter(|value| *value <= 100.0)
}

pub fn inspect(
    path: &Path,
    password: Option<&str>,
    timeout: Duration,
) -> Result<ArchiveListing, ConversionError> {
    let program = locate_7zip().ok_or_else(|| ConversionError::EngineUnavailable {
        engine: EngineId::Archive.label().to_owned(),
        reason: format!(
            "7-Zip was not found; set {ENV_KEY} or place it in resources/{BUNDLED_DIR}."
        ),
    })?;
    let format = format::detect_from_path(path);
    if !format.is_archive_input() {
        return Err(ConversionError::Unsupported {
            input: format.label().to_owned(),
            output: "archive contents".to_owned(),
        });
    }

    // TAR.GZ and friends expose one inner TAR entry. Listing the TAR itself
    // gives the content browser the paths a user actually wants to select.
    if matches!(format, FormatId::TarGz | FormatId::TarBz2 | FormatId::TarXz) {
        let scratch = ScratchDir::create(
            &std::env::temp_dir(),
            &format!("uc-inspect-{}", uuid::Uuid::new_v4()),
        )?;
        let inner = decompress_outer(&program, path, scratch.path(), timeout)?;
        if !is_tar_file(&inner) {
            return Err(ConversionError::Corrupt {
                path: path.display().to_string(),
            });
        }
        let mut listing = raw_listing(&program, &inner, None, timeout)?;
        listing.format = format;
        return Ok(listing);
    }

    let listing = raw_listing(&program, path, password, timeout)?;
    // A `.gz`/`.bz2`/`.xz` may wrap a TAR without saying so in its name.
    if matches!(format, FormatId::Gz | FormatId::Bz2 | FormatId::Xz)
        && listing
            .entries
            .iter()
            .filter(|entry| !entry.is_directory)
            .count()
            == 1
    {
        let scratch = ScratchDir::create(
            &std::env::temp_dir(),
            &format!("uc-inspect-{}", uuid::Uuid::new_v4()),
        )?;
        if let Ok(inner) = decompress_outer(&program, path, scratch.path(), timeout)
            && is_tar_file(&inner)
        {
            let mut inner_listing = raw_listing(&program, &inner, None, timeout)?;
            inner_listing.format = format;
            return Ok(inner_listing);
        }
    }
    Ok(listing)
}

fn raw_listing(
    program: &Path,
    archive: &Path,
    password: Option<&str>,
    timeout: Duration,
) -> Result<ArchiveListing, ConversionError> {
    let mut args = vec![
        "l".to_owned(),
        "-slt".to_owned(),
        "-sccUTF-8".to_owned(),
        "-bd".to_owned(),
    ];
    if let Some(password) = password.filter(|value| !value.is_empty()) {
        args.push(format!("-p{password}"));
    }
    args.push(archive.to_string_lossy().into_owned());
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    match super::sidecar::capture(program, &refs, 64 * 1024 * 1024, timeout) {
        Ok(captured) if captured.status.success() => {
            let stdout = String::from_utf8_lossy(&captured.stdout);
            parse_listing(&stdout, archive)
        }
        Ok(captured) => Err(map_7zip_failure(
            archive,
            &captured.stderr,
            password.is_some(),
        )),
        Err(ConversionError::Timeout { .. }) => Err(ConversionError::Timeout {
            seconds: timeout.as_secs().max(1),
        }),
        Err(error) => Err(error),
    }
}

fn parse_listing(text: &str, archive: &Path) -> Result<ArchiveListing, ConversionError> {
    let mut entries: Vec<ArchiveEntry> = Vec::new();
    let mut current: Option<std::collections::HashMap<String, String>> = None;
    let mut in_entries = false;

    for line in text.lines() {
        if !in_entries {
            if line.trim_start().starts_with("----------") {
                in_entries = true;
            }
            continue;
        }
        if let Some(value) = line.strip_prefix("Path = ") {
            if let Some(fields) = current.take() {
                entries.push(entry_from_fields(&fields));
            }
            let mut fields = std::collections::HashMap::new();
            fields.insert("Path".to_owned(), value.to_owned());
            current = Some(fields);
        } else if let Some((key, value)) = line.split_once(" = ")
            && let Some(fields) = current.as_mut()
        {
            fields.insert(key.trim().to_owned(), value.trim().to_owned());
        }
    }
    if let Some(fields) = current.take() {
        entries.push(entry_from_fields(&fields));
    }

    if !in_entries {
        return Err(ConversionError::Corrupt {
            path: archive.display().to_string(),
        });
    }
    let encrypted = entries.iter().any(|entry| entry.encrypted);
    let has_links = entries.iter().any(|entry| entry.is_link);
    let file_count = entries.iter().filter(|entry| !entry.is_directory).count() as u64;
    let total_bytes = entries
        .iter()
        .filter(|entry| !entry.is_directory)
        .map(|entry| entry.size)
        .sum();
    let total_packed_bytes = entries
        .iter()
        .filter(|entry| !entry.is_directory)
        .map(|entry| entry.packed_size)
        .sum();

    Ok(ArchiveListing {
        format: format::detect_from_path(archive),
        encrypted,
        entries,
        file_count,
        total_bytes,
        total_packed_bytes,
        has_links,
    })
}

fn entry_from_fields(fields: &std::collections::HashMap<String, String>) -> ArchiveEntry {
    let is_directory = fields
        .get("Folder")
        .is_some_and(|value| value.trim() == "+");
    let path = fields.get("Path").cloned().unwrap_or_default();
    // 7-Zip emits `Symbolic Link = ` and `Hard Link = ` keys for every TAR
    // entry, so only a non-empty target actually marks a link.
    let is_link = ["Symbolic Link", "Hard Link"].iter().any(|key| {
        fields
            .get(*key)
            .is_some_and(|value| !value.trim().is_empty())
    }) || fields
        .get("Attributes")
        .is_some_and(|value| value.to_ascii_lowercase().contains("lrwx"));
    ArchiveEntry {
        path,
        size: fields
            .get("Size")
            .and_then(|value| value.parse().ok())
            .unwrap_or(0),
        packed_size: fields
            .get("Packed Size")
            .and_then(|value| value.parse().ok())
            .unwrap_or(0),
        is_directory,
        encrypted: fields
            .get("Encrypted")
            .is_some_and(|value| value.trim() == "+"),
        is_link,
        modified: fields
            .get("Modified")
            .cloned()
            .filter(|value| !value.is_empty()),
    }
}

pub fn validate_listing(
    path: &Path,
    listing: &ArchiveListing,
    settings: &AppSettings,
) -> Result<(), ConversionError> {
    let max_files = settings.max_extraction_files.max(1);
    if listing.file_count > max_files {
        return Err(ConversionError::ArchiveLimit {
            path: path.display().to_string(),
            detail: format!("{} files (limit {max_files})", listing.file_count),
        });
    }
    let max_bytes = settings.max_extraction_mb.saturating_mul(1024 * 1024);
    if listing.total_bytes > max_bytes {
        return Err(ConversionError::ArchiveLimit {
            path: path.display().to_string(),
            detail: format!(
                "{} MiB uncompressed (limit {} MiB)",
                listing.total_bytes / (1024 * 1024),
                settings.max_extraction_mb
            ),
        });
    }
    if listing.has_links {
        return Err(ConversionError::ArchiveSecurity {
            path: path.display().to_string(),
            reason: "the archive contains symbolic or hard links; links are never extracted"
                .to_owned(),
        });
    }

    let mut files: HashSet<String> = HashSet::new();
    for entry in &listing.entries {
        let normalized = normalize_entry_path(&entry.path).map_err(|reason| {
            ConversionError::ArchiveSecurity {
                path: path.display().to_string(),
                reason: format!("entry {} is unsafe: {reason}", entry.path),
            }
        })?;
        // An entry named `..` is rejected by normalize; a file named `folder.txt`
        // next to a directory named `folder.txt` is still a collision on Windows.
        if !entry.is_directory && !files.insert(normalized) {
            return Err(ConversionError::ArchiveSecurity {
                path: path.display().to_string(),
                reason: format!("duplicate entry {}", entry.path),
            });
        }
    }
    Ok(())
}

/// Validates selection paths and maps them back to the exact strings 7-Zip
/// listed. An entry may be a file or a directory (the directory selects its
/// subtree).
pub fn validate_selection(
    path: &Path,
    listing: &ArchiveListing,
    selected: &[String],
) -> Result<(), ConversionError> {
    select_original_paths(listing, selected)
        .map(|_| ())
        .map_err(|_| {
            ConversionError::Other(format!(
                "one or more selected entries are not in {}",
                path.display()
            ))
        })
}

fn select_original_paths(
    listing: &ArchiveListing,
    selected: &[String],
) -> Result<Vec<String>, ConversionError> {
    if selected.is_empty() {
        return Ok(Vec::new());
    }
    let mut map: std::collections::HashMap<String, &str> = std::collections::HashMap::new();
    for entry in &listing.entries {
        if let Ok(normalized) = normalize_entry_path(&entry.path) {
            map.insert(normalized, entry.path.as_str());
        }
    }
    let mut result = Vec::new();
    for selection in selected {
        let normalized = normalize_entry_path(selection)
            .map_err(|_| ConversionError::Other(format!("selected entry {selection} is unsafe")))?;
        let original = map.get(&normalized).ok_or_else(|| {
            ConversionError::Other(format!("selected entry {selection} is not in the archive"))
        })?;
        result.push((*original).to_owned());
    }
    Ok(result)
}

/// Rejects absolute paths, drive letters, `..`, ADS colons, control characters
/// and names Windows would silently rewrite. Returns a lowercase key used for
/// duplicate detection.
pub fn normalize_entry_path(raw: &str) -> Result<String, String> {
    if raw.is_empty() {
        return Err("empty path".to_owned());
    }
    if raw.chars().any(|character| character < ' ') {
        return Err("control character in path".to_owned());
    }
    let text = raw.replace('\\', "/");
    if text.starts_with('/') {
        return Err("absolute path".to_owned());
    }
    let bytes = text.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' {
        return Err("drive-qualified path".to_owned());
    }
    let trimmed = text.trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("empty path".to_owned());
    }
    for segment in trimmed.split('/') {
        if segment.is_empty() {
            return Err("empty path segment".to_owned());
        }
        if segment == "." || segment == ".." {
            return Err("parent or current directory component".to_owned());
        }
        if segment.contains(':') {
            return Err("alternate data stream syntax".to_owned());
        }
        if segment.ends_with('.') || segment.ends_with(' ') {
            return Err("name would be rewritten by Windows".to_owned());
        }
        let stem = segment.split('.').next().unwrap_or(segment);
        let upper = stem.to_ascii_uppercase();
        let reserved = matches!(
            upper.as_str(),
            "CON"
                | "PRN"
                | "AUX"
                | "NUL"
                | "COM1"
                | "COM2"
                | "COM3"
                | "COM4"
                | "COM5"
                | "COM6"
                | "COM7"
                | "COM8"
                | "COM9"
                | "LPT1"
                | "LPT2"
                | "LPT3"
                | "LPT4"
                | "LPT5"
                | "LPT6"
                | "LPT7"
                | "LPT8"
                | "LPT9"
        );
        if reserved {
            return Err(format!("reserved Windows name {segment}"));
        }
    }
    Ok(trimmed.to_ascii_lowercase())
}

fn decompress_outer(
    program: &Path,
    archive: &Path,
    destination: &Path,
    timeout: Duration,
) -> Result<PathBuf, ConversionError> {
    std::fs::create_dir_all(destination).map_err(|error| {
        ConversionError::Other(format!("could not create inspection folder: {error}"))
    })?;
    let args = [
        "x".to_owned(),
        "-y".to_owned(),
        "-bd".to_owned(),
        format!("-o{}", destination.display()),
        archive.to_string_lossy().into_owned(),
    ];
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut sidecar = super::sidecar::Sidecar::start(program, &refs)?;
    let info = sidecar.wait_info(&super::CancellationToken::new(), timeout)?;
    if !info.success {
        return Err(map_7zip_failure(archive, &info.stderr, false));
    }
    let mut files = Vec::new();
    collect_files(destination, &mut files)?;
    files
        .into_iter()
        .find(|file| is_tar_file(file))
        .ok_or_else(|| ConversionError::Corrupt {
            path: archive.display().to_string(),
        })
}

fn collect_files(root: &Path, files: &mut Vec<PathBuf>) -> Result<(), ConversionError> {
    for entry in std::fs::read_dir(root)
        .map_err(|error| ConversionError::Other(error.to_string()))?
        .flatten()
    {
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|error| ConversionError::Other(error.to_string()))?;
        if is_link_like(&path, &metadata) {
            return Err(ConversionError::ArchiveSecurity {
                path: path.display().to_string(),
                reason: "the archive produced a link while being decompressed".to_owned(),
            });
        }
        if metadata.is_dir() {
            collect_files(&path, files)?;
        } else if metadata.is_file() {
            files.push(path);
        }
    }
    Ok(())
}

fn is_tar_file(path: &Path) -> bool {
    let mut buffer = [0u8; 512];
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let read = file.read(&mut buffer).unwrap_or(0);
    read >= 262 && &buffer[257..262] == b"ustar"
}

#[allow(clippy::too_many_arguments)]
fn extract_to_staging(
    program: &Path,
    archive: &Path,
    format: FormatId,
    staging: &Path,
    password: Option<&str>,
    selection: &[String],
    cancel: &super::CancellationToken,
    timeout: Duration,
    progress: &dyn ProgressSink,
) -> Result<(), ConversionError> {
    std::fs::create_dir_all(staging).map_err(|error| {
        ConversionError::Other(format!("could not create extraction folder: {error}"))
    })?;

    if matches!(
        format,
        FormatId::TarGz
            | FormatId::TarBz2
            | FormatId::TarXz
            | FormatId::Gz
            | FormatId::Bz2
            | FormatId::Xz
    ) {
        // The outer stream's payload must never end up inside the folder the
        // user receives: for TAR.GZ that would ship a second copy of the whole
        // archive as `stage.tar`. Keep it beside staging and remove it after.
        let outer = staging.with_file_name(format!(
            "{}-outer",
            staging
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| "extract".to_owned())
        ));
        let _ = std::fs::remove_dir_all(&outer);
        let result = extract_compressed_payload(
            program, archive, staging, &outer, password, selection, cancel, timeout, progress,
        );
        let _ = std::fs::remove_dir_all(&outer);
        return result;
    }

    extract_with_7zip(
        program, archive, staging, password, selection, cancel, timeout, progress, 0.05, 0.9,
    )
}

#[allow(clippy::too_many_arguments)]
fn extract_compressed_payload(
    program: &Path,
    archive: &Path,
    staging: &Path,
    outer: &Path,
    password: Option<&str>,
    selection: &[String],
    cancel: &super::CancellationToken,
    timeout: Duration,
    progress: &dyn ProgressSink,
) -> Result<(), ConversionError> {
    extract_with_7zip(
        program,
        archive,
        outer,
        password,
        &[],
        cancel,
        timeout,
        progress,
        0.05,
        0.45,
    )?;
    let mut files = Vec::new();
    collect_files(outer, &mut files)?;
    let inner_tar = files.into_iter().find(|file| is_tar_file(file));
    if let Some(tar) = inner_tar {
        extract_with_7zip(
            program, &tar, staging, None, selection, cancel, timeout, progress, 0.5, 0.9,
        )?;
        return Ok(());
    }

    // A plain gzip/bzip2/xz stream wraps one file. Move it into place.
    let mut files = Vec::new();
    collect_files(outer, &mut files)?;
    if files.len() != 1 {
        return Err(ConversionError::Corrupt {
            path: archive.display().to_string(),
        });
    }
    let file = &files[0];
    let name = file
        .strip_prefix(outer)
        .unwrap_or(file)
        .to_string_lossy()
        .into_owned();
    if !selection.is_empty() && !selection.iter().any(|selected| selected == &name) {
        return Err(ConversionError::Other(
            "the selected entry is not in this single-file archive".to_owned(),
        ));
    }
    let target =
        staging.join(
            Path::new(&name)
                .file_name()
                .ok_or_else(|| ConversionError::Corrupt {
                    path: archive.display().to_string(),
                })?,
        );
    std::fs::rename(file, &target).or_else(|_| {
        std::fs::copy(file, &target).map(|_| {
            let _ = std::fs::remove_file(file);
        })
    })?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn extract_with_7zip(
    program: &Path,
    archive: &Path,
    destination: &Path,
    password: Option<&str>,
    selection: &[String],
    cancel: &super::CancellationToken,
    timeout: Duration,
    progress: &dyn ProgressSink,
    from: f64,
    to: f64,
) -> Result<(), ConversionError> {
    std::fs::create_dir_all(destination).map_err(|error| {
        ConversionError::Other(format!("could not create extraction folder: {error}"))
    })?;
    let mut args = vec![
        "x".to_owned(),
        "-y".to_owned(),
        "-sccUTF-8".to_owned(),
        "-bd".to_owned(),
        "-bsp1".to_owned(),
        "-bso0".to_owned(),
        format!("-o{}", destination.display()),
    ];
    if let Some(password) = password.filter(|value| !value.is_empty()) {
        args.push(format!("-p{password}"));
    }
    args.push(archive.to_string_lossy().into_owned());
    if !selection.is_empty() {
        args.push("--".to_owned());
        args.extend(selection.iter().cloned());
    }
    run_7zip(program, &args, None, cancel, timeout, progress, from, to).map_err(|error| match error
    {
        ConversionError::Other(message) => map_7zip_failure(archive, &message, password.is_some()),
        other => other,
    })
}

fn map_7zip_failure(archive: &Path, stderr: &str, had_password: bool) -> ConversionError {
    let lower = stderr.to_ascii_lowercase();
    let path = archive.display().to_string();
    if lower.contains("wrong password") {
        return ConversionError::WrongPassword { path };
    }
    if lower.contains("enter password")
        || lower.contains("cannot open encrypted")
        || lower.contains("can not open encrypted")
        || lower.contains("break signaled")
    {
        return if had_password {
            ConversionError::WrongPassword { path }
        } else {
            ConversionError::NeedsPassword { path }
        };
    }
    if lower.contains("is not archive")
        || lower.contains("can not open the file as archive")
        || lower.contains("headers error")
        || lower.contains("data error")
    {
        return ConversionError::Corrupt { path };
    }
    if stderr.trim().is_empty() {
        return ConversionError::Other(format!("7-Zip could not process {path}"));
    }
    let mut detail = stderr.trim().to_owned();
    if detail.chars().count() > 800 {
        detail = detail.chars().take(800).collect::<String>() + "…";
    }
    ConversionError::Other(format!("7-Zip could not process {path}: {detail}"))
}

fn validate_extracted_tree(root: &Path) -> Result<u64, ConversionError> {
    let canonical_root = std::fs::canonicalize(root).map_err(|error| {
        ConversionError::Other(format!("could not read the extraction folder: {error}"))
    })?;
    let mut bytes = 0_u64;
    walk_extracted(root, &canonical_root, &mut bytes)?;
    Ok(bytes)
}

fn walk_extracted(
    root: &Path,
    canonical_root: &Path,
    bytes: &mut u64,
) -> Result<(), ConversionError> {
    for entry in std::fs::read_dir(root)
        .map_err(|error| ConversionError::Other(error.to_string()))?
        .flatten()
    {
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|error| ConversionError::Other(error.to_string()))?;
        if is_link_like(&path, &metadata) {
            return Err(ConversionError::ArchiveSecurity {
                path: path.display().to_string(),
                reason: "extraction produced a link".to_owned(),
            });
        }
        let canonical =
            std::fs::canonicalize(&path).map_err(|error| ConversionError::ArchiveSecurity {
                path: path.display().to_string(),
                reason: format!("could not verify the resolved path: {error}"),
            })?;
        if !canonical.starts_with(canonical_root) {
            return Err(ConversionError::ArchiveSecurity {
                path: path.display().to_string(),
                reason: "resolved outside the extraction folder".to_owned(),
            });
        }
        if metadata.is_dir() {
            walk_extracted(&path, canonical_root, bytes)?;
        } else if metadata.is_file() {
            *bytes = bytes.saturating_add(metadata.len());
        }
    }
    Ok(())
}

fn commit_directory(staging: &Path, destination: &Path) -> Result<u64, ConversionError> {
    if destination.exists() {
        return Err(ConversionError::ArchiveSecurity {
            path: destination.display().to_string(),
            reason: "the destination appeared while extracting; nothing was overwritten".to_owned(),
        });
    }
    limits::ensure_parent_dir(destination)?;

    if std::fs::rename(staging, destination).is_err() {
        // Different volumes: copy the validated tree, then remove the staging
        // copy. The destination did not exist, so no user file can be hit.
        if let Err(error) = copy_tree(staging, destination) {
            let _ = std::fs::remove_dir_all(destination);
            return Err(error);
        }
        let _ = std::fs::remove_dir_all(staging);
    }
    validate_extracted_tree(destination)
}

fn copy_tree(from: &Path, to: &Path) -> Result<(), ConversionError> {
    std::fs::create_dir_all(to).map_err(|error| ConversionError::Other(error.to_string()))?;
    for entry in std::fs::read_dir(from)
        .map_err(|error| ConversionError::Other(error.to_string()))?
        .flatten()
    {
        let source = entry.path();
        let target = to.join(entry.file_name());
        let metadata = std::fs::symlink_metadata(&source)
            .map_err(|error| ConversionError::Other(error.to_string()))?;
        if is_link_like(&source, &metadata) {
            return Err(ConversionError::ArchiveSecurity {
                path: source.display().to_string(),
                reason: "a link appeared during the final copy".to_owned(),
            });
        }
        if metadata.is_dir() {
            copy_tree(&source, &target)?;
        } else if metadata.is_file() {
            std::fs::copy(&source, &target).map_err(|error| {
                ConversionError::Other(format!(
                    "could not move {} into place: {error}",
                    source.display()
                ))
            })?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traversal_and_absolute_paths_are_rejected() {
        for bad in [
            "../escape.txt",
            "..\\escape.txt",
            "/etc/passwd",
            "C:\\Windows\\evil.dll",
            "folder/../../evil",
            "folder/./file",
            "file.txt:stream",
            "trailing.",
            "trailing ",
            "CON",
            "folder/NUL.txt",
            "",
        ] {
            assert!(
                normalize_entry_path(bad).is_err(),
                "{bad:?} should be rejected"
            );
        }
        for good in ["folder/file.txt", "a/b/c.txt", "photo (1).jpg"] {
            assert!(
                normalize_entry_path(good).is_ok(),
                "{good:?} should be accepted"
            );
        }
    }

    #[test]
    fn progress_percentages_are_parsed_without_touching_other_text() {
        assert_eq!(parse_percent(" 42%"), Some(42.0));
        assert_eq!(parse_percent("Progress: 100%"), Some(100.0));
        assert_eq!(parse_percent("Everything is Ok"), None);
    }

    #[test]
    fn settings_methods_are_validated_per_container() {
        let mut settings = ArchiveSettings {
            method: "lzma2".to_owned(),
            ..ArchiveSettings::default()
        };
        assert_eq!(
            settings.method_for(FormatId::SevenZ).unwrap(),
            Some("LZMA2")
        );
        assert!(settings.method_for(FormatId::Zip).is_err());
        settings.method = "deflate".to_owned();
        assert_eq!(settings.method_for(FormatId::Zip).unwrap(), Some("Deflate"));
        assert!(settings.method_for(FormatId::TarGz).is_err());
    }

    #[test]
    fn capabilities_advertise_every_supported_archive_format() {
        let caps = capabilities();
        for format in [
            FormatId::Zip,
            FormatId::SevenZ,
            FormatId::Tar,
            FormatId::TarGz,
            FormatId::TarBz2,
            FormatId::TarXz,
            FormatId::Gz,
            FormatId::Bz2,
            FormatId::Xz,
            FormatId::Wim,
            FormatId::Cab,
        ] {
            assert!(
                caps.extract_formats.contains(&format),
                "{format:?} is extractable but not advertised"
            );
        }
        for format in [
            FormatId::Zip,
            FormatId::SevenZ,
            FormatId::Tar,
            FormatId::TarGz,
            FormatId::TarBz2,
            FormatId::TarXz,
        ] {
            assert!(
                caps.create_formats.contains(&format),
                "{format:?} is creatable but not advertised"
            );
        }
    }

    #[test]
    fn a_duplicate_listing_entry_is_refused() {
        let listing = ArchiveListing {
            format: FormatId::Zip,
            encrypted: false,
            entries: vec![
                ArchiveEntry {
                    path: "a.txt".to_owned(),
                    size: 1,
                    packed_size: 1,
                    is_directory: false,
                    encrypted: false,
                    is_link: false,
                    modified: None,
                },
                ArchiveEntry {
                    path: "A.TXT".to_owned(),
                    size: 1,
                    packed_size: 1,
                    is_directory: false,
                    encrypted: false,
                    is_link: false,
                    modified: None,
                },
            ],
            file_count: 2,
            total_bytes: 2,
            total_packed_bytes: 2,
            has_links: false,
        };
        let settings = AppSettings::default();
        let error = validate_listing(Path::new("dupe.zip"), &listing, &settings)
            .expect_err("case-insensitive duplicates collide on Windows");
        assert!(matches!(error, ConversionError::ArchiveSecurity { .. }));
    }

    #[test]
    fn limits_are_checked_from_the_declared_listing() {
        let settings = AppSettings {
            max_extraction_files: 1,
            ..AppSettings::default()
        };
        let listing = ArchiveListing {
            format: FormatId::Zip,
            encrypted: false,
            entries: (0..3)
                .map(|index| ArchiveEntry {
                    path: format!("f{index}.txt"),
                    size: 1,
                    packed_size: 1,
                    is_directory: false,
                    encrypted: false,
                    is_link: false,
                    modified: None,
                })
                .collect(),
            file_count: 3,
            total_bytes: 3,
            total_packed_bytes: 3,
            has_links: false,
        };
        let error = validate_listing(Path::new("many.zip"), &listing, &settings)
            .expect_err("three files exceed a one-file ceiling");
        assert!(matches!(error, ConversionError::ArchiveLimit { .. }));
    }

    use crate::core::job::{ConversionJob, JobOperation, JobRequest, JobStatus};
    use crate::engines::{CancellationToken, EngineContext, NullProgress};

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join(name)
    }

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("uc-arc-{label}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch folder");
        dir
    }

    fn build_job(
        inputs: &[&Path],
        output: &Path,
        output_format: FormatId,
        operation: JobOperation,
        settings: serde_json::Value,
        selected_entries: Vec<String>,
    ) -> ConversionJob {
        let request = JobRequest {
            input_path: inputs[0].to_string_lossy().into_owned(),
            output_format,
            operation,
            settings,
            output_directory: None,
            extra_inputs: inputs[1..]
                .iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect(),
            output_name: None,
            selected_entries,
            password: None,
        };
        let mut job = ConversionJob::new(
            &request,
            FormatId::Unknown,
            EngineId::Archive,
            output.to_path_buf(),
            0,
        );
        job.status = JobStatus::Processing;
        job
    }

    fn run_archive(
        job: &ConversionJob,
        temp_dir: &Path,
        cancel: &CancellationToken,
        secret: Option<&str>,
        app: &AppSettings,
    ) -> Result<u64, ConversionError> {
        ArchiveEngine.convert(&EngineContext {
            job,
            temp_dir,
            progress: &NullProgress,
            cancel,
            settings: app,
            secret,
        })
    }

    fn timeout() -> Duration {
        Duration::from_secs(120)
    }

    #[test]
    fn zip_created_by_the_engine_round_trips_through_extraction() {
        let dir = scratch_dir("zip-roundtrip");
        let alpha = dir.join("alpha.txt");
        let beta = dir.join("beta.txt");
        std::fs::write(&alpha, "alpha payload\n").unwrap();
        std::fs::write(&beta, "beta payload\n").unwrap();

        let archive_path = dir.join("bundle.zip");
        let create = build_job(
            &[&alpha, &beta],
            &archive_path,
            FormatId::Zip,
            JobOperation::CreateArchive,
            serde_json::json!({ "compression": "fast", "preservePaths": true }),
            Vec::new(),
        );
        let cancel = CancellationToken::new();
        let app = AppSettings::default();
        let size = run_archive(&create, &dir, &cancel, None, &app).expect("ZIP creation");
        assert!(size > 0);
        assert!(has_archive_signature(&archive_path, FormatId::Zip));

        let listing = inspect(&archive_path, None, timeout()).expect("7-Zip reads its own ZIP");
        assert_eq!(listing.file_count, 2, "listing: {:?}", listing.entries);
        assert_eq!(listing.total_bytes, 27);

        let destination = dir.join("unpacked");
        let extract = build_job(
            &[&archive_path],
            &destination,
            FormatId::Zip,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        run_archive(&extract, &dir, &cancel, None, &app).expect("ZIP extraction");
        assert_eq!(
            std::fs::read_to_string(destination.join("alpha.txt")).unwrap(),
            "alpha payload\n"
        );
        assert_eq!(
            std::fs::read_to_string(destination.join("beta.txt")).unwrap(),
            "beta payload\n"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn tar_gz_extraction_does_not_ship_the_inner_tar() {
        let dir = scratch_dir("targz-roundtrip");
        let source = dir.join("single.txt");
        std::fs::write(&source, "compressed payload\n").unwrap();

        let archive_path = dir.join("single.tar.gz");
        let create = build_job(
            &[&source],
            &archive_path,
            FormatId::TarGz,
            JobOperation::CreateArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        let cancel = CancellationToken::new();
        let app = AppSettings::default();
        run_archive(&create, &dir, &cancel, None, &app).expect("TAR.GZ creation");
        assert!(has_archive_signature(&archive_path, FormatId::TarGz));

        let listing = inspect(&archive_path, None, timeout()).expect("nested TAR listing");
        assert_eq!(listing.file_count, 1, "listing: {:?}", listing.entries);
        assert_eq!(listing.entries[0].path, "single.txt");

        let destination = dir.join("unpacked");
        let extract = build_job(
            &[&archive_path],
            &destination,
            FormatId::TarGz,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        run_archive(&extract, &dir, &cancel, None, &app).expect("TAR.GZ extraction");

        assert_eq!(
            std::fs::read_to_string(destination.join("single.txt")).unwrap(),
            "compressed payload\n"
        );
        let names = std::fs::read_dir(&destination)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert_eq!(
            names,
            vec!["single.txt"],
            "no inner tar or staging folder may escape"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_tar_gz_repacks_into_a_zip_through_staging() {
        let dir = scratch_dir("repack-targz");
        let source = dir.join("payload.txt");
        std::fs::write(&source, "repack payload\n").unwrap();
        let cancel = CancellationToken::new();
        let app = AppSettings::default();

        let tgz = dir.join("bundle.tar.gz");
        let create = build_job(
            &[&source],
            &tgz,
            FormatId::TarGz,
            JobOperation::CreateArchive,
            serde_json::json!({ "compression": "fast" }),
            Vec::new(),
        );
        run_archive(&create, &dir, &cancel, None, &app).expect("TarGz creation");

        let zip_path = dir.join("bundle.zip");
        let repack = build_job(
            &[&tgz],
            &zip_path,
            FormatId::Zip,
            JobOperation::Convert,
            serde_json::Value::Null,
            Vec::new(),
        );
        run_archive(&repack, &dir, &cancel, None, &app).expect("TarGz -> ZIP");

        let listing = inspect(&zip_path, None, timeout()).expect("zip listing");
        assert_eq!(listing.file_count, 1, "entries: {:?}", listing.entries);
        assert_eq!(listing.entries[0].path, "payload.txt");

        let destination = dir.join("repacked");
        let extract = build_job(
            &[&zip_path],
            &destination,
            FormatId::Zip,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        run_archive(&extract, &dir, &cancel, None, &app).expect("repacked ZIP extraction");
        assert_eq!(
            std::fs::read_to_string(destination.join("payload.txt")).unwrap(),
            "repack payload\n"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_selected_entry_extracts_without_its_siblings() {
        let dir = scratch_dir("selection");
        let destination = dir.join("chosen");
        let job = build_job(
            &[&fixture("normal.zip")],
            &destination,
            FormatId::Zip,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            vec!["docs/readme.txt".to_owned()],
        );
        let cancel = CancellationToken::new();
        let app = AppSettings::default();
        run_archive(&job, &dir, &cancel, None, &app).expect("selected extraction");
        assert_eq!(
            std::fs::read_to_string(destination.join("docs/readme.txt")).unwrap(),
            "hello archive\n"
        );
        assert!(!destination.join("photo.bin").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn traversal_absolute_duplicate_and_link_fixtures_are_refused() {
        let dir = scratch_dir("malicious");
        let cancel = CancellationToken::new();
        let app = AppSettings::default();
        for (name, entry) in [
            ("traversal.zip", "inside.txt"),
            ("absolute.zip", "absolute-escape.txt"),
            ("duplicate.zip", "same.txt"),
            ("symlink.zip", "target.txt"),
        ] {
            let archive = fixture(name);
            let destination = dir.join(format!("dest-{name}"));
            let job = build_job(
                &[&archive],
                &destination,
                FormatId::Zip,
                JobOperation::ExtractArchive,
                serde_json::Value::Null,
                Vec::new(),
            );
            let error = run_archive(&job, &dir, &cancel, None, &app)
                .expect_err(&format!("{name} must not extract"));
            assert!(
                matches!(
                    error,
                    ConversionError::ArchiveSecurity { .. } | ConversionError::Corrupt { .. }
                ),
                "{name} produced the wrong error: {error}"
            );
            assert!(!destination.exists(), "{name} created a destination");
            assert!(
                !dir.join(entry).exists(),
                "{name} wrote an entry outside the destination"
            );
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_expansion_bomb_is_refused_from_the_declared_size() {
        let dir = scratch_dir("bomb");
        let archive = fixture("bomb.zip");
        let listing = inspect(&archive, None, timeout()).expect("bomb listing");
        assert_eq!(listing.total_bytes, 5_000_000);

        let app = AppSettings {
            max_extraction_mb: 1,
            ..AppSettings::default()
        };
        let error = validate_listing(&archive, &listing, &app)
            .expect_err("5 MB declared inside a 1 MB ceiling");
        assert!(matches!(error, ConversionError::ArchiveLimit { .. }));

        let destination = dir.join("bomb-out");
        let job = build_job(
            &[&archive],
            &destination,
            FormatId::Zip,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        let cancel = CancellationToken::new();
        let error = run_archive(&job, &dir, &cancel, None, &app)
            .expect_err("the engine must enforce the same ceiling");
        assert!(matches!(error, ConversionError::ArchiveLimit { .. }));
        assert!(!destination.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_malformed_archive_is_corrupt_not_a_crash() {
        let error = inspect(&fixture("malformed.zip"), None, timeout())
            .expect_err("garbage with a ZIP header is not an archive");
        assert!(
            matches!(error, ConversionError::Corrupt { .. }),
            "got {error}"
        );
    }

    #[test]
    fn encrypted_zip_requires_the_right_password_and_extracts_with_it() {
        let dir = scratch_dir("encrypted");
        let archive = fixture("encrypted.zip");
        let cancel = CancellationToken::new();
        let app = AppSettings::default();

        let listing = inspect(&archive, None, timeout()).expect("ZIP listing works encrypted");
        assert!(listing.encrypted);

        let destination = dir.join("no-password");
        let job = build_job(
            &[&archive],
            &destination,
            FormatId::Zip,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        let error = run_archive(&job, &dir, &cancel, None, &app).expect_err("password required");
        assert!(
            matches!(error, ConversionError::NeedsPassword { .. }),
            "got {error}"
        );

        let wrong = dir.join("wrong-password");
        let job = build_job(
            &[&archive],
            &wrong,
            FormatId::Zip,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        let error = run_archive(&job, &dir, &cancel, Some("incorrect"), &app)
            .expect_err("a wrong password must never fall back to extracting");
        assert!(
            matches!(error, ConversionError::WrongPassword { .. }),
            "got {error}"
        );
        assert!(!wrong.exists());

        let destination = dir.join("right-password");
        let job = build_job(
            &[&archive],
            &destination,
            FormatId::Zip,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        run_archive(&job, &dir, &cancel, Some("phase4pass"), &app)
            .expect("correct password extracts");
        assert_eq!(
            std::fs::read_to_string(destination.join("secret.txt")).unwrap(),
            "confidential phase 4 payload\n"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cancelling_extraction_leaves_no_destination_behind() {
        let dir = scratch_dir("cancel");
        let destination = dir.join("never-created");
        let job = build_job(
            &[&fixture("normal.zip")],
            &destination,
            FormatId::Zip,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        let cancel = CancellationToken::new();
        cancel.cancel();
        let app = AppSettings::default();
        let error = run_archive(&job, &dir, &cancel, None, &app)
            .expect_err("a cancelled extraction must not publish a folder");
        assert!(matches!(error, ConversionError::Cancelled), "got {error}");
        assert!(!destination.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn seven_z_creation_round_trips_and_encrypts_headers() {
        let dir = scratch_dir("7z-roundtrip");
        let alpha = dir.join("alpha.txt");
        let beta = dir.join("beta.txt");
        std::fs::write(&alpha, "alpha payload\n").unwrap();
        std::fs::write(&beta, "beta payload\n").unwrap();

        let archive_path = dir.join("bundle.7z");
        let create = build_job(
            &[&alpha, &beta],
            &archive_path,
            FormatId::SevenZ,
            JobOperation::CreateArchive,
            serde_json::json!({ "compression": "maximum", "encryptHeaders": true }),
            Vec::new(),
        );
        let cancel = CancellationToken::new();
        let app = AppSettings::default();
        run_archive(&create, &dir, &cancel, Some("archivepass"), &app)
            .expect("encrypted 7Z creation");
        assert!(has_archive_signature(&archive_path, FormatId::SevenZ));
        assert!(
            inspect(&archive_path, None, timeout()).is_err(),
            "header-encrypted 7Z must not be readable without the password"
        );

        let listing = inspect(&archive_path, Some("archivepass"), timeout())
            .expect("7-Zip reads its own 7Z with the password");
        assert_eq!(listing.file_count, 2, "listing: {:?}", listing.entries);
        assert!(listing.encrypted);

        let destination = dir.join("unpacked");
        let extract = build_job(
            &[&archive_path],
            &destination,
            FormatId::SevenZ,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        run_archive(&extract, &dir, &cancel, Some("archivepass"), &app).expect("7Z extraction");
        assert_eq!(
            std::fs::read_to_string(destination.join("alpha.txt")).unwrap(),
            "alpha payload\n"
        );
        assert_eq!(
            std::fs::read_to_string(destination.join("beta.txt")).unwrap(),
            "beta payload\n"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn tar_bz2_and_tar_xz_are_created_with_their_own_signatures() {
        let dir = scratch_dir("tar-variants");
        let source = dir.join("payload.txt");
        std::fs::write(&source, "variant payload\n").unwrap();
        let cancel = CancellationToken::new();
        let app = AppSettings::default();

        for (format, name) in [
            (FormatId::TarBz2, "bundle.tar.bz2"),
            (FormatId::TarXz, "bundle.tar.xz"),
        ] {
            let archive_path = dir.join(name);
            let job = build_job(
                &[&source],
                &archive_path,
                format,
                JobOperation::CreateArchive,
                serde_json::json!({ "compression": "fast" }),
                Vec::new(),
            );
            run_archive(&job, &dir, &cancel, None, &app)
                .unwrap_or_else(|error| panic!("{name} creation: {error}"));
            assert!(
                has_archive_signature(&archive_path, format),
                "{name} signature"
            );
            let listing = inspect(&archive_path, None, timeout())
                .unwrap_or_else(|error| panic!("{name} listing: {error}"));
            assert_eq!(listing.file_count, 1, "{name}: {:?}", listing.entries);
            assert_eq!(listing.entries[0].path, "payload.txt");

            let destination = dir.join(format!("unpacked-{name}").replace('.', "_"));
            let extract = build_job(
                &[&archive_path],
                &destination,
                format,
                JobOperation::ExtractArchive,
                serde_json::Value::Null,
                Vec::new(),
            );
            run_archive(&extract, &dir, &cancel, None, &app)
                .unwrap_or_else(|error| panic!("{name} extraction: {error}"));
            assert_eq!(
                std::fs::read_to_string(destination.join("payload.txt")).unwrap(),
                "variant payload\n"
            );
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn tar_creation_keeps_a_folder_tree() {
        let dir = scratch_dir("folder-tree");
        let folder = dir.join("docs");
        std::fs::create_dir_all(folder.join("nested")).unwrap();
        std::fs::write(folder.join("readme.txt"), "top\n").unwrap();
        std::fs::write(folder.join("nested/deep.txt"), "deep\n").unwrap();

        let archive_path = dir.join("docs.tar");
        let create = build_job(
            &[&folder],
            &archive_path,
            FormatId::Tar,
            JobOperation::CreateArchive,
            serde_json::json!({ "preservePaths": true }),
            Vec::new(),
        );
        let cancel = CancellationToken::new();
        let app = AppSettings::default();
        run_archive(&create, &dir, &cancel, None, &app).expect("TAR creation");
        assert!(has_archive_signature(&archive_path, FormatId::Tar));

        let listing = inspect(&archive_path, None, timeout()).expect("TAR listing");
        let paths = listing
            .entries
            .iter()
            .filter(|entry| !entry.is_directory)
            .map(|entry| entry.path.replace('\\', "/"))
            .collect::<Vec<_>>();
        assert!(
            paths.contains(&"docs/readme.txt".to_owned()),
            "paths: {paths:?}"
        );
        assert!(
            paths.contains(&"docs/nested/deep.txt".to_owned()),
            "paths: {paths:?}"
        );

        let destination = dir.join("unpacked");
        let extract = build_job(
            &[&archive_path],
            &destination,
            FormatId::Tar,
            JobOperation::ExtractArchive,
            serde_json::Value::Null,
            Vec::new(),
        );
        run_archive(&extract, &dir, &cancel, None, &app).expect("TAR extraction");
        assert_eq!(
            std::fs::read_to_string(destination.join("docs/nested/deep.txt")).unwrap(),
            "deep\n"
        );
        std::fs::remove_dir_all(&dir).ok();
    }
}
