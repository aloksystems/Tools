use crate::error::ConversionError;
use std::path::{Path, PathBuf};

/// Refuses to decode images whose pixel count is large enough to exhaust RAM.
pub const MAX_IMAGE_PIXELS: u64 = 120_000_000;

pub fn check_input_size(path: &Path, max_mb: u64) -> Result<u64, ConversionError> {
    let metadata = std::fs::metadata(path).map_err(|error| ConversionError::Unreadable {
        path: path.display().to_string(),
        reason: error.to_string(),
    })?;
    if !metadata.is_file() {
        return Err(ConversionError::Unreadable {
            path: path.display().to_string(),
            reason: "not a regular file".to_owned(),
        });
    }
    let bytes = metadata.len();
    let limit_bytes = max_mb.saturating_mul(1024 * 1024);
    if bytes > limit_bytes {
        return Err(ConversionError::TooLarge {
            actual_mb: bytes / (1024 * 1024),
            limit_mb: max_mb.max(1),
        });
    }
    Ok(bytes)
}

/// Free bytes on the volume holding `path`. Drives the pre-flight space check.
pub fn free_space_for(path: &Path) -> Option<u64> {
    let mount = existing_ancestor(path)?;
    sysinfo::Disks::new_with_refreshed_list()
        .iter()
        .find(|disk| {
            Path::new(disk.mount_point().to_string_lossy().as_ref()) == mount
                || mount.starts_with(Path::new(disk.mount_point().to_string_lossy().as_ref()))
        })
        .map(|disk| disk.available_space())
}

fn existing_ancestor(path: &Path) -> Option<PathBuf> {
    let mut cursor = Some(path.to_path_buf());
    while let Some(candidate) = cursor {
        if candidate.is_dir() {
            return Some(candidate);
        }
        cursor = candidate.parent().map(Path::to_path_buf);
    }
    None
}

/// Output is guessed at slightly smaller than the input; PDFs and GIFs can blow
/// that up, so the check is a floor, not a promise.
pub fn check_output_space(output_path: &Path, input_bytes: u64) -> Result<(), ConversionError> {
    check_space_for(
        output_path,
        input_bytes.saturating_add(input_bytes / 4).max(64 * 1024),
    )
}

/// Extraction writes declared uncompressed bytes plus a small working margin.
/// The check runs against the destination, not the archive's own drive.
pub fn check_extraction_space(
    destination: &Path,
    declared_bytes: u64,
) -> Result<(), ConversionError> {
    check_space_for(
        destination,
        declared_bytes
            .saturating_add(declared_bytes / 10)
            .max(64 * 1024),
    )
}

fn check_space_for(path: &Path, need: u64) -> Result<(), ConversionError> {
    let Some(free) = free_space_for(path) else {
        return Ok(());
    };
    if free < need {
        let drive = path
            .components()
            .next()
            .map(|component| component.as_os_str().to_string_lossy().into_owned())
            .unwrap_or_else(|| "?".to_owned());
        return Err(ConversionError::DiskSpace {
            drive,
            need_mb: need / (1024 * 1024),
            free_mb: free / (1024 * 1024),
        });
    }
    Ok(())
}

pub fn ensure_parent_dir(path: &Path) -> Result<(), ConversionError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            ConversionError::Other(format!(
                "could not create output folder {}: {error}",
                parent.display()
            ))
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_oversized_input() {
        let dir = std::env::temp_dir();
        let file = dir.join("uc-too-large.bin");
        std::fs::write(&file, [0u8; 4096]).unwrap();
        let error = check_input_size(&file, 0).expect_err("0 MB limit must reject the file");
        assert!(matches!(error, ConversionError::TooLarge { .. }));
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn accepts_within_limit_and_reports_size() {
        let dir = std::env::temp_dir();
        let file = dir.join("uc-ok-size.bin");
        std::fs::write(&file, [7u8; 128]).unwrap();
        let bytes = check_input_size(&file, 1).expect("128 B is under a 1 MB limit");
        assert_eq!(bytes, 128);
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn missing_file_is_unreadable() {
        let error = check_input_size(Path::new("Z:/definitely/not/here.bin"), 10);
        assert!(matches!(error, Err(ConversionError::Unreadable { .. })));
    }

    #[test]
    fn free_space_lookup_survives_unknown_drive() {
        assert!(free_space_for(Path::new("Z:/nope/out.png")).is_none());
    }

    #[test]
    fn creates_parent_directories() {
        let target = std::env::temp_dir().join("uc-parent-test/nested/deep/out.png");
        ensure_parent_dir(&target).unwrap();
        assert!(target.parent().unwrap().is_dir());
        std::fs::remove_dir_all(std::env::temp_dir().join("uc-parent-test")).ok();
    }
}
