use super::sidecar::{self, Sidecar};
use super::{
    ConversionEngine, EngineContext, EngineId, EngineInfo, ScratchDir, checked_cancel,
    validate_output,
};
use crate::core::format::{self, FormatId};
use crate::error::ConversionError;
use crate::utils::paths;
use serde::Deserialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

const ENV_KEY: &str = "UC_LIBREOFFICE_PATH";
const BUNDLED_DIR: &str = "libreoffice";
#[cfg(windows)]
const PROGRAM_NAMES: &[&str] = &["soffice.com", "soffice.exe", "soffice"];
#[cfg(not(windows))]
const PROGRAM_NAMES: &[&str] = &["soffice"];
#[cfg(windows)]
const BUNDLED_NAMES: &[&str] = &[
    "program/soffice.com",
    "program/soffice.exe",
    "program/soffice",
];
#[cfg(not(windows))]
const BUNDLED_NAMES: &[&str] = &["program/soffice"];

const VERSION_TIMEOUT: Duration = Duration::from_secs(20);

/// Office documents via headless LibreOffice.
///
/// Two rules shape this engine: every process gets its own profile and output
/// directory, and a successful process is not trusted until the produced file
/// is opened and checked.
pub struct DocumentEngine;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Family {
    Writer,
    Calc,
    Impress,
}

impl Family {
    fn of(format: FormatId) -> Option<Self> {
        if format.is_word_processor() {
            Some(Family::Writer)
        } else if format.is_spreadsheet() {
            Some(Family::Calc)
        } else if format.is_presentation() {
            Some(Family::Impress)
        } else {
            None
        }
    }

    fn pdf_filter(self) -> &'static str {
        match self {
            Family::Writer => "writer_pdf_Export",
            Family::Calc => "calc_pdf_Export",
            Family::Impress => "impress_pdf_Export",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct DocumentSettings {
    /// Writer/Calc/Impress page range understood by the PDF export filter.
    page_range: String,
    /// JPEG quality for lossy PDF images, 1–100.
    image_quality: u32,
    /// Keep images lossless (larger PDF, no JPEG artefacts).
    lossless: bool,
    /// Export speaker notes / comments where the component supports it.
    export_notes: bool,
    /// 1-based sheet for CSV export. Other formats keep every sheet.
    sheet: u32,
}

impl Default for DocumentSettings {
    fn default() -> Self {
        DocumentSettings {
            page_range: String::new(),
            image_quality: 90,
            lossless: false,
            export_notes: false,
            sheet: 1,
        }
    }
}

pub fn locate_soffice() -> Option<PathBuf> {
    sidecar::override_candidate(ENV_KEY, PROGRAM_NAMES)
        .or_else(|| sidecar::bundled_named(BUNDLED_DIR, BUNDLED_NAMES))
        .or_else(|| sidecar::installed_named(&install_dirs(), PROGRAM_NAMES))
        .or_else(|| sidecar::search_path_named(PROGRAM_NAMES))
}

fn install_dirs() -> Vec<PathBuf> {
    let mut directories = sidecar::program_files_dirs()
        .into_iter()
        .map(|root| root.join("LibreOffice").join("program"))
        .collect::<Vec<_>>();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        directories.push(
            PathBuf::from(local)
                .join("Programs")
                .join("LibreOffice")
                .join("program"),
        );
    }
    directories
}

fn version_of(program: &Path) -> Result<String, ConversionError> {
    // A throw-away profile keeps the version check from touching the user's
    // LibreOffice profile or leaving a lock behind.
    let probe = ScratchDir::create(
        &std::env::temp_dir(),
        &format!("uc-lo-version-{}", std::process::id()),
    )?;
    let profile = format!("-env:UserInstallation={}", file_url(probe.path()));
    let args = [
        "--headless",
        "--norestore",
        "--invisible",
        "--nodefault",
        "--nolockcheck",
        "--nologo",
        "--nofirststartwizard",
        profile.as_str(),
        "--version",
    ];
    let output = sidecar::run_capturing(program, &args, 8 * 1024, VERSION_TIMEOUT)?;
    let version = output
        .lines()
        .find(|line| line.to_ascii_lowercase().contains("libreoffice"))
        .unwrap_or_else(|| output.lines().next().unwrap_or("LibreOffice"))
        .trim()
        .to_owned();
    Ok(version)
}

impl ConversionEngine for DocumentEngine {
    fn id(&self) -> EngineId {
        EngineId::Document
    }

    fn probe(&self) -> EngineInfo {
        let unavailable = |reason: String| EngineInfo {
            id: EngineId::Document,
            label: EngineId::Document.label().to_owned(),
            available: false,
            version: None,
            unavailable_reason: Some(reason),
        };
        let Some(program) = locate_soffice() else {
            return unavailable(format!(
                "LibreOffice was not found. Install it, set {ENV_KEY} to soffice.com, or place \
                 a portable copy in resources/{BUNDLED_DIR}/program."
            ));
        };
        match version_of(&program) {
            Ok(version) => EngineInfo {
                id: EngineId::Document,
                label: EngineId::Document.label().to_owned(),
                available: true,
                version: Some(version),
                unavailable_reason: None,
            },
            Err(error) => unavailable(format!(
                "LibreOffice was found at {} but did not start: {error}",
                program.display()
            )),
        }
    }

    fn convert(&self, ctx: &EngineContext) -> Result<u64, ConversionError> {
        let job = ctx.job;
        if job.operation != crate::core::job::JobOperation::Convert {
            return Err(ConversionError::Other(
                "the document engine only performs conversions".to_owned(),
            ));
        }
        if job.inputs.len() != 1 {
            return Err(ConversionError::Other(
                "document conversion takes one file per job".to_owned(),
            ));
        }

        let input = Path::new(&job.input_path);
        let input_format = format::detect_from_path(input);
        let Some(family) = Family::of(input_format) else {
            return Err(ConversionError::Unsupported {
                input: input_format.label().to_owned(),
                output: job.output_format.label().to_owned(),
            });
        };
        if format::encrypted_office_path(input) {
            return Err(if ctx.secret.is_some() {
                ConversionError::PasswordUnsupported {
                    path: input.display().to_string(),
                }
            } else {
                ConversionError::NeedsPassword {
                    path: input.display().to_string(),
                }
            });
        }

        checked_cancel(ctx.cancel)?;
        let settings: DocumentSettings =
            super::parse_settings(&job.settings, DocumentSettings::default());
        let filter = filter_spec(family, input_format, job.output_format, &settings)?;

        let Some(program) = locate_soffice() else {
            return Err(self.probe().unavailable_error());
        };

        let scratch = ScratchDir::create(ctx.temp_dir, &format!("lo-{}", job.id))?;
        let profile = scratch.path().join("profile");
        let outdir = scratch.path().join("out");
        std::fs::create_dir_all(&profile).map_err(|error| {
            ConversionError::Other(format!("could not create a LibreOffice profile: {error}"))
        })?;
        std::fs::create_dir_all(&outdir).map_err(|error| {
            ConversionError::Other(format!("could not create a conversion folder: {error}"))
        })?;

        ctx.progress.report(0.1, "starting LibreOffice");
        let profile_arg = format!("-env:UserInstallation={}", file_url(&profile));
        let timeout = Duration::from_secs(ctx.settings.document_timeout_seconds.max(1));
        let input_text = input.to_string_lossy().into_owned();
        let outdir_text = outdir.to_string_lossy().into_owned();
        let args = vec![
            "--headless".to_owned(),
            "--norestore".to_owned(),
            "--invisible".to_owned(),
            "--nodefault".to_owned(),
            "--nolockcheck".to_owned(),
            "--nologo".to_owned(),
            "--nofirststartwizard".to_owned(),
            profile_arg,
            "--convert-to".to_owned(),
            filter,
            "--outdir".to_owned(),
            outdir_text,
            input_text,
        ];
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();

        ctx.progress.report(0.35, "converting with LibreOffice");
        let mut sidecar = Sidecar::start(&program, &refs)?;
        sidecar
            .wait(ctx.cancel, timeout)
            .map_err(|error| map_failure(input, error, ctx.secret.is_some()))?;
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(0.85, "checking the converted document");

        // LibreOffice can exit 0 without writing a file. The only proof of work
        // is an output that opens and is really the requested format.
        let produced = find_output(&outdir, job.output_format).ok_or_else(|| {
            ConversionError::InvalidOutput {
                path: job.output_path.clone(),
            }
        })?;
        validate_document(&produced, job.output_format)?;

        let destination = Path::new(&job.output_path);
        for source in &job.inputs {
            if paths::paths_are_same(Path::new(source), destination) {
                return Err(ConversionError::Other(format!(
                    "refusing to overwrite the source file {}",
                    source
                )));
            }
        }
        let allow_overwrite = matches!(
            ctx.settings.collision_policy,
            crate::core::settings::CollisionPolicy::Overwrite
        );
        paths::commit_file(&produced, destination, allow_overwrite)?;
        ctx.progress.report(0.95, "saving the converted document");

        std::fs::metadata(destination)
            .map(|meta| meta.len())
            .map_err(|_| ConversionError::InvalidOutput {
                path: job.output_path.clone(),
            })
    }

    fn is_memory_heavy(&self) -> bool {
        true
    }
}

fn map_failure(input: &Path, error: ConversionError, had_password: bool) -> ConversionError {
    if matches!(
        error,
        ConversionError::Cancelled | ConversionError::Timeout { .. }
    ) {
        return error;
    }
    let text = error.to_string();
    let lower = text.to_ascii_lowercase();
    if lower.contains("password") || lower.contains("encrypted") {
        return if had_password {
            ConversionError::WrongPassword {
                path: input.display().to_string(),
            }
        } else {
            ConversionError::NeedsPassword {
                path: input.display().to_string(),
            }
        };
    }
    ConversionError::Other(format!(
        "LibreOffice could not convert {}: {text}",
        input.display()
    ))
}

/// The extension token before the colon selects the output file extension; the
/// filter after it names the LibreOffice export filter.
fn filter_spec(
    family: Family,
    input_format: FormatId,
    output: FormatId,
    settings: &DocumentSettings,
) -> Result<String, ConversionError> {
    let page_range = settings.page_range.trim();
    if !page_range.is_empty()
        && !page_range
            .chars()
            .all(|character| character.is_ascii_digit() || matches!(character, '-' | ',' | ' '))
    {
        return Err(ConversionError::Other(
            "page range may contain only numbers, commas, hyphens and spaces (for example 1-3,7)"
                .to_owned(),
        ));
    }
    if settings.sheet > 1 && output != FormatId::Csv {
        return Err(ConversionError::Other(
            "sheet selection applies to CSV output only; choose CSV or clear the sheet".to_owned(),
        ));
    }
    if output == FormatId::Csv && !input_format.is_spreadsheet() {
        return Err(ConversionError::Unsupported {
            input: input_format.label().to_owned(),
            output: output.label().to_owned(),
        });
    }

    let filter = match (family, output) {
        (Family::Writer, FormatId::Pdf) => {
            return Ok(pdf_filter_spec(family, settings));
        }
        (Family::Calc, FormatId::Pdf) => {
            return Ok(pdf_filter_spec(family, settings));
        }
        (Family::Impress, FormatId::Pdf) => {
            return Ok(pdf_filter_spec(family, settings));
        }
        (Family::Writer, FormatId::Docx) => "docx:MS Word 2007 XML".to_owned(),
        (Family::Writer, FormatId::Doc) => "doc:MS Word 97".to_owned(),
        (Family::Writer, FormatId::Odt) => "odt:writer8".to_owned(),
        (Family::Writer, FormatId::Rtf) => "rtf:Rich Text Format".to_owned(),
        (Family::Writer, FormatId::Txt) => "txt:Text".to_owned(),
        (Family::Writer, FormatId::Html) => "html:HTML (StarWriter)".to_owned(),
        (Family::Calc, FormatId::Xlsx) => "xlsx:Calc MS Excel 2007 XML".to_owned(),
        (Family::Calc, FormatId::Xls) => "xls:MS Excel 97".to_owned(),
        (Family::Calc, FormatId::Ods) => "ods:calc8".to_owned(),
        (Family::Calc, FormatId::Html) => "html:HTML (StarCalc)".to_owned(),
        (Family::Calc, FormatId::Csv) => {
            let sheet = settings.sheet.max(1);
            format!(
                "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,{sheet}"
            )
        }
        (Family::Impress, FormatId::Pptx) => "pptx:Impress MS PowerPoint 2007 XML".to_owned(),
        (Family::Impress, FormatId::Odp) => "odp:impress8".to_owned(),
        _ => {
            return Err(ConversionError::Unsupported {
                input: input_format.label().to_owned(),
                output: output.label().to_owned(),
            });
        }
    };
    Ok(filter)
}

fn pdf_filter_spec(family: Family, settings: &DocumentSettings) -> String {
    let mut options = serde_json::Map::new();
    let page_range = settings.page_range.trim();
    if !page_range.is_empty() {
        options.insert(
            "PageRange".to_owned(),
            serde_json::json!({ "type": "string", "value": page_range }),
        );
    }
    if !settings.lossless {
        options.insert(
            "UseLosslessCompression".to_owned(),
            serde_json::json!({ "type": "boolean", "value": false }),
        );
        options.insert(
            "Quality".to_owned(),
            serde_json::json!({
                "type": "long",
                "value": settings.image_quality.clamp(1, 100)
            }),
        );
    }
    if settings.export_notes {
        options.insert(
            "ExportNotes".to_owned(),
            serde_json::json!({ "type": "boolean", "value": true }),
        );
    }
    let filter = family.pdf_filter();
    if options.is_empty() {
        format!("pdf:{filter}")
    } else {
        format!("pdf:{filter}:{}", serde_json::Value::Object(options))
    }
}

/// `file:///C:/Users/...` with spaces and non-ASCII escaped. LibreOffice parses
/// this as a URL, not as a raw Windows path.
fn file_url(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let prefixed = if raw.starts_with('/') {
        raw
    } else {
        format!("/{raw}")
    };
    let mut url = String::from("file://");
    for byte in prefixed.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b':' | b'-' | b'_' | b'.' | b'~' => {
                url.push(byte as char);
            }
            _ => url.push_str(&format!("%{byte:02X}")),
        }
    }
    url
}

fn find_output(outdir: &Path, expected: FormatId) -> Option<PathBuf> {
    let entries = std::fs::read_dir(outdir).ok()?;
    let mut fallback = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .map(|ext| ext.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        if extension == expected.extension() {
            return Some(path);
        }
        if fallback.is_none() {
            fallback = Some(path);
        }
    }
    fallback
}

fn validate_document(path: &Path, expected: FormatId) -> Result<(), ConversionError> {
    let invalid = || ConversionError::InvalidOutput {
        path: path.display().to_string(),
    };
    if std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0) == 0 {
        return Err(invalid());
    }
    match expected {
        FormatId::Pdf => {
            if format::detect_from_path(path) != FormatId::Pdf {
                return Err(invalid());
            }
            let document = lopdf::Document::load(path).map_err(|_| invalid())?;
            if document.get_pages().is_empty() {
                return Err(invalid());
            }
            validate_output(path, expected)?;
        }
        FormatId::Docx
        | FormatId::Xlsx
        | FormatId::Pptx
        | FormatId::Odt
        | FormatId::Ods
        | FormatId::Odp => validate_zip_package(path, expected)?,
        FormatId::Doc | FormatId::Xls | FormatId::Ppt => {
            if format::detect_from_path(path) != expected {
                return Err(invalid());
            }
        }
        FormatId::Html => {
            let head = read_text_head(path)?;
            let lower = head.to_ascii_lowercase();
            if !lower.contains("<html") && !lower.contains("<!doctype") {
                return Err(invalid());
            }
        }
        FormatId::Txt | FormatId::Csv | FormatId::Rtf => {
            validate_output(path, expected)?;
        }
        _ => {
            validate_output(path, expected)?;
        }
    }
    Ok(())
}

fn validate_zip_package(path: &Path, expected: FormatId) -> Result<(), ConversionError> {
    let invalid = || ConversionError::InvalidOutput {
        path: path.display().to_string(),
    };
    let file = std::fs::File::open(path).map_err(|_| invalid())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| invalid())?;
    if archive.is_empty() {
        return Err(invalid());
    }
    match expected {
        FormatId::Docx => {
            archive
                .by_name("word/document.xml")
                .map_err(|_| invalid())?;
        }
        FormatId::Xlsx => {
            archive.by_name("xl/workbook.xml").map_err(|_| invalid())?;
        }
        FormatId::Pptx => {
            archive
                .by_name("ppt/presentation.xml")
                .map_err(|_| invalid())?;
        }
        FormatId::Odt | FormatId::Ods | FormatId::Odp => {
            let mut mimetype = String::new();
            archive
                .by_name("mimetype")
                .map_err(|_| invalid())?
                .read_to_string(&mut mimetype)
                .map_err(|_| invalid())?;
            let expected_mime = match expected {
                FormatId::Odt => "application/vnd.oasis.opendocument.text",
                FormatId::Ods => "application/vnd.oasis.opendocument.spreadsheet",
                FormatId::Odp => "application/vnd.oasis.opendocument.presentation",
                _ => return Err(invalid()),
            };
            if !mimetype.starts_with(expected_mime) {
                return Err(invalid());
            }
        }
        _ => return Err(invalid()),
    }
    Ok(())
}

fn read_text_head(path: &Path) -> Result<String, ConversionError> {
    let mut file = std::fs::File::open(path).map_err(|_| ConversionError::InvalidOutput {
        path: path.display().to_string(),
    })?;
    let mut buffer = vec![0u8; 8192];
    let read = file
        .read(&mut buffer)
        .map_err(|_| ConversionError::InvalidOutput {
            path: path.display().to_string(),
        })?;
    buffer.truncate(read);
    if buffer.iter().take(64).any(|byte| *byte == 0) {
        return Err(ConversionError::InvalidOutput {
            path: path.display().to_string(),
        });
    }
    Ok(String::from_utf8_lossy(&buffer).into_owned())
}

/// Sheet names for the CSV sheet picker. OOXML/ODF are read directly; legacy
/// XLS asks LibreOffice to export every sheet to CSV once, which is the only
/// reliable way to learn the names without a full spreadsheet parser.
pub fn list_sheets(path: &Path) -> Result<Vec<String>, ConversionError> {
    match format::detect_from_path(path) {
        FormatId::Xlsx => sheets_from_xlsx(path),
        FormatId::Ods => sheets_from_ods(path),
        FormatId::Csv => Ok(vec!["Sheet1".to_owned()]),
        FormatId::Xls => sheets_from_libreoffice(path),
        format => Err(ConversionError::Unsupported {
            input: format.label().to_owned(),
            output: "sheet list".to_owned(),
        }),
    }
}

fn sheets_from_xlsx(path: &Path) -> Result<Vec<String>, ConversionError> {
    let xml = read_zip_member(path, "xl/workbook.xml")?;
    let names = attribute_values(&xml, "<sheet ", "name");
    Ok(names)
}

fn sheets_from_ods(path: &Path) -> Result<Vec<String>, ConversionError> {
    let xml = read_zip_member(path, "content.xml")?;
    let names = attribute_values(&xml, "<table:table ", "table:name");
    Ok(names)
}

fn read_zip_member(path: &Path, member: &str) -> Result<String, ConversionError> {
    let file = std::fs::File::open(path).map_err(|error| ConversionError::Unreadable {
        path: path.display().to_string(),
        reason: error.to_string(),
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| ConversionError::Corrupt {
        path: path.display().to_string(),
    })?;
    let mut entry = archive
        .by_name(member)
        .map_err(|_| ConversionError::Corrupt {
            path: path.display().to_string(),
        })?;
    let mut xml = String::new();
    entry
        .read_to_string(&mut xml)
        .map_err(|_| ConversionError::Corrupt {
            path: path.display().to_string(),
        })?;
    Ok(xml)
}

fn attribute_values(xml: &str, tag_start: &str, attribute: &str) -> Vec<String> {
    let needle = format!("{attribute}=\"");
    let mut values = Vec::new();
    let mut rest = xml;
    while let Some(open) = rest.find(tag_start) {
        let slice = &rest[open..];
        let Some(end) = slice.find('>') else {
            break;
        };
        let tag = &slice[..end];
        if let Some(value) = attribute_value(tag, &needle) {
            values.push(decode_xml_entities(&value));
        }
        rest = &slice[end + 1..];
    }
    values
}

fn attribute_value(tag: &str, needle: &str) -> Option<String> {
    let start = tag.find(needle)? + needle.len();
    let rest = &tag[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_owned())
}

fn decode_xml_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

/// Legacy XLS has no readable sheet index we can trust, so convert it once to
/// XLSX and read the ordered `<sheet>` list from the workbook part. Sorting CSV
/// export filenames would invent an order the user never saw.
fn sheets_from_libreoffice(path: &Path) -> Result<Vec<String>, ConversionError> {
    let program = locate_soffice().ok_or_else(|| ConversionError::EngineUnavailable {
        engine: EngineId::Document.label().to_owned(),
        reason: format!(
            "LibreOffice was not found; set {ENV_KEY} or bundle it in resources/{BUNDLED_DIR}."
        ),
    })?;
    let scratch = ScratchDir::create(
        &std::env::temp_dir(),
        &format!("uc-sheets-{}", uuid::Uuid::new_v4()),
    )?;
    let profile = scratch.path().join("profile");
    let outdir = scratch.path().join("out");
    std::fs::create_dir_all(&profile)
        .and_then(|_| std::fs::create_dir_all(&outdir))
        .map_err(|error| {
            ConversionError::Other(format!("could not create sheet scratch: {error}"))
        })?;

    let profile_arg = format!("-env:UserInstallation={}", file_url(&profile));
    let outdir_text = outdir.to_string_lossy().into_owned();
    let input_text = path.to_string_lossy().into_owned();
    let args = vec![
        "--headless".to_owned(),
        "--norestore".to_owned(),
        "--invisible".to_owned(),
        "--nodefault".to_owned(),
        "--nolockcheck".to_owned(),
        "--nologo".to_owned(),
        "--nofirststartwizard".to_owned(),
        profile_arg,
        "--convert-to".to_owned(),
        "xlsx:Calc MS Excel 2007 XML".to_owned(),
        "--outdir".to_owned(),
        outdir_text,
        input_text,
    ];
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut sidecar = Sidecar::start(&program, &refs)?;
    sidecar.wait(&super::CancellationToken::new(), Duration::from_secs(120))?;

    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default();
    let expected = outdir.join(format!("{stem}.xlsx"));
    let produced = if expected.is_file() {
        expected
    } else {
        std::fs::read_dir(&outdir)
            .map_err(|error| ConversionError::Other(error.to_string()))?
            .flatten()
            .map(|entry| entry.path())
            .find(|file| {
                file.is_file()
                    && file
                        .extension()
                        .is_some_and(|ext| ext.eq_ignore_ascii_case("xlsx"))
            })
            .ok_or_else(|| ConversionError::InvalidOutput {
                path: path.display().to_string(),
            })?
    };
    sheets_from_xlsx(&produced)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_profile_path_becomes_a_percent_encoded_file_url() {
        let url = file_url(Path::new(r"C:\Users\Alok Kumar\AppData\Local\Temp\x"));
        assert!(url.starts_with("file:///C:/Users/Alok%20Kumar/"));
        assert!(!url.contains('\\'));
    }

    #[test]
    fn every_registered_filter_uses_the_requested_extension() {
        let settings = DocumentSettings::default();
        let cases = [
            (Family::Writer, FormatId::Docx, "docx:"),
            (Family::Writer, FormatId::Doc, "doc:"),
            (Family::Writer, FormatId::Odt, "odt:"),
            (Family::Writer, FormatId::Rtf, "rtf:"),
            (Family::Writer, FormatId::Txt, "txt:"),
            (Family::Writer, FormatId::Html, "html:"),
            (Family::Calc, FormatId::Xlsx, "xlsx:"),
            (Family::Calc, FormatId::Xls, "xls:"),
            (Family::Calc, FormatId::Ods, "ods:"),
            (Family::Calc, FormatId::Csv, "csv:"),
            (Family::Impress, FormatId::Pptx, "pptx:"),
            (Family::Impress, FormatId::Odp, "odp:"),
        ];
        for (family, output, prefix) in cases {
            let input = match family {
                Family::Writer => FormatId::Txt,
                Family::Calc => FormatId::Csv,
                Family::Impress => FormatId::Pptx,
            };
            let spec = filter_spec(family, input, output, &settings).unwrap();
            assert!(
                spec.starts_with(prefix),
                "{spec} should start with {prefix}"
            );
        }
    }

    #[test]
    fn a_page_range_with_shell_metacharacters_is_refused() {
        let settings = DocumentSettings {
            page_range: "1; rm -rf".to_owned(),
            ..DocumentSettings::default()
        };
        let error = filter_spec(Family::Writer, FormatId::Docx, FormatId::Pdf, &settings)
            .expect_err("only page numbers and separators belong in a page range");
        assert!(!error.to_string().contains("rm -rf"));
    }

    #[test]
    fn sheet_selection_is_limited_to_csv_output() {
        let settings = DocumentSettings {
            sheet: 2,
            ..DocumentSettings::default()
        };
        assert!(filter_spec(Family::Calc, FormatId::Xlsx, FormatId::Csv, &settings).is_ok());
        assert!(filter_spec(Family::Calc, FormatId::Xlsx, FormatId::Pdf, &settings).is_err());
    }

    #[test]
    fn xml_sheet_names_are_read_with_entities_decoded() {
        let xml = r#"<workbook><sheets><sheet name="Q&amp;A" sheetId="1"/><sheet name="Data" sheetId="2"/></sheets></workbook>"#;
        assert_eq!(
            attribute_values(xml, "<sheet ", "name"),
            vec!["Q&A", "Data"]
        );
    }

    #[test]
    fn version_probe_is_honest_when_libreoffice_is_absent() {
        let engine = DocumentEngine;
        let info = engine.probe();
        if locate_soffice().is_none() {
            assert!(!info.available);
            assert!(
                info.unavailable_reason
                    .unwrap()
                    .contains("LibreOffice was not found")
            );
        }
    }

    use crate::core::job::{ConversionJob, JobRequest, JobStatus};
    use crate::core::settings::AppSettings;
    use crate::engines::{CancellationToken, EngineContext, NullProgress};

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join(name)
    }

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("uc-doc-{label}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch folder");
        dir
    }

    /// LibreOffice is a ~400 MB process and does not fail loudly when Windows
    /// runs short of memory: it can exit 0 without writing anything. `cargo
    /// test` starts one test per core, so on an 8 GB machine the document suite
    /// could have eight copies running at once and lose an export. Taking turns
    /// keeps the tests deterministic without relaxing a single assertion.
    static DOCUMENT_GATE: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn document_turn() -> std::sync::MutexGuard<'static, ()> {
        DOCUMENT_GATE
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn run_document(
        input: &Path,
        output: &Path,
        output_format: FormatId,
        settings: serde_json::Value,
    ) -> Result<u64, ConversionError> {
        let _turn = document_turn();
        let request = JobRequest::for_test(
            &[input.to_str().expect("fixture path is UTF-8")],
            output_format,
            settings,
        );
        let mut job = ConversionJob::new(
            &request,
            format::detect_from_path(input),
            EngineId::Document,
            output.to_path_buf(),
            0,
        );
        job.status = JobStatus::Processing;
        let cancel = CancellationToken::new();
        let app = AppSettings::default();
        let scratch = output.parent().expect("output folder").to_path_buf();
        DocumentEngine.convert(&EngineContext {
            job: &job,
            temp_dir: &scratch,
            progress: &NullProgress,
            cancel: &cancel,
            settings: &app,
            secret: None,
        })
    }

    #[test]
    fn a_real_text_file_becomes_a_readable_pdf() {
        let dir = scratch_dir("txt-pdf");
        let output = dir.join("notes.pdf");
        let bytes = run_document(
            &fixture("notes.txt"),
            &output,
            FormatId::Pdf,
            serde_json::json!({ "pageRange": "1", "imageQuality": 70 }),
        )
        .expect("LibreOffice should convert a real TXT file");
        assert!(bytes > 0);
        let document = lopdf::Document::load(&output).expect("output must open as a PDF");
        assert_eq!(document.get_pages().len(), 1);
        assert_eq!(format::detect_from_path(&output), FormatId::Pdf);
        assert_eq!(
            std::fs::read(fixture("notes.txt")).unwrap().len(),
            83,
            "the source file must be untouched"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_real_docx_becomes_pdf_with_the_requested_page_range() {
        let dir = scratch_dir("docx-pdf");
        let output = dir.join("notes.pdf");
        let bytes = run_document(
            &fixture("notes.docx"),
            &output,
            FormatId::Pdf,
            serde_json::json!({ "pageRange": "1", "lossless": true }),
        )
        .expect("LibreOffice should convert a real DOCX file");
        assert!(bytes > 0);
        let document = lopdf::Document::load(&output).expect("valid PDF");
        assert_eq!(document.get_pages().len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_real_workbook_exports_the_chosen_sheet_as_csv() {
        let dir = scratch_dir("xlsx-csv");
        let output = dir.join("second.csv");
        let bytes = run_document(
            &fixture("sheets.xlsx"),
            &output,
            FormatId::Csv,
            serde_json::json!({ "sheet": 2 }),
        )
        .expect("LibreOffice should export the second sheet");
        assert!(bytes > 0);
        let text = std::fs::read_to_string(&output).unwrap();
        assert!(
            text.contains("beta"),
            "second sheet content missing: {text}"
        );
        assert!(
            !text.contains("alpha"),
            "first sheet leaked into the export: {text}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_real_spreadsheet_and_presentation_become_pdfs() {
        let dir = scratch_dir("calc-impress-pdf");

        let calc_pdf = dir.join("sheets.pdf");
        run_document(
            &fixture("sheets.xlsx"),
            &calc_pdf,
            FormatId::Pdf,
            serde_json::Value::Null,
        )
        .expect("Calc -> PDF");
        let calc = lopdf::Document::load(&calc_pdf).expect("valid Calc PDF");
        assert!(!calc.get_pages().is_empty());

        let impress_pdf = dir.join("slides.pdf");
        run_document(
            &fixture("slides.pptx"),
            &impress_pdf,
            FormatId::Pdf,
            serde_json::Value::Null,
        )
        .expect("Impress -> PDF");
        let impress = lopdf::Document::load(&impress_pdf).expect("valid Impress PDF");
        assert_eq!(impress.get_pages().len(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_writer_document_can_round_trip_to_docx_and_rtf() {
        let dir = scratch_dir("writer-round-trip");
        let docx = dir.join("notes.docx");
        run_document(
            &fixture("notes.txt"),
            &docx,
            FormatId::Docx,
            serde_json::Value::Null,
        )
        .expect("TXT -> DOCX");
        assert_eq!(format::detect_from_path(&docx), FormatId::Docx);

        let rtf = dir.join("notes.rtf");
        run_document(&docx, &rtf, FormatId::Rtf, serde_json::Value::Null).expect("DOCX -> RTF");
        assert_eq!(format::detect_from_path(&rtf), FormatId::Rtf);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn real_documents_export_to_odf_packages() {
        let dir = scratch_dir("odf-outputs");
        for (source, format, name) in [
            ("notes.docx", FormatId::Odt, "notes.odt"),
            ("sheets.xlsx", FormatId::Ods, "sheets.ods"),
            ("slides.pptx", FormatId::Odp, "slides.odp"),
        ] {
            let output = dir.join(name);
            let bytes = run_document(&fixture(source), &output, format, serde_json::Value::Null)
                .unwrap_or_else(|error| panic!("{source} -> {format:?} failed: {error}"));
            assert!(bytes > 0, "{name} is empty");
            assert_eq!(format::detect_from_path(&output), format);
            let package = std::fs::File::open(&output).expect("ODF package opens");
            let mut archive = zip::ZipArchive::new(package).expect("ODF is a ZIP package");
            archive
                .by_name("mimetype")
                .expect("ODF mimetype entry exists");
        }

        let odt = dir.join("notes.odt");
        let docx = dir.join("notes-roundtrip.docx");
        run_document(&odt, &docx, FormatId::Docx, serde_json::Value::Null).expect("ODT -> DOCX");
        assert_eq!(format::detect_from_path(&docx), FormatId::Docx);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_corrupt_document_is_refused_without_publishing_an_output() {
        let dir = scratch_dir("corrupt-document");
        let broken = dir.join("broken.docx");
        let mut bytes = std::fs::read(fixture("notes.docx")).unwrap();
        bytes.truncate(64);
        std::fs::write(&broken, bytes).unwrap();

        let output = dir.join("broken.pdf");
        let result = run_document(&broken, &output, FormatId::Pdf, serde_json::Value::Null);
        assert!(result.is_err(), "a truncated DOCX must not convert");
        assert!(!output.exists(), "no output may be published");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn html_text_and_rtf_routes_produce_real_outputs() {
        let dir = scratch_dir("html-rtf");
        let html = dir.join("page.html");
        std::fs::write(
            &html,
            "<!doctype html><html><body><h1>Phase 4</h1><p>Hello from HTML.</p></body></html>",
        )
        .unwrap();

        let html_pdf = dir.join("page.pdf");
        run_document(&html, &html_pdf, FormatId::Pdf, serde_json::Value::Null)
            .expect("HTML -> PDF");
        let document = lopdf::Document::load(&html_pdf).expect("valid HTML PDF");
        assert!(!document.get_pages().is_empty());

        let html_txt = dir.join("page.txt");
        run_document(&html, &html_txt, FormatId::Txt, serde_json::Value::Null)
            .expect("HTML -> TXT");
        let text = std::fs::read_to_string(&html_txt).unwrap();
        assert!(
            text.contains("Hello from HTML"),
            "HTML text export lost the body: {text}"
        );

        let rtf = dir.join("notes.rtf");
        run_document(
            &fixture("notes.txt"),
            &rtf,
            FormatId::Rtf,
            serde_json::Value::Null,
        )
        .expect("TXT -> RTF");
        assert_eq!(format::detect_from_path(&rtf), FormatId::Rtf);
        assert!(
            std::fs::read_to_string(&rtf).unwrap().starts_with("{\\rtf"),
            "RTF output lacks its header"
        );

        let rtf_pdf = dir.join("notes.pdf");
        run_document(&rtf, &rtf_pdf, FormatId::Pdf, serde_json::Value::Null).expect("RTF -> PDF");
        let document = lopdf::Document::load(&rtf_pdf).expect("valid RTF PDF");
        assert_eq!(document.get_pages().len(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn sheet_names_are_listed_in_workbook_order() {
        let _turn = document_turn();
        assert_eq!(
            list_sheets(&fixture("sheets.xlsx")).unwrap(),
            vec!["First Sheet".to_owned(), "Second Sheet".to_owned()]
        );
        // Legacy XLS goes through one XLSX conversion and keeps the order.
        assert_eq!(
            list_sheets(&fixture("sheets.xls")).unwrap(),
            vec!["First Sheet".to_owned(), "Second Sheet".to_owned()]
        );
        assert_eq!(
            list_sheets(&fixture("notes.csv")).unwrap(),
            vec!["Sheet1".to_owned()]
        );
    }

    #[test]
    fn an_encrypted_document_asks_for_its_password_instead_of_guessing() {
        // A one-byte file cannot be a valid Office package; detection refuses it
        // long before LibreOffice is spawned.
        let dir = scratch_dir("encrypted-guard");
        let fake = dir.join("secret.docx");
        let mut bytes = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        for unit in "EncryptionInfo".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        bytes.extend(std::iter::repeat_n(0u8, 504));
        std::fs::write(&fake, bytes).unwrap();
        let output = dir.join("secret.pdf");
        let request = JobRequest::for_test(
            &[fake.to_str().unwrap()],
            FormatId::Pdf,
            serde_json::Value::Null,
        );
        let job = ConversionJob::new(&request, FormatId::Docx, EngineId::Document, output, 512);
        let cancel = CancellationToken::new();
        let app = AppSettings::default();
        let error = DocumentEngine
            .convert(&EngineContext {
                job: &job,
                temp_dir: &dir,
                progress: &NullProgress,
                cancel: &cancel,
                settings: &app,
                secret: None,
            })
            .expect_err("an encrypted CFB must not be silently converted");
        assert!(
            matches!(error, ConversionError::NeedsPassword { .. }),
            "got {error}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }
}
