use crate::core::format::{self, FormatId};
use crate::error::ConversionError;
use digest::Digest;
use md5::Md5;
use serde::Serialize;
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const CHUNK: usize = 1024 * 1024;
const HEX_MAGIC: usize = 24;

const KNOWN_FORMATS: [FormatId; 51] = [
    FormatId::Jpeg,
    FormatId::Png,
    FormatId::Webp,
    FormatId::Avif,
    FormatId::Bmp,
    FormatId::Tiff,
    FormatId::Gif,
    FormatId::Ico,
    FormatId::Svg,
    FormatId::Heic,
    FormatId::Pdf,
    FormatId::Docx,
    FormatId::Doc,
    FormatId::Odt,
    FormatId::Rtf,
    FormatId::Txt,
    FormatId::Html,
    FormatId::Xlsx,
    FormatId::Xls,
    FormatId::Ods,
    FormatId::Csv,
    FormatId::Pptx,
    FormatId::Ppt,
    FormatId::Odp,
    FormatId::Mp3,
    FormatId::Wav,
    FormatId::Flac,
    FormatId::Aac,
    FormatId::M4a,
    FormatId::Wma,
    FormatId::Aiff,
    FormatId::Alac,
    FormatId::Ogg,
    FormatId::Opus,
    FormatId::Mp4,
    FormatId::Mkv,
    FormatId::Mov,
    FormatId::Avi,
    FormatId::Webm,
    FormatId::Wmv,
    FormatId::Flv,
    FormatId::Mpeg,
    FormatId::ThreeGp,
    FormatId::Zip,
    FormatId::SevenZ,
    FormatId::Tar,
    FormatId::Gz,
    FormatId::Bz2,
    FormatId::Xz,
    FormatId::Wim,
    FormatId::Cab,
];

fn format_for_extension(extension: &str) -> Option<FormatId> {
    let extension = extension.to_ascii_lowercase();
    KNOWN_FORMATS
        .iter()
        .copied()
        .find(|format| format.known_extensions().contains(&extension.as_str()))
}

fn unreadable(path: &Path, reason: impl std::fmt::Display) -> ConversionError {
    ConversionError::Unreadable {
        path: path.display().to_string(),
        reason: reason.to_string(),
    }
}

fn open_file(path: &Path) -> Result<(File, u64), ConversionError> {
    let metadata = std::fs::metadata(path).map_err(|error| unreadable(path, error))?;
    if !metadata.is_file() {
        return Err(ConversionError::Other(format!(
            "{} is a folder; choose a file",
            path.display()
        )));
    }
    let file = File::open(path).map_err(|error| unreadable(path, error))?;
    Ok((file, metadata.len()))
}

fn ms(time: std::io::Result<SystemTime>) -> Option<u64> {
    let time = time.ok()?;
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|value| value.as_millis() as u64)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HashAlgorithm {
    Md5,
    Sha1,
    Sha256,
    Sha512,
}

impl HashAlgorithm {
    fn from_hex_len(len: usize) -> Option<Self> {
        match len {
            32 => Some(Self::Md5),
            40 => Some(Self::Sha1),
            64 => Some(Self::Sha256),
            128 => Some(Self::Sha512),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Md5 => "MD5",
            Self::Sha1 => "SHA-1",
            Self::Sha256 => "SHA-256",
            Self::Sha512 => "SHA-512",
        }
    }
}

fn hex_only(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn hash_with<D: Digest>(path: &Path, buffer: &mut [u8]) -> Result<String, ConversionError> {
    let (file, _) = open_file(path)?;
    let mut reader = BufReader::with_capacity(CHUNK, file);
    let mut hasher = D::new();
    loop {
        let read = reader
            .read(buffer)
            .map_err(|error| unreadable(path, error))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// One pass over the file feeds all four hashes. A 30 GB file is never loaded
/// into memory, and the four values always describe the same bytes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHashes {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub md5: String,
    pub sha1: String,
    pub sha256: String,
    pub sha512: String,
    pub elapsed_ms: u64,
    /// MD5 and SHA-1 are shown for compatibility with existing checksum lists;
    /// neither is collision resistant and neither should be used for trust.
    pub legacy_note: String,
}

pub fn hash_file(path: &Path) -> Result<FileHashes, ConversionError> {
    let started = Instant::now();
    let (file, size) = open_file(path)?;
    let mut reader = BufReader::with_capacity(CHUNK, file);
    let mut md5 = Md5::new();
    let mut sha1 = Sha1::new();
    let mut sha256 = Sha256::new();
    let mut sha512 = Sha512::new();
    let mut buffer = vec![0u8; CHUNK];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| unreadable(path, error))?;
        if read == 0 {
            break;
        }
        let slice = &buffer[..read];
        md5.update(slice);
        sha1.update(slice);
        sha256.update(slice);
        sha512.update(slice);
    }
    Ok(FileHashes {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string()),
        size_bytes: size,
        md5: format!("{:x}", md5.finalize()),
        sha1: format!("{:x}", sha1.finalize()),
        sha256: format!("{:x}", sha256.finalize()),
        sha512: format!("{:x}", sha512.finalize()),
        elapsed_ms: started.elapsed().as_millis() as u64,
        legacy_note: "MD5 and SHA-1 are legacy checksums; use SHA-256 for integrity checks."
            .to_owned(),
    })
}

pub fn hash_files(paths: &[String]) -> Result<Vec<FileHashes>, ConversionError> {
    if paths.is_empty() {
        return Err(ConversionError::Other(
            "choose at least one file to hash".to_owned(),
        ));
    }
    let mut results = Vec::with_capacity(paths.len());
    for path in paths {
        results.push(hash_file(Path::new(path))?);
    }
    Ok(results)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumCheck {
    pub path: String,
    pub file_name: String,
    pub expected: String,
    pub algorithm: HashAlgorithm,
    pub algorithm_label: String,
    pub actual: String,
    pub matches: bool,
    /// The file name written next to the checksum, when the text supplied one.
    pub listed_name: Option<String>,
    pub listed_name_matches: Option<bool>,
    pub line: Option<String>,
    pub note: Option<String>,
}

struct ParsedChecksum {
    algorithm: HashAlgorithm,
    hash: String,
    listed_name: Option<String>,
    line: String,
}

fn parse_checksum_line(line: &str) -> Option<ParsedChecksum> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
        return None;
    }
    let upper = line.to_ascii_uppercase();
    if let Some((prefix, rest)) = upper.split_once('(') {
        let label = prefix.trim();
        let algorithm = match label {
            "MD5" => Some(HashAlgorithm::Md5),
            "SHA1" | "SHA-1" => Some(HashAlgorithm::Sha1),
            "SHA256" | "SHA-256" => Some(HashAlgorithm::Sha256),
            "SHA512" | "SHA-512" => Some(HashAlgorithm::Sha512),
            _ => None,
        }?;
        let close = rest.find(')')?;
        let listed = rest[..close].trim().to_owned();
        let hash = rest[close + 1..]
            .split_once('=')
            .map(|(_, value)| value.trim())?
            .to_owned();
        if hex_only(&hash) {
            return Some(ParsedChecksum {
                algorithm,
                hash: hash.to_ascii_lowercase(),
                listed_name: Some(listed),
                line: line.to_owned(),
            });
        }
        return None;
    }
    let mut parts = line.split_whitespace();
    let hash = parts.next()?.trim().to_ascii_lowercase();
    if !hex_only(&hash) {
        return None;
    }
    let algorithm = HashAlgorithm::from_hex_len(hash.len())?;
    let listed = parts
        .next()
        .map(|name| name.trim_start_matches('*').to_owned());
    Some(ParsedChecksum {
        algorithm,
        hash,
        listed_name: listed.filter(|name| !name.is_empty()),
        line: line.to_owned(),
    })
}

fn same_file_name(listed: &str, file_name: &str) -> bool {
    let normalise = |value: &str| value.replace('\\', "/").to_ascii_lowercase();
    let listed = normalise(listed);
    let file = normalise(file_name);
    listed == file || listed.ends_with(&format!("/{file}"))
}

pub fn verify_checksum(path: &Path, expected_text: &str) -> Result<ChecksumCheck, ConversionError> {
    let (_, _) = open_file(path)?;
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());

    let parsed_lines: Vec<ParsedChecksum> = expected_text
        .lines()
        .filter_map(parse_checksum_line)
        .collect();
    if parsed_lines.is_empty() {
        return Err(ConversionError::Other(
            "no MD5, SHA-1, SHA-256 or SHA-512 checksum was found in the supplied text".to_owned(),
        ));
    }

    let parsed = parsed_lines
        .iter()
        .find(|entry| {
            entry
                .listed_name
                .as_deref()
                .is_some_and(|name| same_file_name(name, &file_name))
        })
        .or_else(|| parsed_lines.first())
        .expect("checked above");

    let mut buffer = vec![0u8; CHUNK];
    let actual = match parsed.algorithm {
        HashAlgorithm::Md5 => hash_with::<Md5>(path, &mut buffer)?,
        HashAlgorithm::Sha1 => hash_with::<Sha1>(path, &mut buffer)?,
        HashAlgorithm::Sha256 => hash_with::<Sha256>(path, &mut buffer)?,
        HashAlgorithm::Sha512 => hash_with::<Sha512>(path, &mut buffer)?,
    };
    let listed_name_matches = parsed
        .listed_name
        .as_deref()
        .map(|name| same_file_name(name, &file_name));
    let mut note = None;
    if listed_name_matches == Some(false) {
        note = Some(
            "the checksum line names a different file; the hash is still compared below".to_owned(),
        );
    }
    if parsed_lines.len() > 1 && listed_name_matches.is_none() {
        note = Some(format!(
            "{} checksum lines were supplied; the first one was used",
            parsed_lines.len()
        ));
    }

    Ok(ChecksumCheck {
        path: path.display().to_string(),
        file_name,
        expected: parsed.hash.clone(),
        algorithm: parsed.algorithm,
        algorithm_label: parsed.algorithm.label().to_owned(),
        matches: actual.eq_ignore_ascii_case(&parsed.hash),
        actual,
        listed_name: parsed.listed_name.clone(),
        listed_name_matches,
        line: Some(parsed.line.clone()),
        note,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileComparison {
    pub path_a: String,
    pub path_b: String,
    pub name_a: String,
    pub name_b: String,
    pub size_a: u64,
    pub size_b: u64,
    pub same_size: bool,
    pub identical: bool,
    pub compared_bytes: u64,
    pub first_difference: Option<u64>,
    pub note: Option<String>,
}

pub fn compare_files(first: &Path, second: &Path) -> Result<FileComparison, ConversionError> {
    let (file_a, size_a) = open_file(first)?;
    let (file_b, size_b) = open_file(second)?;
    let name_a = first
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| first.display().to_string());
    let name_b = second
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| second.display().to_string());

    if size_a != size_b {
        let mut reader_a = BufReader::with_capacity(CHUNK, file_a);
        let mut reader_b = BufReader::with_capacity(CHUNK, file_b);
        let mut buffer_a = vec![0u8; CHUNK];
        let mut buffer_b = vec![0u8; CHUNK];
        let mut offset = 0u64;
        loop {
            let read_a = reader_a
                .read(&mut buffer_a)
                .map_err(|error| unreadable(first, error))?;
            let read_b = reader_b
                .read(&mut buffer_b)
                .map_err(|error| unreadable(second, error))?;
            if read_a == 0 || read_b == 0 {
                break;
            }
            let shared = read_a.min(read_b);
            if buffer_a[..shared] != buffer_b[..shared] {
                let index = buffer_a[..shared]
                    .iter()
                    .zip(&buffer_b[..shared])
                    .position(|(left, right)| left != right)
                    .unwrap_or(0) as u64;
                return Ok(FileComparison {
                    path_a: first.display().to_string(),
                    path_b: second.display().to_string(),
                    name_a,
                    name_b,
                    size_a,
                    size_b,
                    same_size: false,
                    identical: false,
                    compared_bytes: offset + index + 1,
                    first_difference: Some(offset + index),
                    note: Some("the files have different sizes".to_owned()),
                });
            }
            offset += shared as u64;
        }
        return Ok(FileComparison {
            path_a: first.display().to_string(),
            path_b: second.display().to_string(),
            name_a,
            name_b,
            size_a,
            size_b,
            same_size: false,
            identical: false,
            compared_bytes: offset,
            first_difference: Some(offset),
            note: Some("one file ends before the other".to_owned()),
        });
    }

    let mut reader_a = BufReader::with_capacity(CHUNK, file_a);
    let mut reader_b = BufReader::with_capacity(CHUNK, file_b);
    let mut buffer_a = vec![0u8; CHUNK];
    let mut buffer_b = vec![0u8; CHUNK];
    let mut offset = 0u64;
    loop {
        let read_a = reader_a
            .read(&mut buffer_a)
            .map_err(|error| unreadable(first, error))?;
        let read_b = reader_b
            .read(&mut buffer_b)
            .map_err(|error| unreadable(second, error))?;
        if read_a == 0 || read_b == 0 {
            break;
        }
        if buffer_a[..read_a] != buffer_b[..read_b] {
            let index = buffer_a[..read_a]
                .iter()
                .zip(&buffer_b[..read_b])
                .position(|(left, right)| left != right)
                .unwrap_or(0) as u64;
            return Ok(FileComparison {
                path_a: first.display().to_string(),
                path_b: second.display().to_string(),
                name_a,
                name_b,
                size_a,
                size_b,
                same_size: true,
                identical: false,
                compared_bytes: offset + index + 1,
                first_difference: Some(offset + index),
                note: None,
            });
        }
        offset += read_a as u64;
    }
    Ok(FileComparison {
        path_a: first.display().to_string(),
        path_b: second.display().to_string(),
        name_a,
        name_b,
        size_a,
        size_b,
        same_size: true,
        identical: true,
        compared_bytes: offset,
        first_difference: None,
        note: None,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFile {
    pub path: String,
    pub name: String,
    pub modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub size_bytes: u64,
    pub sha256: Option<String>,
    pub files: Vec<DuplicateFile>,
    pub wasted_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateReport {
    pub roots: Vec<String>,
    pub scanned_files: u64,
    pub scanned_bytes: u64,
    pub groups: Vec<DuplicateGroup>,
    pub skipped: Vec<String>,
    pub elapsed_ms: u64,
}

fn collect_files(root: &Path, out: &mut Vec<PathBuf>, skipped: &mut Vec<String>, depth: u32) {
    if depth > 64 {
        skipped.push(format!("{}: folder nesting is too deep", root.display()));
        return;
    }
    let metadata = match std::fs::symlink_metadata(root) {
        Ok(metadata) => metadata,
        Err(error) => {
            skipped.push(format!("{}: {error}", root.display()));
            return;
        }
    };
    let kind = metadata.file_type();
    if kind.is_symlink() {
        skipped.push(format!("{}: link skipped", root.display()));
        return;
    }
    if kind.is_file() {
        out.push(root.to_path_buf());
        return;
    }
    if !kind.is_dir() {
        skipped.push(format!("{}: not a file or folder", root.display()));
        return;
    }
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) => {
            skipped.push(format!("{}: {error}", root.display()));
            return;
        }
    };
    for entry in entries.flatten() {
        collect_files(&entry.path(), out, skipped, depth + 1);
    }
}

pub fn find_duplicates(roots: &[String]) -> Result<DuplicateReport, ConversionError> {
    if roots.is_empty() {
        return Err(ConversionError::Other(
            "choose at least one file or folder to scan".to_owned(),
        ));
    }
    let started = Instant::now();
    let mut files = Vec::new();
    let mut skipped = Vec::new();
    for root in roots {
        collect_files(Path::new(root), &mut files, &mut skipped, 0);
    }
    if files.is_empty() {
        return Err(ConversionError::Other(
            "no readable files were found in the selected locations".to_owned(),
        ));
    }

    let mut by_size: BTreeMap<u64, Vec<PathBuf>> = BTreeMap::new();
    let mut scanned_bytes = 0u64;
    for path in &files {
        let Ok(metadata) = std::fs::metadata(path) else {
            skipped.push(format!("{}: unreadable", path.display()));
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        scanned_bytes += metadata.len();
        by_size
            .entry(metadata.len())
            .or_default()
            .push(path.clone());
    }

    let mut groups = Vec::new();
    for (size, candidates) in by_size {
        if candidates.len() < 2 {
            continue;
        }
        let mut by_hash: BTreeMap<String, Vec<PathBuf>> = BTreeMap::new();
        if size == 0 {
            by_hash.insert("empty".to_owned(), candidates);
        } else {
            let mut buffer = vec![0u8; CHUNK];
            for path in candidates {
                match hash_with::<Sha256>(&path, &mut buffer) {
                    Ok(hash) => by_hash.entry(hash).or_default().push(path),
                    Err(_) => skipped.push(format!("{}: could not be read", path.display())),
                }
            }
        }
        for (hash, paths) in by_hash {
            if paths.len() < 2 {
                continue;
            }
            let files = paths
                .iter()
                .map(|path| DuplicateFile {
                    path: path.display().to_string(),
                    name: path
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                        .unwrap_or_else(|| path.display().to_string()),
                    modified_ms: std::fs::metadata(path)
                        .ok()
                        .and_then(|metadata| metadata.modified().ok())
                        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                        .map(|value| value.as_millis() as u64),
                })
                .collect::<Vec<_>>();
            let count = files.len() as u64;
            groups.push(DuplicateGroup {
                size_bytes: size,
                sha256: (hash != "empty").then_some(hash),
                files,
                wasted_bytes: size.saturating_mul(count.saturating_sub(1)),
            });
        }
    }
    groups.sort_by_key(|group| std::cmp::Reverse(group.wasted_bytes));

    Ok(DuplicateReport {
        roots: roots.to_vec(),
        scanned_files: files.len() as u64,
        scanned_bytes,
        groups,
        skipped,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeEntry {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargestFile {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeReport {
    pub total_bytes: u64,
    pub total_files: u64,
    pub total_dirs: u64,
    pub entries: Vec<SizeEntry>,
    pub largest: Vec<LargestFile>,
    pub skipped: Vec<String>,
    pub elapsed_ms: u64,
}

fn walk_size(
    root: &Path,
    size: &mut u64,
    files: &mut u64,
    dirs: &mut u64,
    largest: &mut Vec<LargestFile>,
    skipped: &mut Vec<String>,
    depth: u32,
) {
    if depth > 64 {
        skipped.push(format!("{}: folder nesting is too deep", root.display()));
        return;
    }
    let metadata = match std::fs::symlink_metadata(root) {
        Ok(metadata) => metadata,
        Err(error) => {
            skipped.push(format!("{}: {error}", root.display()));
            return;
        }
    };
    let kind = metadata.file_type();
    if kind.is_symlink() {
        skipped.push(format!("{}: link skipped", root.display()));
        return;
    }
    if kind.is_file() {
        *files += 1;
        *size += metadata.len();
        largest.push(LargestFile {
            path: root.display().to_string(),
            name: root
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| root.display().to_string()),
            size_bytes: metadata.len(),
        });
        return;
    }
    if !kind.is_dir() {
        skipped.push(format!("{}: not a file or folder", root.display()));
        return;
    }
    *dirs += 1;
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) => {
            skipped.push(format!("{}: {error}", root.display()));
            return;
        }
    };
    for entry in entries.flatten() {
        walk_size(
            &entry.path(),
            size,
            files,
            dirs,
            largest,
            skipped,
            depth + 1,
        );
    }
}

pub fn calculate_size(paths: &[String]) -> Result<SizeReport, ConversionError> {
    if paths.is_empty() {
        return Err(ConversionError::Other(
            "choose at least one file or folder".to_owned(),
        ));
    }
    let started = Instant::now();
    let mut entries = Vec::new();
    let mut largest = Vec::new();
    let mut skipped = Vec::new();
    let mut total_bytes = 0u64;
    let mut total_files = 0u64;
    let mut total_dirs = 0u64;
    for path in paths {
        let root = Path::new(path);
        let mut size = 0u64;
        let mut files = 0u64;
        let mut dirs = 0u64;
        walk_size(
            root,
            &mut size,
            &mut files,
            &mut dirs,
            &mut largest,
            &mut skipped,
            0,
        );
        total_bytes += size;
        total_files += files;
        total_dirs += dirs;
        entries.push(SizeEntry {
            path: path.clone(),
            name: root
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.clone()),
            size_bytes: size,
            file_count: files,
            dir_count: dirs,
        });
    }
    largest.sort_by_key(|entry| std::cmp::Reverse(entry.size_bytes));
    largest.truncate(20);
    Ok(SizeReport {
        total_bytes,
        total_files,
        total_dirs,
        entries,
        largest,
        skipped,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureReport {
    pub detected: FormatId,
    pub detected_label: String,
    pub declared_extension: Option<String>,
    pub expected_for_extension: Option<FormatId>,
    pub extension_matches: bool,
    pub magic_hex: String,
    pub ascii_preview: String,
    pub note: Option<String>,
}

pub fn signature_of(path: &Path) -> Result<SignatureReport, ConversionError> {
    let (mut file, size) = open_file(path)?;
    let mut head = vec![0u8; 64 * 1024];
    let read = file
        .read(&mut head)
        .map_err(|error| unreadable(path, error))?;
    head.truncate(read);
    let detected = format::detect_from_path(path);
    let declared_extension = path
        .extension()
        .map(|extension| extension.to_string_lossy().to_ascii_lowercase());
    let expected_for_extension = declared_extension.as_deref().and_then(format_for_extension);
    let extension_matches = expected_for_extension == Some(detected);
    let magic_hex = head
        .iter()
        .take(HEX_MAGIC)
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ");
    let ascii_preview = head
        .iter()
        .take(32)
        .map(|byte| {
            if byte.is_ascii_graphic() || *byte == b' ' {
                *byte as char
            } else {
                '.'
            }
        })
        .collect::<String>();
    let note = match (detected, expected_for_extension) {
        (FormatId::Unknown, _) if size == 0 => {
            Some("the file is empty, so it has no signature".to_owned())
        }
        (FormatId::Unknown, _) => Some(
            "no supported format matched these leading bytes; the hex preview is shown instead"
                .to_owned(),
        ),
        (_, Some(expected)) if expected != detected => Some(format!(
            "the extension says {}, but the bytes are {}",
            expected.label(),
            detected.label()
        )),
        (_, None) => Some(format!(
            "the extension is not registered for {}; signature detection is authoritative",
            detected.label()
        )),
        _ => None,
    };
    Ok(SignatureReport {
        detected,
        detected_label: detected.label().to_owned(),
        declared_extension,
        expected_for_extension,
        extension_matches,
        magic_hex,
        ascii_preview,
        note,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub extension: Option<String>,
    pub size_bytes: u64,
    pub created_ms: Option<u64>,
    pub modified_ms: Option<u64>,
    pub accessed_ms: Option<u64>,
    pub read_only: bool,
    pub is_directory: bool,
    pub format: FormatId,
    pub format_label: String,
    pub signature: Option<SignatureReport>,
}

pub fn describe_file(path: &Path) -> Result<FileInfo, ConversionError> {
    let metadata = std::fs::metadata(path).map_err(|error| unreadable(path, error))?;
    let is_directory = metadata.is_dir();
    let detected = if is_directory {
        FormatId::Unknown
    } else {
        format::detect_from_path(path)
    };
    let signature = if is_directory {
        None
    } else {
        Some(signature_of(path)?)
    };
    Ok(FileInfo {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string()),
        extension: path
            .extension()
            .map(|extension| extension.to_string_lossy().to_ascii_lowercase()),
        size_bytes: metadata.len(),
        created_ms: ms(metadata.created()),
        modified_ms: ms(metadata.modified()),
        accessed_ms: ms(metadata.accessed()),
        read_only: metadata.permissions().readonly(),
        is_directory,
        format: detected,
        format_label: if is_directory {
            "Folder".to_owned()
        } else {
            detected.label().to_owned()
        },
        signature,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("uc-tools-files-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch");
        dir
    }

    fn write_file(path: &Path, bytes: &[u8]) {
        let mut file = File::create(path).expect("create");
        file.write_all(bytes).expect("write");
    }

    #[test]
    fn hashes_match_published_vectors() {
        let dir = scratch("hash");
        let file = dir.join("abc.txt");
        write_file(&file, b"abc");
        let hashes = hash_file(&file).expect("hash");
        assert_eq!(hashes.md5, "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(hashes.sha1, "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert_eq!(
            hashes.sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(hashes.sha512.len(), 128);
        assert_eq!(hashes.size_bytes, 3);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn gnu_and_bsd_checksum_lines_both_verify() {
        let dir = scratch("checksum");
        let file = dir.join("abc.txt");
        write_file(&file, b"abc");
        let open =
            verify_checksum(&file, "900150983cd24fb0d6963f7d28e17f72 *abc.txt").expect("gnu");
        assert!(open.matches);
        assert_eq!(open.algorithm, HashAlgorithm::Md5);
        assert_eq!(open.listed_name_matches, Some(true));

        let bsd = verify_checksum(
            &file,
            "SHA256 (abc.txt) = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        )
        .expect("bsd");
        assert!(bsd.matches);
        assert_eq!(bsd.algorithm, HashAlgorithm::Sha256);

        let wrong = verify_checksum(&file, &"0".repeat(64)).expect("wrong");
        assert!(!wrong.matches);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn comparison_reports_the_first_differing_byte() {
        let dir = scratch("compare");
        let first = dir.join("a.bin");
        let second = dir.join("b.bin");
        let mut left = vec![7u8; 2048];
        left[1234] = 9;
        write_file(&first, &left);
        write_file(&second, &vec![7u8; 2048]);
        let result = compare_files(&first, &second).expect("compare");
        assert!(!result.identical);
        assert_eq!(result.first_difference, Some(1234));
        assert_eq!(result.size_a, result.size_b);

        let same = compare_files(&first, &first).expect("same");
        assert!(same.identical);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn duplicate_scan_hashes_same_sized_files() {
        let dir = scratch("dupes");
        write_file(&dir.join("one.txt"), b"same content");
        write_file(&dir.join("two.txt"), b"same content");
        write_file(&dir.join("three.txt"), b"different!!!");
        write_file(&dir.join("zero-a"), b"");
        write_file(&dir.join("zero-b"), b"");
        let report = find_duplicates(&[dir.display().to_string()]).expect("scan");
        assert_eq!(report.scanned_files, 5);
        assert_eq!(report.groups.len(), 2);
        let content = report
            .groups
            .iter()
            .find(|group| group.size_bytes == 12)
            .expect("content group");
        assert_eq!(content.files.len(), 2);
        assert_eq!(content.wasted_bytes, 12);
        assert!(report.groups.iter().any(|group| group.size_bytes == 0));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn size_walk_sums_nested_folders() {
        let dir = scratch("size");
        std::fs::create_dir_all(dir.join("nested")).expect("nested");
        write_file(&dir.join("a.bin"), &[0u8; 100]);
        write_file(&dir.join("nested").join("b.bin"), &[0u8; 250]);
        let report = calculate_size(&[dir.display().to_string()]).expect("size");
        assert_eq!(report.total_bytes, 350);
        assert_eq!(report.total_files, 2);
        assert_eq!(report.total_dirs, 2);
        assert_eq!(report.largest[0].name, "b.bin");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_renamed_png_is_caught_by_its_signature() {
        let dir = scratch("signature");
        let file = dir.join("photo.jpg");
        let image = image::RgbaImage::from_pixel(4, 4, image::Rgba([255, 0, 0, 255]));
        image
            .save_with_format(&file, image::ImageFormat::Png)
            .expect("write png");
        let info = describe_file(&file).expect("info");
        assert_eq!(info.format, FormatId::Png);
        let signature = info.signature.expect("signature");
        assert!(!signature.extension_matches);
        assert_eq!(signature.expected_for_extension, Some(FormatId::Jpeg));
        assert!(
            signature
                .note
                .as_deref()
                .unwrap_or_default()
                .contains("PNG")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
