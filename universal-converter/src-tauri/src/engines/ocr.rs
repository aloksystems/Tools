use super::{
    ConversionEngine, EngineContext, EngineId, EngineInfo, ScratchDir, checked_cancel, pdf, pdfium,
    sidecar, validate_output,
};
use crate::core::format::{FormatCategory, FormatId};
use crate::error::ConversionError;
use crate::utils::limits;
use image::{DynamicImage, ImageBuffer, Rgb};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

const ENV_KEY: &str = "UC_TESSERACT_PATH";
const TESSDATA_ENV: &str = "UC_TESSDATA_PREFIX";
const BUNDLE_DIR: &str = "tesseract";
const VERSION_BUDGET: usize = 4096;
const LANG_BUDGET: usize = 64 * 1024;

/// Raster inputs the bundled `image` decoder can read before OCR. PDF pages are
/// rendered by PDFium first, so a scanned document uses the same engine.
pub const OCR_INPUTS: [FormatId; 8] = [
    FormatId::Jpeg,
    FormatId::Png,
    FormatId::Webp,
    FormatId::Bmp,
    FormatId::Tiff,
    FormatId::Gif,
    FormatId::Ico,
    FormatId::Pdf,
];

pub const OCR_OUTPUTS: [FormatId; 2] = [FormatId::Txt, FormatId::Pdf];

pub fn is_ocr_input(format: FormatId) -> bool {
    OCR_INPUTS.contains(&format)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrCapabilities {
    pub available: bool,
    pub version: Option<String>,
    pub reason: Option<String>,
    pub languages: Vec<String>,
    pub tessdata_path: Option<String>,
    pub input_formats: Vec<FormatId>,
    pub output_formats: Vec<FormatId>,
}

/// `UC_TESSERACT_PATH` wins, then the bundled copy under `resources/tesseract/`,
/// then PATH. An explicit directory is accepted as well as an executable path.
fn program() -> Option<PathBuf> {
    sidecar::override_candidate(ENV_KEY, &["tesseract.exe", "tesseract"])
        .or_else(|| sidecar::bundled_named(BUNDLE_DIR, &["tesseract.exe", "tesseract"]))
        .or_else(|| sidecar::search_path_named(&["tesseract.exe", "tesseract"]))
}

/// The language data directory. Tesseract's Windows build looks beside its own
/// executable, which is where the portable bundle keeps `tessdata/`.
fn tessdata_dir(executable: &Path) -> Option<PathBuf> {
    if let Some(path) = sidecar::user_override(TESSDATA_ENV).filter(|path| path.is_dir()) {
        return Some(path);
    }
    if let Some(override_path) = std::env::var_os(TESSDATA_ENV) {
        let path = PathBuf::from(override_path);
        if path.is_dir() {
            return Some(path);
        }
    }
    if let Some(sibling) = executable.parent().map(|parent| parent.join("tessdata"))
        && sibling.is_dir()
    {
        return Some(sibling);
    }
    std::env::var_os("TESSDATA_PREFIX")
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
}

fn version(executable: &Path) -> Result<String, ConversionError> {
    let text = sidecar::run_capturing(
        executable,
        &["--version"],
        VERSION_BUDGET,
        Duration::from_secs(15),
    )?;
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| ConversionError::Other("Tesseract did not report a version".to_owned()))
}

/// Language packs actually present. `osd` is orientation data, not a language,
/// so it is not offered as an OCR language.
fn languages(executable: &Path, tessdata: Option<&Path>) -> Result<Vec<String>, ConversionError> {
    let mut args = vec!["--list-langs".to_owned()];
    if let Some(directory) = tessdata {
        args.push("--tessdata-dir".to_owned());
        args.push(directory.display().to_string());
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let text =
        sidecar::run_capturing_full(executable, &refs, LANG_BUDGET, Duration::from_secs(30))?;
    let mut found: Vec<String> = text
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.starts_with("List of available languages")
                && !line.eq_ignore_ascii_case("osd")
        })
        .map(|line| line.to_ascii_lowercase())
        .collect();
    found.sort();
    found.dedup();
    Ok(found)
}

fn unavailable(reason: String) -> ConversionError {
    ConversionError::EngineUnavailable {
        engine: EngineId::Ocr.label().to_owned(),
        reason,
    }
}

fn missing_engine() -> String {
    format!(
        "Tesseract was not found. Put tesseract.exe and its tessdata folder in \
         resources/{BUNDLE_DIR}/, install it, or set {ENV_KEY} to its full path, then restart the app."
    )
}

pub fn capabilities() -> OcrCapabilities {
    let inputs = OCR_INPUTS.to_vec();
    let outputs = OCR_OUTPUTS.to_vec();
    let Some(executable) = program() else {
        return OcrCapabilities {
            available: false,
            version: None,
            reason: Some(missing_engine()),
            languages: Vec::new(),
            tessdata_path: None,
            input_formats: inputs,
            output_formats: outputs,
        };
    };
    let tessdata = tessdata_dir(&executable);
    let version = match version(&executable) {
        Ok(version) => version,
        Err(error) => {
            return OcrCapabilities {
                available: false,
                version: None,
                reason: Some(error.to_string()),
                languages: Vec::new(),
                tessdata_path: tessdata.map(|path| path.display().to_string()),
                input_formats: inputs,
                output_formats: outputs,
            };
        }
    };
    match languages(&executable, tessdata.as_deref()) {
        Ok(languages) if !languages.is_empty() => OcrCapabilities {
            available: true,
            version: Some(version),
            reason: None,
            languages,
            tessdata_path: tessdata.map(|path| path.display().to_string()),
            input_formats: inputs,
            output_formats: outputs,
        },
        Ok(_) => OcrCapabilities {
            available: false,
            version: Some(version),
            reason: Some(format!(
                "No OCR language packs were found. Add traineddata files (for example eng.traineddata) \
                 to the tessdata folder, or set {TESSDATA_ENV} to that folder."
            )),
            languages: Vec::new(),
            tessdata_path: tessdata.map(|path| path.display().to_string()),
            input_formats: inputs,
            output_formats: outputs,
        },
        Err(error) => OcrCapabilities {
            available: false,
            version: Some(version),
            reason: Some(error.to_string()),
            languages: Vec::new(),
            tessdata_path: tessdata.map(|path| path.display().to_string()),
            input_formats: inputs,
            output_formats: outputs,
        },
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct OcrSettings {
    /// Tesseract language codes such as `eng`. Multiple languages are joined
    /// with `+`, which is Tesseract's own multi-language syntax.
    languages: Vec<String>,
    /// `"1-3,7"`, `"all"` or empty for every page.
    page_ranges: String,
    /// Page segmentation mode: 3 is automatic, 6 is a single block, 7 one line.
    psm: u8,
    /// Raster resolution for PDF pages, in dots per inch.
    dpi: u32,
}

impl Default for OcrSettings {
    fn default() -> Self {
        OcrSettings {
            languages: vec!["eng".to_owned()],
            page_ranges: String::new(),
            psm: 3,
            dpi: 300,
        }
    }
}

impl OcrSettings {
    fn read(value: &serde_json::Value) -> Result<Self, ConversionError> {
        let mut settings: Self = if value.is_null() {
            Self::default()
        } else {
            serde_json::from_value(value.clone()).map_err(|error| {
                ConversionError::Other(format!(
                    "the OCR options sent by the interface are unusable: {error}"
                ))
            })?
        };
        settings.languages = settings
            .languages
            .iter()
            .map(|code| code.trim().to_ascii_lowercase())
            .filter(|code| !code.is_empty())
            .collect();
        settings.languages.sort();
        settings.languages.dedup();
        if settings.languages.is_empty() {
            settings.languages.push("eng".to_owned());
        }
        if !(72..=600).contains(&settings.dpi) {
            return Err(ConversionError::Other(format!(
                "{} dpi is outside the 72–600 dpi range OCR supports",
                settings.dpi
            )));
        }
        if settings.psm > 13 || settings.psm == 2 {
            return Err(ConversionError::Other(format!(
                "{} is not a Tesseract page-segmentation mode (use 0–1 or 3–13)",
                settings.psm
            )));
        }
        Ok(settings)
    }
}

pub struct OcrEngine;

impl ConversionEngine for OcrEngine {
    fn id(&self) -> EngineId {
        EngineId::Ocr
    }

    fn probe(&self) -> EngineInfo {
        let report = capabilities();
        EngineInfo {
            id: EngineId::Ocr,
            label: EngineId::Ocr.label().to_owned(),
            available: report.available,
            version: report.version,
            unavailable_reason: report.reason,
        }
    }

    fn convert(&self, ctx: &EngineContext) -> Result<u64, ConversionError> {
        let settings = OcrSettings::read(&ctx.job.settings)?;
        let executable = program().ok_or_else(|| unavailable(missing_engine()))?;
        let tessdata = tessdata_dir(&executable);
        let installed = languages(&executable, tessdata.as_deref()).map_err(|error| {
            unavailable(format!(
                "Tesseract is installed but its language data could not be read: {error}"
            ))
        })?;
        if installed.is_empty() {
            return Err(unavailable(
                "No Tesseract language packs are installed. Add traineddata files to its tessdata folder."
                    .to_owned(),
            ));
        }
        if let Some(missing) = settings
            .languages
            .iter()
            .find(|code| !installed.contains(code))
        {
            return Err(ConversionError::Other(format!(
                "The OCR language pack \"{missing}\" is not installed. Add {missing}.traineddata to \
                 the Tesseract tessdata folder, or choose one of: {}.",
                installed.join(", ")
            )));
        }

        let target = ctx.job.output_format;
        if !OCR_OUTPUTS.contains(&target) {
            return Err(ConversionError::Unsupported {
                input: ctx.job.input_format.label().to_owned(),
                output: target.label().to_owned(),
            });
        }

        let scratch = ScratchDir::create(ctx.temp_dir, &format!("ocr-{}", ctx.job.id))?;
        let pages = prepare_pages(ctx, &settings, scratch.path())?;
        if pages.is_empty() {
            return Err(ConversionError::Other(
                "no pages were selected for OCR".to_owned(),
            ));
        }

        let timeout = Duration::from_secs(ctx.settings.ocr_timeout_seconds.max(1));
        let language_argument = settings.languages.join("+");
        let mut produced: Vec<PathBuf> = Vec::with_capacity(pages.len());

        for (index, image_path) in pages.iter().enumerate() {
            checked_cancel(ctx.cancel)?;
            let fraction = 0.05 + 0.9 * index as f64 / pages.len() as f64;
            ctx.progress.report(
                fraction,
                &format!("OCR page {} of {}", index + 1, pages.len()),
            );

            let base = scratch.path().join(format!("page-{:05}", index + 1));
            let config = if target == FormatId::Txt {
                "txt"
            } else {
                "pdf"
            };
            let mut arguments = vec![
                image_path.display().to_string(),
                base.display().to_string(),
                "-l".to_owned(),
                language_argument.clone(),
                "--psm".to_owned(),
                settings.psm.to_string(),
                "--dpi".to_owned(),
                settings.dpi.to_string(),
            ];
            if let Some(directory) = &tessdata {
                arguments.push("--tessdata-dir".to_owned());
                arguments.push(directory.display().to_string());
            }
            arguments.push(config.to_owned());

            let refs: Vec<&str> = arguments.iter().map(String::as_str).collect();
            let mut tool = sidecar::Sidecar::start(&executable, &refs)?;
            tool.wait(ctx.cancel, timeout)?;

            let expected = base.with_extension(config);
            if !expected.is_file() {
                return Err(ConversionError::InvalidOutput {
                    path: expected.display().to_string(),
                });
            }
            produced.push(expected);
        }

        let output = Path::new(&ctx.job.output_path);
        limits::ensure_parent_dir(output)?;
        ctx.progress.report(0.96, "validating");
        if target == FormatId::Txt {
            let mut text = String::new();
            for (index, path) in produced.iter().enumerate() {
                let page = std::fs::read_to_string(path).map_err(|error| {
                    ConversionError::Other(format!(
                        "could not read the OCR result for page {}: {error}",
                        index + 1
                    ))
                })?;
                if index > 0 {
                    text.push('\u{000C}');
                }
                text.push_str(page.trim_start_matches('\u{FEFF}'));
            }
            if text.trim().is_empty() {
                return Err(ConversionError::Other(
                    "Tesseract did not recognise any text on the selected page(s)".to_owned(),
                ));
            }
            std::fs::write(output, text.as_bytes()).map_err(|error| {
                ConversionError::Other(format!("could not write {}: {error}", output.display()))
            })?;
            return validate_output(output, FormatId::Txt);
        }

        if produced.len() == 1 {
            std::fs::copy(&produced[0], output).map_err(|error| {
                ConversionError::Other(format!("could not write {}: {error}", output.display()))
            })?;
        } else {
            merge_pdfs(&produced, output, ctx)?;
        }
        let size = validate_output(output, FormatId::Pdf)?;
        let written = pdf::page_count(output).ok_or_else(|| ConversionError::InvalidOutput {
            path: output.display().to_string(),
        })?;
        if written != produced.len() as u32 {
            return Err(ConversionError::InvalidOutput {
                path: output.display().to_string(),
            });
        }
        ctx.progress.report(1.0, "searchable PDF ready");
        Ok(size)
    }
}

/// Turn the job input into one PNG per OCR page. PDFs are rasterised with
/// PDFium; images are decoded in-process and flattened onto white so a
/// transparent background cannot swallow the text.
fn prepare_pages(
    ctx: &EngineContext,
    settings: &OcrSettings,
    scratch: &Path,
) -> Result<Vec<PathBuf>, ConversionError> {
    let input = Path::new(&ctx.job.input_path);
    if ctx.job.input_format == FormatId::Pdf {
        if !pdfium::is_available() {
            return Err(unavailable(
                "PDFium is required to render PDF pages before OCR. Put pdfium.dll in \
                 resources/pdfium/, or set UC_PDFIUM_PATH to it."
                    .to_owned(),
            ));
        }
        let password = ctx.secret.unwrap_or("");
        let total = pdfium::page_count(input, password)?;
        let pages = pdf::page_list(&settings.page_ranges, total)?;
        let mut written = Vec::with_capacity(pages.len());
        for page in pages {
            checked_cancel(ctx.cancel)?;
            ctx.progress.report(
                0.02 + 0.03 * written.len() as f64 / total as f64,
                &format!("rendering PDF page {page} of {total}"),
            );
            let rendered = pdfium::render_page(input, password, page, settings.dpi)?;
            let path = scratch.join(format!("input-{page:05}.png"));
            rendered
                .save_with_format(&path, image::ImageFormat::Png)
                .map_err(|error| {
                    ConversionError::Other(format!(
                        "could not prepare page {page} for OCR: {error}"
                    ))
                })?;
            written.push(path);
        }
        return Ok(written);
    }

    if ctx.job.input_format.category() != FormatCategory::Image {
        return Err(ConversionError::Unsupported {
            input: ctx.job.input_format.label().to_owned(),
            output: FormatId::Txt.label().to_owned(),
        });
    }

    let reader = image::ImageReader::open(input)
        .map_err(|error| ConversionError::Unreadable {
            path: input.display().to_string(),
            reason: error.to_string(),
        })?
        .with_guessed_format()
        .map_err(|error| ConversionError::Unreadable {
            path: input.display().to_string(),
            reason: error.to_string(),
        })?;
    let decoded = reader.decode().map_err(|_| ConversionError::Corrupt {
        path: input.display().to_string(),
    })?;
    if (decoded.width() as u64) * (decoded.height() as u64) > limits::MAX_IMAGE_PIXELS {
        return Err(ConversionError::PixelLimit {
            pixels: (decoded.width() as u64 * decoded.height() as u64) / 1_000_000,
            limit: limits::MAX_IMAGE_PIXELS / 1_000_000,
        });
    }
    let path = scratch.join("input-00001.png");
    flatten_on_white(decoded)
        .save_with_format(&path, image::ImageFormat::Png)
        .map_err(|error| {
            ConversionError::Other(format!("could not prepare the image for OCR: {error}"))
        })?;
    Ok(vec![path])
}

fn flatten_on_white(image: DynamicImage) -> DynamicImage {
    if !image.color().has_alpha() {
        return DynamicImage::ImageRgb8(image.to_rgb8());
    }
    let rgba = image.to_rgba8();
    let mut output: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = pixel[3] as f32 / 255.0;
        let blend = |source: u8| (source as f32 * alpha + 255.0 * (1.0 - alpha)).round() as u8;
        output.put_pixel(
            x,
            y,
            Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])]),
        );
    }
    DynamicImage::ImageRgb8(output)
}

/// Tesseract writes one PDF per page. qpdf joins them without re-encoding the
/// page images or the invisible text layer Tesseract just produced.
fn merge_pdfs(
    pages: &[PathBuf],
    output: &Path,
    ctx: &EngineContext,
) -> Result<(), ConversionError> {
    let program = sidecar::locate("UC_QPDF_PATH", "qpdf", "qpdf").ok_or_else(|| {
        unavailable(
        "qpdf is required to merge multi-page searchable PDFs. Put qpdf.exe in resources/qpdf/, \
         or set UC_QPDF_PATH to its full path."
            .to_owned(),
    )
    })?;
    let mut arguments = vec![
        "--warning-exit-0".to_owned(),
        "--empty".to_owned(),
        "--pages".to_owned(),
    ];
    arguments.extend(pages.iter().map(|path| path.display().to_string()));
    arguments.push("--".to_owned());
    arguments.push(output.display().to_string());
    let refs: Vec<&str> = arguments.iter().map(String::as_str).collect();
    let mut tool = sidecar::Sidecar::start(&program, &refs)?;
    tool.wait(
        ctx.cancel,
        Duration::from_secs(ctx.settings.ocr_timeout_seconds.max(1)),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::job::{ConversionJob, JobOperation, JobRequest};
    use crate::core::settings::AppSettings;
    use crate::engines::{CancellationToken, NullProgress};
    use lopdf::{Document, Object, Stream, dictionary};

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("uc-ocr-{label}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch folder");
        dir
    }

    fn build_job(
        input: &Path,
        output: &Path,
        input_format: FormatId,
        output_format: FormatId,
        settings: serde_json::Value,
    ) -> ConversionJob {
        let request = JobRequest {
            input_path: input.display().to_string(),
            output_format,
            operation: JobOperation::Ocr,
            settings,
            output_directory: None,
            extra_inputs: Vec::new(),
            output_name: None,
            selected_entries: Vec::new(),
            password: None,
        };
        let mut job = ConversionJob::new(
            &request,
            input_format,
            EngineId::Ocr,
            output.to_path_buf(),
            0,
        );
        job.status = crate::core::job::JobStatus::Processing;
        job
    }

    fn text_pdf(path: &Path, pages: &[&str]) {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        });
        let mut kids: Vec<Object> = Vec::new();
        for (index, line) in pages.iter().enumerate() {
            // Keep the line well inside the 612 pt page: Tesseract reading a
            // clipped glyph would make the test assert against a fixture bug.
            let content = format!(
                "BT /F1 54 Tf 40 {} Td ({}) Tj ET",
                680 - index as i32 * 100,
                line
            );
            let content_id = document.add_object(Stream::new(dictionary! {}, content.into_bytes()));
            let page_id = document.add_object(dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
                "Resources" => dictionary! { "Font" => dictionary! { "F1" => font_id } },
                "Contents" => content_id,
            });
            kids.push(page_id.into());
        }
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => kids,
                "Count" => pages.len() as i64,
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        document.trailer.set("Root", catalog_id);
        document.save(path).expect("PDF saves");
    }

    fn run(
        job: &ConversionJob,
        dir: &Path,
        cancel: &CancellationToken,
    ) -> Result<u64, ConversionError> {
        OcrEngine.convert(&EngineContext {
            job,
            temp_dir: dir,
            progress: &NullProgress,
            cancel,
            settings: &AppSettings::default(),
            secret: None,
        })
    }

    #[test]
    fn the_bundled_tesseract_and_english_pack_are_available() {
        let report = capabilities();
        assert!(
            report.available,
            "bundled Tesseract must probe as available: {:?}",
            report.reason
        );
        assert!(
            report
                .version
                .as_deref()
                .unwrap_or("")
                .contains("tesseract"),
            "version should name Tesseract, got {:?}",
            report.version
        );
        assert!(
            report.languages.iter().any(|code| code == "eng"),
            "eng.traineddata must be bundled, got {:?}",
            report.languages
        );
        assert_eq!(report.output_formats, OCR_OUTPUTS.to_vec());
    }

    #[test]
    fn a_real_image_is_recognised_into_utf8_text() {
        let dir = scratch_dir("image-text");
        let pdf = dir.join("source.pdf");
        text_pdf(&pdf, &["HELLO OCR 12345"]);
        let png = dir.join("source.png");
        pdfium::render_page(&pdf, "", 1, 300)
            .expect("PDFium renders the fixture")
            .save(&png)
            .expect("PNG saves");

        let output = dir.join("recognised.txt");
        let job = build_job(
            &png,
            &output,
            FormatId::Png,
            FormatId::Txt,
            serde_json::json!({ "languages": ["eng"], "psm": 7 }),
        );
        run(&job, &dir, &CancellationToken::new()).expect("OCR succeeds");

        let text = std::fs::read_to_string(&output).expect("UTF-8 output");
        let upper = text.to_uppercase();
        assert!(upper.contains("HELLO"), "recognised text was {text:?}");
        assert!(upper.contains("12345"), "recognised text was {text:?}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_scanned_pdf_produces_text_for_every_selected_page() {
        let dir = scratch_dir("pdf-text");
        let pdf = dir.join("two-pages.pdf");
        text_pdf(&pdf, &["PAGE ONE", "PAGE TWO"]);

        let output = dir.join("pages.txt");
        let job = build_job(
            &pdf,
            &output,
            FormatId::Pdf,
            FormatId::Txt,
            serde_json::json!({ "languages": ["eng"], "pageRanges": "1-2", "dpi": 300 }),
        );
        run(&job, &dir, &CancellationToken::new()).expect("PDF OCR succeeds");

        let text = std::fs::read_to_string(&output).expect("UTF-8 output");
        let upper = text.to_uppercase();
        assert!(upper.contains("PAGE ONE"), "recognised text was {text:?}");
        assert!(upper.contains("PAGE TWO"), "recognised text was {text:?}");
        assert!(text.contains('\u{000C}'), "pages must stay separated");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_searchable_pdf_is_a_real_pdf_with_the_expected_page_count() {
        let dir = scratch_dir("searchable");
        let pdf = dir.join("source.pdf");
        text_pdf(&pdf, &["SEARCHABLE TEXT", "SECOND PAGE"]);

        let output = dir.join("searchable.pdf");
        let job = build_job(
            &pdf,
            &output,
            FormatId::Pdf,
            FormatId::Pdf,
            serde_json::json!({ "languages": ["eng"], "pageRanges": "1-2", "dpi": 300 }),
        );
        run(&job, &dir, &CancellationToken::new()).expect("searchable PDF succeeds");

        assert!(output.is_file());
        let head = std::fs::read(&output).expect("output readable");
        assert!(head.starts_with(b"%PDF"), "the result must be a PDF");
        assert_eq!(
            crate::engines::pdf::page_count(&output),
            Some(2),
            "both OCR pages must survive the merge"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_missing_language_pack_is_named_with_setup_instructions() {
        let dir = scratch_dir("missing-language");
        let png = dir.join("source.png");
        DynamicImage::new_rgb8(120, 60).save(&png).unwrap();
        let output = dir.join("out.txt");
        let job = build_job(
            &png,
            &output,
            FormatId::Png,
            FormatId::Txt,
            serde_json::json!({ "languages": ["zzz"] }),
        );
        let error = run(&job, &dir, &CancellationToken::new()).expect_err("unknown language");
        assert!(error.to_string().contains("zzz"), "{error}");
        assert!(error.to_string().contains("traineddata"), "{error}");
        assert!(!output.exists(), "a refused job writes nothing");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_cancelled_job_stops_before_tesseract_runs() {
        let dir = scratch_dir("cancel");
        let png = dir.join("source.png");
        DynamicImage::new_rgb8(120, 60).save(&png).unwrap();
        let output = dir.join("out.txt");
        let job = build_job(
            &png,
            &output,
            FormatId::Png,
            FormatId::Txt,
            serde_json::json!({ "languages": ["eng"] }),
        );
        let cancel = CancellationToken::new();
        cancel.cancel();
        let error = run(&job, &dir, &cancel).expect_err("cancelled jobs must not run");
        assert!(matches!(error, ConversionError::Cancelled), "{error}");
        assert!(!output.exists(), "cancellation must leave no output");
        std::fs::remove_dir_all(&dir).ok();
    }
}
