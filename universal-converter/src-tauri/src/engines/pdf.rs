use super::{
    CancellationToken, ConversionEngine, EngineContext, EngineId, EngineInfo, checked_cancel,
    image as image_engine, pdfium, sidecar, unreadable, validate_output,
};
use crate::core::format::{self, FormatId};
use crate::error::ConversionError;
use crate::utils::limits;
use image::{ColorType, DynamicImage, ImageReader};
use lopdf::{Dictionary, Document, LoadOptions, Object, ObjectId, Stream, dictionary, text_string};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;

/// One point is 1/72 of an inch; PDF page boxes are always in points.
const POINTS_PER_MM: f32 = 72.0 / 25.4;
/// Page counts for the drop list come from a trailer-only read. Parsing a
/// hundreds-of-megabytes PDF just to show a number is not worth the stall.
const MAX_PROBED_BYTES: u64 = 64 * 1024 * 1024;
const PRODUCER: &str = "Universal Converter";

/// Formats the compiled-in `image` decoders can read. AVIF, HEIC and SVG are
/// deliberately absent: enabling them would pull in decoders the Phase 1
/// security review kept out of the build.
const NATIVE_RASTER: [FormatId; 7] = [
    FormatId::Jpeg,
    FormatId::Png,
    FormatId::Webp,
    FormatId::Bmp,
    FormatId::Tiff,
    FormatId::Gif,
    FormatId::Ico,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(Default)]
pub enum PdfOperation {
    #[default]
    Convert,
    Merge,
    Split,
    Rotate,
    Reorder,
    Compress,
    Metadata,
    Password,
    Watermark,
    PageText,
    Annotate,
}

/// What the PDF page offers, per operation, on *this* machine. Availability is
/// finer than the engine: the native core is always present, but it cannot
/// rasterise pages or encrypt until its sidecar tools are bundled.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfCapability {
    pub operation: &'static str,
    pub label: &'static str,
    pub available: bool,
    pub missing_dependency: Option<&'static str>,
}

pub fn capabilities() -> Vec<PdfCapability> {
    let entry = |operation, label, missing_dependency: Option<&'static str>| PdfCapability {
        operation,
        label,
        available: missing_dependency.is_none(),
        missing_dependency,
    };
    let renderer = (!pdfium::is_available()).then_some("PDFium");
    let editor = sidecar::locate("UC_QPDF_PATH", "qpdf", "qpdf")
        .is_none()
        .then_some("qpdf");
    vec![
        entry("imagesToPdf", "Images into one PDF", None),
        entry("pdfToImages", "PDF pages to images", renderer),
        entry("merge", "Merge PDFs", editor),
        entry("split", "Split or extract pages", None),
        entry("rotate", "Rotate pages", None),
        entry("reorder", "Reorder pages", editor),
        entry("compress", "Compress", editor),
        entry("metadata", "Read and edit metadata", None),
        entry("password", "Set or remove passwords", editor),
        entry("watermark", "Text watermark", None),
        entry("pageNumbers", "Page numbers, headers and footers", None),
        entry("annotations", "Sticky-note annotations", None),
        entry("extractImages", "Extract embedded images", None),
        entry("comparePages", "Compare two PDFs", renderer),
        entry("inspect", "Document inspector", None),
    ]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(Default)]
pub enum PdfPageSize {
    #[default]
    A4,
    Letter,
    Legal,
    Fit,
}

impl PdfPageSize {
    /// Portrait width and height in points. `Fit` uses the image's own pixel
    /// size, one pixel to one point.
    fn points(self, pixels_w: u32, pixels_h: u32) -> (f32, f32) {
        match self {
            Self::A4 => (595.0, 842.0),
            Self::Letter => (612.0, 792.0),
            Self::Legal => (612.0, 1008.0),
            Self::Fit => (pixels_w.max(1) as f32, pixels_h.max(1) as f32),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum PdfOrientation {
    #[default]
    Auto,
    Portrait,
    Landscape,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum PdfPlacement {
    #[default]
    Center,
    Top,
    Bottom,
}

#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ImageLayout {
    pub page_size: PdfPageSize,
    pub orientation: PdfOrientation,
    pub margin_mm: f32,
    pub placement: PdfPlacement,
}

impl ImageLayout {
    fn page_points(&self, pixels_w: u32, pixels_h: u32) -> (f32, f32) {
        let (a, b) = self.page_size.points(pixels_w, pixels_h);
        let want_landscape = match self.orientation {
            PdfOrientation::Auto => pixels_w > pixels_h,
            PdfOrientation::Landscape => true,
            PdfOrientation::Portrait => false,
        };
        if want_landscape == (a >= b) {
            (a, b)
        } else {
            (b, a)
        }
    }

    /// Where the image lands on the page, in points from the lower-left corner.
    /// Scaling keeps the aspect ratio and fills the printable box.
    fn place(
        &self,
        pixels_w: u32,
        pixels_h: u32,
        page_w: f32,
        page_h: f32,
    ) -> (f32, f32, f32, f32) {
        let natural_w = pixels_w.max(1) as f32;
        let natural_h = pixels_h.max(1) as f32;
        let margin = self.margin_mm.max(0.0) * POINTS_PER_MM;
        let box_w = (page_w - 2.0 * margin).max(1.0);
        let box_h = (page_h - 2.0 * margin).max(1.0);
        let scale = (box_w / natural_w).min(box_h / natural_h);
        let draw_w = natural_w * scale;
        let draw_h = natural_h * scale;
        let x = (page_w - draw_w) / 2.0;
        let y = match self.placement {
            PdfPlacement::Center => (page_h - draw_h) / 2.0,
            PdfPlacement::Top => page_h - draw_h - margin,
            PdfPlacement::Bottom => margin,
        };
        (draw_w, draw_h, x, y)
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MetadataEdit {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
}

impl MetadataEdit {
    fn entries(&self) -> [(&'static str, Option<&str>); 5] {
        [
            ("Title", self.title.as_deref()),
            ("Author", self.author.as_deref()),
            ("Subject", self.subject.as_deref()),
            ("Keywords", self.keywords.as_deref()),
            ("Creator", self.creator.as_deref()),
        ]
    }

    fn is_empty(&self) -> bool {
        self.entries().iter().all(|(_, value)| value.is_none())
    }
}

/// A diagonal text stamp. The engine draws it as page content, so it survives
/// printing and does not depend on any viewer's annotation support.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WatermarkSettings {
    pub text: String,
    /// Points; 64 is a large diagonal stamp.
    pub font_size: f32,
    /// 0.0–1.0; the value is written to the page's graphics state.
    pub opacity: f32,
    /// `#rrggbb`.
    pub color: String,
    /// Degrees, counter-clockwise. 45 gives the familiar diagonal.
    pub angle: f32,
}

impl Default for WatermarkSettings {
    fn default() -> Self {
        Self {
            text: String::new(),
            font_size: 64.0,
            opacity: 0.18,
            color: "#c0392b".to_owned(),
            angle: 45.0,
        }
    }
}

/// Six text slots around the page. `{page}` and `{total}` are replaced per page;
/// `{title}` comes from the document's Info dictionary when present.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PageTextSettings {
    pub header_left: String,
    pub header_center: String,
    pub header_right: String,
    pub footer_left: String,
    pub footer_center: String,
    pub footer_right: String,
    pub font_size: f32,
    pub margin_mm: f32,
    /// Number printed for the first page, so a part can continue a sequence.
    pub start_number: u32,
}

impl Default for PageTextSettings {
    fn default() -> Self {
        Self {
            header_left: String::new(),
            header_center: String::new(),
            header_right: String::new(),
            footer_left: String::new(),
            footer_center: String::new(),
            footer_right: String::new(),
            font_size: 10.0,
            margin_mm: 12.0,
            start_number: 1,
        }
    }
}

impl PageTextSettings {
    fn has_text(&self) -> bool {
        [
            &self.header_left,
            &self.header_center,
            &self.header_right,
            &self.footer_left,
            &self.footer_center,
            &self.footer_right,
        ]
        .iter()
        .any(|text| !text.trim().is_empty())
    }
}

/// A sticky-note annotation. Written into the page's `/Annots` array as a real
/// `/Text` annotation, which is what PDF viewers show in their comments panel.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AnnotationSettings {
    pub text: String,
    pub author: String,
    /// Position of the note icon from the top-right corner, in millimetres.
    pub margin_mm: f32,
}

impl Default for AnnotationSettings {
    fn default() -> Self {
        Self {
            text: String::new(),
            author: String::new(),
            margin_mm: 12.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum PdfCompression {
    /// Accepted so a stale UI value cannot break unrelated operations; the
    /// compress operation itself refuses it, because copying a file is not
    /// compression.
    None,
    Low,
    #[default]
    Medium,
    High,
}

impl PdfCompression {
    fn level(self) -> Result<u32, ConversionError> {
        match self {
            Self::Low => Ok(1),
            Self::Medium => Ok(6),
            Self::High => Ok(9),
            Self::None => Err(ConversionError::Other(
                "choose low, balanced or high compression; \"none\" would just copy the file"
                    .to_owned(),
            )),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PdfJobSettings {
    pub operation: PdfOperation,
    /// `"1-3,7"`, `"all"` or empty for every page.
    pub page_ranges: String,
    pub rotation: i64,
    pub layout: ImageLayout,
    pub metadata: MetadataEdit,
    /// Remove every info entry and the XMP stream, not just the five fields.
    pub remove_all_metadata: bool,
    /// Needed to open an encrypted input; never written to logs or history.
    pub password: String,
    /// Password to put on the output. Empty means "remove the password".
    pub new_password: String,
    /// Owner password for a new password; falls back to `new_password`.
    pub owner_password: String,
    pub compression: PdfCompression,
    /// Raster resolution for PDF → image jobs, in dots per inch.
    pub dpi: u32,
    /// JPEG/WebP quality for PDF → image jobs.
    pub raster_quality: u8,
    pub watermark: WatermarkSettings,
    pub page_text: PageTextSettings,
    pub annotation: AnnotationSettings,
}

impl Default for PdfJobSettings {
    fn default() -> Self {
        PdfJobSettings {
            operation: PdfOperation::Convert,
            page_ranges: String::new(),
            rotation: 90,
            layout: ImageLayout::default(),
            metadata: MetadataEdit::default(),
            remove_all_metadata: false,
            password: String::new(),
            new_password: String::new(),
            owner_password: String::new(),
            compression: PdfCompression::default(),
            dpi: 200,
            raster_quality: 92,
            watermark: WatermarkSettings::default(),
            page_text: PageTextSettings::default(),
            annotation: AnnotationSettings::default(),
        }
    }
}

impl PdfJobSettings {
    /// Unlike the image engine, a PDF job refuses to guess: running "convert"
    /// when the user asked to merge would produce a file nobody ordered.
    fn read(value: &serde_json::Value) -> Result<Self, ConversionError> {
        if value.is_null() {
            return Ok(Self::default());
        }
        let settings: Self = serde_json::from_value(value.clone()).map_err(|error| {
            ConversionError::Other(format!(
                "the PDF options sent by the interface are unusable: {error}"
            ))
        })?;
        if !(36..=600).contains(&settings.dpi) {
            return Err(ConversionError::Other(format!(
                "{} dpi is outside the 36–600 dpi range this build renders",
                settings.dpi
            )));
        }
        if settings.raster_quality == 0 || settings.raster_quality > 100 {
            return Err(ConversionError::Other(format!(
                "image quality {} is outside the 1–100 range",
                settings.raster_quality
            )));
        }
        if !(4.0..=400.0).contains(&settings.watermark.font_size) {
            return Err(ConversionError::Other(
                "watermark text size must be between 4 and 400 points".to_owned(),
            ));
        }
        if !(0.0..=1.0).contains(&settings.watermark.opacity) {
            return Err(ConversionError::Other(
                "watermark opacity must be between 0 and 1".to_owned(),
            ));
        }
        if !(4.0..=72.0).contains(&settings.page_text.font_size) {
            return Err(ConversionError::Other(
                "page text size must be between 4 and 72 points".to_owned(),
            ));
        }
        if settings.page_text.margin_mm < 0.0 || settings.page_text.margin_mm > 100.0 {
            return Err(ConversionError::Other(
                "page text margins must be between 0 and 100 mm".to_owned(),
            ));
        }
        if settings.page_text.start_number == 0 {
            return Err(ConversionError::Other(
                "the first printed page number must be at least 1".to_owned(),
            ));
        }
        if settings.annotation.margin_mm < 0.0 || settings.annotation.margin_mm > 200.0 {
            return Err(ConversionError::Other(
                "annotation margin must be between 0 and 200 mm".to_owned(),
            ));
        }
        Ok(settings)
    }
}

/// Everything the PDF page shows for one document before a job runs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfDocumentInfo {
    pub path: String,
    pub page_count: u32,
    pub version: String,
    /// The document arrived encrypted and was opened with the supplied password.
    pub encrypted: bool,
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
    pub producer: Option<String>,
}

pub struct PdfEngine;

impl ConversionEngine for PdfEngine {
    fn id(&self) -> EngineId {
        EngineId::Pdf
    }

    /// The native core is compiled into the binary, so the engine itself always
    /// answers. Operations that need a sidecar report it in `capabilities()` and
    /// fail by name, which is why `available` is not the whole story here.
    fn probe(&self) -> EngineInfo {
        let mut parts = vec!["lopdf".to_owned()];
        if pdfium::is_available() {
            parts.push("PDFium".to_owned());
        }
        if sidecar::locate("UC_QPDF_PATH", "qpdf", "qpdf").is_some() {
            parts.push("qpdf".to_owned());
        }
        EngineInfo {
            id: EngineId::Pdf,
            label: EngineId::Pdf.label().to_owned(),
            available: true,
            version: Some(format!("native core ({})", parts.join(" + "))),
            unavailable_reason: None,
        }
    }

    fn convert(&self, ctx: &EngineContext) -> Result<u64, ConversionError> {
        let settings = PdfJobSettings::read(&ctx.job.settings)?;
        match settings.operation {
            PdfOperation::Convert
                if ctx.job.output_format == FormatId::Pdf
                    && ctx.job.input_format != FormatId::Pdf =>
            {
                images_to_pdf(ctx, &settings)
            }
            PdfOperation::Convert if ctx.job.input_format == FormatId::Pdf => {
                rasterise_page(ctx, &settings)
            }
            PdfOperation::Convert => Err(ConversionError::Unsupported {
                input: ctx.job.input_format.label().to_owned(),
                output: ctx.job.output_format.label().to_owned(),
            }),
            PdfOperation::Split => extract_pages(ctx, &settings),
            PdfOperation::Rotate => rotate_pages(ctx, &settings),
            PdfOperation::Merge => merge_pdfs(ctx, &settings),
            PdfOperation::Reorder => reorder_pages(ctx, &settings),
            PdfOperation::Compress => compress_pdf(ctx, &settings),
            PdfOperation::Metadata => write_metadata(ctx, &settings),
            PdfOperation::Password => update_password(ctx, &settings),
            PdfOperation::Watermark => stamp_watermark(ctx, &settings),
            PdfOperation::PageText => stamp_page_text(ctx, &settings),
            PdfOperation::Annotate => annotate_pages(ctx, &settings),
        }
    }

    /// Structural edits hold the whole document in memory.
    fn is_memory_heavy(&self) -> bool {
        true
    }
}

fn corrupt(path: &Path) -> ConversionError {
    ConversionError::Corrupt {
        path: path.display().to_string(),
    }
}

/// Open a document for editing. An encrypted file needs the password the user
/// typed; with it, the output is written unprotected, which is what "remove
/// password" means once the owner has supplied it.
///
/// The password goes to the *loader*, not to `Document::decrypt`: lopdf 0.42
/// defers every object of an encrypted file until load-time authentication, so
/// loading first and decrypting afterwards silently yields an empty document.
fn open_pdf(path: &Path, password: &str) -> Result<Document, ConversionError> {
    let document = Document::load_with_options(path, LoadOptions::with_password(password))
        .map_err(|error| match error {
            lopdf::Error::InvalidPassword if password.is_empty() => {
                ConversionError::NeedsPassword {
                    path: path.display().to_string(),
                }
            }
            lopdf::Error::InvalidPassword => ConversionError::WrongPassword {
                path: path.display().to_string(),
            },
            other => unreadable(path, other),
        })?;
    if document.is_encrypted() {
        return Err(ConversionError::NeedsPassword {
            path: path.display().to_string(),
        });
    }
    Ok(document)
}

/// Write, then prove the result is a real, readable PDF with the pages we think
/// it has. A job only reports success past this line.
fn save_pdf(
    mut document: Document,
    output: &Path,
    expected_pages: Option<u32>,
) -> Result<u64, ConversionError> {
    limits::ensure_parent_dir(output)?;
    document.save(output).map_err(|error| {
        ConversionError::Other(format!("could not write {}: {error}", output.display()))
    })?;
    check_written_pdf(output, expected_pages)
}

/// Shared proof for files written by lopdf and by qpdf.
fn check_written_pdf(output: &Path, expected_pages: Option<u32>) -> Result<u64, ConversionError> {
    let invalid = || ConversionError::InvalidOutput {
        path: output.display().to_string(),
    };
    let size = validate_output(output, FormatId::Pdf)?;
    if let Some(expected) = expected_pages {
        let written = Document::load_metadata(output).map_err(|_| invalid())?;
        if written.page_count != expected {
            return Err(invalid());
        }
    }
    Ok(size)
}

/// Page numbers to work on, 1-based and sorted. Empty or `all` means every page.
pub(crate) fn page_list(spec: &str, total: u32) -> Result<Vec<u32>, ConversionError> {
    let spec = spec.trim();
    if spec.is_empty() || spec.eq_ignore_ascii_case("all") {
        return Ok((1..=total).collect());
    }
    let bad = |text: &str| {
        ConversionError::Other(format!(
            "\"{text}\" is not a page selection; use numbers and ranges like 1-3,7"
        ))
    };
    let edge = |text: &str, default: u32| -> Result<u32, ConversionError> {
        if text.is_empty() {
            return Ok(default);
        }
        text.parse::<u32>().map_err(|_| bad(spec))
    };

    let mut numbers: Vec<u32> = Vec::new();
    for part in spec.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let (from, to) = match part.split_once('-') {
            Some((start, end)) => {
                if start.is_empty() && end.is_empty() {
                    return Err(bad(spec));
                }
                (edge(start, 1)?, edge(end, total)?)
            }
            None => {
                let single = edge(part, 0)?;
                (single, single)
            }
        };
        if from == 0 || to > total || from > to {
            return Err(ConversionError::Other(format!(
                "\"{part}\" is outside a document of {total} page(s)"
            )));
        }
        numbers.extend(from..=to);
    }
    numbers.sort_unstable();
    numbers.dedup();
    if numbers.is_empty() {
        return Err(bad(spec));
    }
    Ok(numbers)
}

const QPDF_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

fn qpdf_program() -> Result<std::path::PathBuf, ConversionError> {
    sidecar::locate("UC_QPDF_PATH", "qpdf", "qpdf").ok_or_else(|| {
        ConversionError::EngineUnavailable {
            engine: EngineId::Pdf.label().to_owned(),
            reason: "qpdf was not found. Put qpdf.exe in resources/qpdf/, or set UC_QPDF_PATH \
                     to its full path, then restart the app."
                .to_owned(),
        }
    })
}

/// qpdf gets argv only. Passwords ride in `--password=` arguments and are never
/// copied into an error, a log line or a job record; only the tool's own stderr
/// is quoted, and that names files and reasons.
fn run_qpdf(
    program: &Path,
    args: &[String],
    password_owner: &str,
    cancel: &CancellationToken,
) -> Result<(), ConversionError> {
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut tool = sidecar::Sidecar::start(program, &refs)?;
    match tool.wait(cancel, QPDF_TIMEOUT) {
        Ok(_) => Ok(()),
        Err(ConversionError::Other(message))
            if message.to_ascii_lowercase().contains("invalid password") =>
        {
            Err(ConversionError::WrongPassword {
                path: password_owner.to_owned(),
            })
        }
        Err(error) => Err(error),
    }
}

fn password_argument(password: &str) -> Option<String> {
    (!password.is_empty()).then(|| format!("--password={password}"))
}

fn is_encrypted_document(path: &Path) -> Result<bool, ConversionError> {
    let document = Document::load(path).map_err(|error| unreadable(path, error))?;
    Ok(document.is_encrypted())
}

fn size_label(bytes: u64) -> String {
    if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{} KB", bytes.div_ceil(1024).max(1))
    }
}

/// Page numbers in the exact order given. A reorder may repeat or reorder pages,
/// so unlike `page_list` nothing is sorted or deduplicated here.
fn page_order(spec: &str, total: u32) -> Result<Vec<u32>, ConversionError> {
    let spec = spec.trim();
    if spec.is_empty() || spec.eq_ignore_ascii_case("all") {
        return Ok((1..=total).collect());
    }
    let bad = |text: &str| {
        ConversionError::Other(format!(
            "\"{text}\" is not a page order; use numbers and ranges like 3,1-2"
        ))
    };
    let edge = |text: &str, default: u32| -> Result<u32, ConversionError> {
        if text.is_empty() {
            return Ok(default);
        }
        text.parse::<u32>().map_err(|_| bad(spec))
    };

    let mut numbers: Vec<u32> = Vec::new();
    for part in spec.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let (from, to) = match part.split_once('-') {
            Some((start, end)) => {
                if start.is_empty() && end.is_empty() {
                    return Err(bad(spec));
                }
                (edge(start, 1)?, edge(end, total)?)
            }
            None => {
                let single = edge(part, 0)?;
                (single, single)
            }
        };
        if from == 0 || to > total || from > to {
            return Err(ConversionError::Other(format!(
                "\"{part}\" is outside a document of {total} page(s)"
            )));
        }
        numbers.extend(from..=to);
    }
    if numbers.is_empty() {
        return Err(bad(spec));
    }
    Ok(numbers)
}

fn merge_pdfs(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    if ctx.job.inputs.len() < 2 {
        return Err(ConversionError::Other(
            "merge needs at least two PDF files".to_owned(),
        ));
    }
    let output = Path::new(&ctx.job.output_path);
    limits::ensure_parent_dir(output)?;
    let program = qpdf_program()?;

    let mut expected = 0_u32;
    let mut args = vec![
        "--warning-exit-0".to_owned(),
        "--empty".to_owned(),
        "--pages".to_owned(),
    ];
    for (index, raw) in ctx.job.inputs.iter().enumerate() {
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(
            0.2 * index as f64 / ctx.job.inputs.len() as f64,
            &format!("checking PDF {} of {}", index + 1, ctx.job.inputs.len()),
        );
        expected += open_pdf(Path::new(raw), &settings.password)?
            .get_pages()
            .len() as u32;
        args.push(raw.clone());
        if let Some(password) = password_argument(&settings.password) {
            args.push(password);
        }
    }
    args.push("--".to_owned());
    args.push(ctx.job.output_path.clone());

    ctx.progress.report(0.3, "merging PDFs");
    run_qpdf(&program, &args, &ctx.job.input_path, ctx.cancel)?;
    ctx.progress.report(0.95, "validating");
    check_written_pdf(output, Some(expected))
}

fn reorder_pages(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    let input = Path::new(&ctx.job.input_path);
    let output = Path::new(&ctx.job.output_path);
    limits::ensure_parent_dir(output)?;

    let total = open_pdf(input, &settings.password)?.get_pages().len() as u32;
    let order = page_order(&settings.page_ranges, total)?;
    let range = order
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");

    let program = qpdf_program()?;
    let mut args = vec![
        "--warning-exit-0".to_owned(),
        "--empty".to_owned(),
        "--pages".to_owned(),
        ctx.job.input_path.clone(),
    ];
    if let Some(password) = password_argument(&settings.password) {
        args.push(password);
    }
    args.push(range);
    args.push("--".to_owned());
    args.push(ctx.job.output_path.clone());

    ctx.progress.report(0.3, "reordering pages");
    run_qpdf(&program, &args, &ctx.job.input_path, ctx.cancel)?;
    ctx.progress.report(0.95, "validating");
    check_written_pdf(output, Some(order.len() as u32))
}

fn compress_pdf(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    let input = Path::new(&ctx.job.input_path);
    let output = Path::new(&ctx.job.output_path);
    limits::ensure_parent_dir(output)?;

    let level = settings.compression.level()?;
    let expected = open_pdf(input, &settings.password)?.get_pages().len() as u32;
    let input_size = std::fs::metadata(input)
        .map_err(|error| unreadable(input, error))?
        .len();

    let program = qpdf_program()?;
    let mut args = vec![
        "--warning-exit-0".to_owned(),
        "--object-streams=generate".to_owned(),
        "--recompress-flate".to_owned(),
        "--stream-data=compress".to_owned(),
        format!("--compression-level={level}"),
    ];
    if let Some(password) = password_argument(&settings.password) {
        args.push(password);
    }
    args.push(ctx.job.input_path.clone());
    args.push(ctx.job.output_path.clone());

    ctx.progress.report(0.3, "compressing");
    run_qpdf(&program, &args, &ctx.job.input_path, ctx.cancel)?;
    let output_size = check_written_pdf(output, Some(expected))?;

    // An honest compression result: if qpdf could not make the file smaller,
    // there is no "compressed" file to offer. Sizes are reported either way.
    if output_size >= input_size {
        let _ = std::fs::remove_file(output);
        return Err(ConversionError::Other(format!(
            "compression would not make this file smaller ({} \u{2192} {}); the original is unchanged",
            size_label(input_size),
            size_label(output_size)
        )));
    }
    ctx.progress.report(0.95, "compressed");
    Ok(output_size)
}

fn update_password(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    let input = Path::new(&ctx.job.input_path);
    let output = Path::new(&ctx.job.output_path);
    limits::ensure_parent_dir(output)?;
    let encrypted = is_encrypted_document(input)?;
    let program = qpdf_program()?;

    if settings.new_password.is_empty() {
        if !encrypted {
            return Err(ConversionError::Other(
                "this document is not encrypted, so there is no password to remove".to_owned(),
            ));
        }
        let expected = open_pdf(input, &settings.password)?.get_pages().len() as u32;
        let mut args = vec!["--warning-exit-0".to_owned()];
        if let Some(password) = password_argument(&settings.password) {
            args.push(password);
        }
        args.push("--decrypt".to_owned());
        args.push(ctx.job.input_path.clone());
        args.push(ctx.job.output_path.clone());

        ctx.progress.report(0.3, "removing the password");
        run_qpdf(&program, &args, &ctx.job.input_path, ctx.cancel)?;

        let opened = Document::load(output).map_err(|_| ConversionError::InvalidOutput {
            path: output.display().to_string(),
        })?;
        if opened.is_encrypted() {
            return Err(ConversionError::InvalidOutput {
                path: output.display().to_string(),
            });
        }
        return check_written_pdf(output, Some(expected));
    }

    let expected = open_pdf(input, &settings.password)?.get_pages().len() as u32;
    let owner = if settings.owner_password.is_empty() {
        settings.new_password.as_str()
    } else {
        settings.owner_password.as_str()
    };
    let mut args = vec!["--warning-exit-0".to_owned()];
    if let Some(password) = password_argument(&settings.password) {
        args.push(password);
    }
    args.extend([
        "--encrypt".to_owned(),
        format!("--user-password={}", settings.new_password),
        format!("--owner-password={owner}"),
        "--bits=256".to_owned(),
        "--".to_owned(),
        ctx.job.input_path.clone(),
        ctx.job.output_path.clone(),
    ]);

    ctx.progress.report(0.3, "applying the password");
    run_qpdf(&program, &args, &ctx.job.input_path, ctx.cancel)?;

    let at_rest = Document::load(output).map_err(|_| ConversionError::InvalidOutput {
        path: output.display().to_string(),
    })?;
    if !at_rest.is_encrypted() {
        return Err(ConversionError::InvalidOutput {
            path: output.display().to_string(),
        });
    }
    let unlocked =
        Document::load_with_options(output, LoadOptions::with_password(&settings.new_password))
            .map_err(|_| ConversionError::InvalidOutput {
                path: output.display().to_string(),
            })?;
    if unlocked.get_pages().len() as u32 != expected {
        return Err(ConversionError::InvalidOutput {
            path: output.display().to_string(),
        });
    }
    ctx.progress.report(0.95, "validating");
    validate_output(output, FormatId::Pdf)
}

/// One PDF page into one image. A job writes exactly one file, so the interface
/// splits a page range into one job per page; a request that still names several
/// pages is refused rather than silently dropping all but the first.
fn rasterise_page(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    let target_format = ctx.job.output_format;
    let format = image_engine::image_format(target_format);
    let allowed = matches!(
        target_format,
        FormatId::Png | FormatId::Jpeg | FormatId::Webp
    );
    let (true, Some(format)) = (allowed, format) else {
        return Err(ConversionError::Unsupported {
            input: FormatId::Pdf.label().to_owned(),
            output: target_format.label().to_owned(),
        });
    };

    let input = Path::new(&ctx.job.input_path);
    let output = Path::new(&ctx.job.output_path);
    checked_cancel(ctx.cancel)?;

    let total = pdfium::page_count(input, &settings.password)?;
    let pages = page_list(&settings.page_ranges, total)?;
    let [page] = pages.as_slice() else {
        return Err(ConversionError::Other(format!(
            "this job writes one image, but {} pages are selected; split the page range into \
             one job per page",
            pages.len()
        )));
    };

    ctx.progress
        .report(0.2, &format!("rendering page {page} of {total}"));
    checked_cancel(ctx.cancel)?;
    let rendered = pdfium::render_page(input, &settings.password, *page, settings.dpi)?;

    limits::ensure_parent_dir(output)?;
    image_engine::encode_to(&rendered, output, format, settings.raster_quality)?;
    ctx.progress.report(0.9, "validating");
    validate_output(output, target_format)
}

fn images_to_pdf(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    let inputs = &ctx.job.inputs;
    let mut document = Document::with_version("1.7");
    let pages_id = document.new_object_id();
    let mut kids: Vec<Object> = Vec::with_capacity(inputs.len());

    for (index, raw) in inputs.iter().enumerate() {
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(
            index as f64 / inputs.len() as f64,
            &format!("placing image {} of {}", index + 1, inputs.len()),
        );
        kids.push(Object::Reference(add_image_page(
            &mut document,
            Path::new(raw),
            pages_id,
            &settings.layout,
        )?));
    }

    let count = inputs.len() as i64;
    let page_tree = dictionary! {
        "Type" => "Pages",
        "Kids" => kids,
        "Count" => count,
    };
    document
        .objects
        .insert(pages_id, Object::Dictionary(page_tree));

    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
        "PageLayout" => "SinglePage",
    });
    document.trailer.set("Root", catalog_id);
    let info_id = document.add_object(dictionary! {
        "Producer" => text_string(PRODUCER),
        "Creator" => text_string(PRODUCER),
    });
    document.trailer.set("Info", info_id);

    ctx.progress.report(0.9, "validating");
    save_pdf(
        document,
        Path::new(&ctx.job.output_path),
        Some(inputs.len() as u32),
    )
}

fn add_image_page(
    document: &mut Document,
    path: &Path,
    pages_id: ObjectId,
    layout: &ImageLayout,
) -> Result<ObjectId, ConversionError> {
    let detected = format::detect_from_path(path);
    if !NATIVE_RASTER.contains(&detected) {
        return Err(ConversionError::EngineUnavailable {
            engine: EngineId::Pdf.label().to_owned(),
            reason: format!(
                "this build cannot decode {}, so it cannot be placed on a page",
                detected.label()
            ),
        });
    }

    let bytes = std::fs::read(path).map_err(|error| unreadable(path, error))?;
    let (width, height) = header_size(&bytes, path)?;
    if (width as u64) * (height as u64) > limits::MAX_IMAGE_PIXELS {
        return Err(ConversionError::PixelLimit {
            pixels: (width as u64 * height as u64) / 1_000_000,
            limit: limits::MAX_IMAGE_PIXELS / 1_000_000,
        });
    }
    let decoded = decode(&bytes, path)?;

    let image_id = embed_image(document, path, &bytes, &decoded, detected)?;
    let (page_w, page_h) = layout.page_points(width, height);
    let (draw_w, draw_h, x, y) = layout.place(width, height, page_w, page_h);

    let mut content = Stream::new(
        dictionary! {},
        format!("q\n{draw_w:.3} 0 0 {draw_h:.3} {x:.3} {y:.3} cm\n/Im0 Do\nQ\n").into_bytes(),
    );
    content.compress().map_err(|error| {
        ConversionError::Other(format!("could not compress the page content: {error}"))
    })?;
    let content_id = document.add_object(content);

    Ok(document.add_object(dictionary! {
        "Type" => "Page",
        "Parent" => pages_id,
        "MediaBox" => vec![Object::Integer(0), Object::Integer(0), page_w.into(), page_h.into()],
        "Resources" => dictionary! { "XObject" => dictionary! { "Im0" => image_id } },
        "Contents" => content_id,
    }))
}

fn header_size(bytes: &[u8], path: &Path) -> Result<(u32, u32), ConversionError> {
    reader(bytes, path)?
        .into_dimensions()
        .map_err(|error| unreadable(path, error))
}

fn reader<'a>(
    bytes: &'a [u8],
    path: &Path,
) -> Result<ImageReader<Cursor<&'a [u8]>>, ConversionError> {
    // Magic bytes pick the decoder, never the extension.
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| unreadable(path, error))
}

fn decode(bytes: &[u8], path: &Path) -> Result<DynamicImage, ConversionError> {
    reader(bytes, path)?
        .decode()
        .map_err(|error| unreadable(path, error))
}

/// A baseline JPEG already *is* a DCT stream, so its bytes go straight into the
/// PDF instead of being decoded, quantised and re-encoded. Everything else is
/// stored as raw samples behind FlateDecode.
fn embed_image(
    document: &mut Document,
    path: &Path,
    bytes: &[u8],
    image: &DynamicImage,
    source: FormatId,
) -> Result<ObjectId, ConversionError> {
    let (width, height) = (image.width(), image.height());
    let color = image.color();

    if source == FormatId::Jpeg && !color.has_alpha() {
        // `image` has no CMYK pixel type, so a CMYK JPEG fails at decode time
        // long before this point; anything that reaches here is gray or RGB.
        let space = match color {
            ColorType::L8 => Some("DeviceGray"),
            ColorType::Rgb8 => Some("DeviceRGB"),
            _ => None,
        };
        if let Some(space) = space {
            let dict = dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => i64::from(width),
                "Height" => i64::from(height),
                "ColorSpace" => space,
                "BitsPerComponent" => 8,
                "Filter" => "DCTDecode",
            };
            return Ok(
                document.add_object(Stream::new(dict, bytes.to_vec()).with_compression(false))
            );
        }
    }

    if color.has_alpha() {
        let rgba = image.to_rgba8();
        let mut rgb = Vec::with_capacity((width * height * 3) as usize);
        let mut alpha = Vec::with_capacity((width * height) as usize);
        for pixel in rgba.pixels() {
            rgb.extend_from_slice(&pixel.0[..3]);
            alpha.push(pixel.0[3]);
        }
        if alpha.iter().any(|&sample| sample != 255) {
            let image_id = add_sample_stream(document, "DeviceRGB", width, height, rgb)?;
            let mask_id = add_sample_stream(document, "DeviceGray", width, height, alpha)?;
            document
                .get_object_mut(image_id)
                .and_then(Object::as_stream_mut)
                .map_err(|_| corrupt(path))?
                .dict
                .set("SMask", Object::Reference(mask_id));
            return Ok(image_id);
        }
        return add_sample_stream(document, "DeviceRGB", width, height, rgb);
    }

    if matches!(color, ColorType::L8 | ColorType::L16) {
        let gray = image.to_luma8();
        return add_sample_stream(document, "DeviceGray", width, height, gray.into_raw());
    }
    let rgb = image.to_rgb8();
    add_sample_stream(document, "DeviceRGB", width, height, rgb.into_raw())
}

fn add_sample_stream(
    document: &mut Document,
    color_space: &str,
    width: u32,
    height: u32,
    samples: Vec<u8>,
) -> Result<ObjectId, ConversionError> {
    let mut stream = Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => i64::from(width),
            "Height" => i64::from(height),
            "ColorSpace" => color_space,
            "BitsPerComponent" => 8,
        },
        samples,
    );
    stream.compress().map_err(|error| {
        ConversionError::Other(format!("could not compress the image stream: {error}"))
    })?;
    Ok(document.add_object(stream))
}

/// Keep the selected pages, drop the rest, then discard whatever only the
/// dropped pages used. Order is preserved; reordering needs qpdf.
fn extract_pages(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    let input = Path::new(&ctx.job.input_path);
    ctx.progress.report(0.1, "reading");
    let mut document = open_pdf(input, &settings.password)?;

    let total = document.get_pages().len() as u32;
    let keep = page_list(&settings.page_ranges, total)?;
    let drop: Vec<u32> = (1..=total)
        .filter(|number| !keep.contains(number))
        .collect();
    if !drop.is_empty() {
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(0.5, "removing pages");
        document.delete_pages(&drop);
        document.prune_objects();
    }

    ctx.progress.report(0.8, "writing");
    save_pdf(
        document,
        Path::new(&ctx.job.output_path),
        Some(keep.len() as u32),
    )
}

fn rotate_pages(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    let delta = settings.rotation.rem_euclid(360);
    if !matches!(delta, 0 | 90 | 180 | 270) {
        return Err(ConversionError::Other(format!(
            "rotation must be a multiple of 90 degrees, got {}",
            settings.rotation
        )));
    }

    let input = Path::new(&ctx.job.input_path);
    ctx.progress.report(0.1, "reading");
    let mut document = open_pdf(input, &settings.password)?;

    let pages = document.get_pages();
    let total = pages.len() as u32;
    let targets = page_list(&settings.page_ranges, total)?;

    for (index, number) in targets.iter().enumerate() {
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(
            index as f64 / total.max(1) as f64,
            &format!("rotating page {number}"),
        );
        let Some(&page_id) = pages.get(number) else {
            continue;
        };
        let current = inherited_rotation(&document, page_id);
        document
            .get_object_mut(page_id)
            .and_then(Object::as_dict_mut)
            .map_err(|_| corrupt(input))?
            .set("Rotate", (current + delta).rem_euclid(360));
    }

    ctx.progress.report(0.8, "writing");
    save_pdf(document, Path::new(&ctx.job.output_path), Some(total))
}

/// `/Rotate` is inheritable, so a page with no entry of its own takes the value
/// from its ancestors. Adding to 0 would silently undo what the viewer shows.
fn inherited_rotation(document: &Document, page_id: ObjectId) -> i64 {
    let mut cursor = document.get_dictionary(page_id).ok();
    for _ in 0..64 {
        let Some(dictionary) = cursor else { break };
        if let Ok(angle) = dictionary.get(b"Rotate").and_then(Object::as_i64) {
            return angle;
        }
        cursor = match dictionary.get(b"Parent").and_then(Object::as_reference) {
            Ok(parent) => document.get_dictionary(parent).ok(),
            Err(_) => break,
        };
    }
    0
}

fn write_metadata(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    if settings.metadata.is_empty() && !settings.remove_all_metadata {
        return Err(ConversionError::Other(
            "fill in at least one metadata field before running the metadata operation".to_owned(),
        ));
    }

    let input = Path::new(&ctx.job.input_path);
    ctx.progress.report(0.1, "reading");
    let mut document = open_pdf(input, &settings.password)?;
    let total = document.get_pages().len() as u32;

    if settings.remove_all_metadata {
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(0.3, "removing metadata");
    }
    apply_metadata(
        &mut document,
        input,
        &settings.metadata,
        settings.remove_all_metadata,
    )?;
    checked_cancel(ctx.cancel)?;

    ctx.progress.report(0.8, "writing");
    let size = save_pdf(document, Path::new(&ctx.job.output_path), Some(total))?;

    if settings.remove_all_metadata {
        verify_metadata_removed(Path::new(&ctx.job.output_path))?;
    }

    Ok(size)
}

/// Shared by the PDF engine and the Metadata Studio. `remove_all` drops the
/// trailer `/Info` dictionary and the catalog XMP stream; otherwise only the
/// fields explicitly set are changed (an empty string removes that key).
fn apply_metadata(
    document: &mut Document,
    input: &Path,
    edit: &MetadataEdit,
    remove_all: bool,
) -> Result<(), ConversionError> {
    if remove_all {
        document.trailer.remove(b"Info");
        if let Ok(catalog_id) = document.trailer.get(b"Root").and_then(Object::as_reference)
            && let Ok(catalog) = document
                .get_object_mut(catalog_id)
                .and_then(Object::as_dict_mut)
        {
            catalog.remove(b"Metadata");
        }
    }

    if !edit.is_empty() {
        let info_id = ensure_info(document, input)?;
        for (key, value) in edit.entries() {
            let Some(text) = value else { continue };
            let dictionary = document
                .get_object_mut(info_id)
                .and_then(Object::as_dict_mut)
                .map_err(|_| corrupt(input))?;
            if text.is_empty() {
                dictionary.remove(key.as_bytes());
            } else {
                dictionary.set(key, text_string(text));
            }
        }
    }
    Ok(())
}

fn verify_metadata_removed(output: &Path) -> Result<(), ConversionError> {
    let written = Document::load(output).map_err(|_| ConversionError::InvalidOutput {
        path: output.display().to_string(),
    })?;
    let info_left = written
        .trailer
        .get(b"Info")
        .ok()
        .and_then(|object| object.as_reference().ok())
        .and_then(|id| written.get_dictionary(id).ok())
        .map(|dictionary| !dictionary.is_empty())
        .unwrap_or(false);
    let xmp_left = written
        .trailer
        .get(b"Root")
        .ok()
        .and_then(|object| object.as_reference().ok())
        .and_then(|id| written.get_dictionary(id).ok())
        .map(|catalog| catalog.get(b"Metadata").is_ok())
        .unwrap_or(false);
    if info_left || xmp_left {
        return Err(ConversionError::InvalidOutput {
            path: output.display().to_string(),
        });
    }
    Ok(())
}

/// Metadata Studio entry point: rewrite a PDF to a new path without a job.
/// Never writes over the source, and proves the result is still a readable PDF.
pub fn rewrite_metadata(
    input: &Path,
    output: &Path,
    password: &str,
    edit: &MetadataEdit,
    remove_all: bool,
) -> Result<u64, ConversionError> {
    if edit.is_empty() && !remove_all {
        return Err(ConversionError::Other(
            "fill in at least one metadata field first".to_owned(),
        ));
    }
    let input_abs = std::fs::canonicalize(input).map_err(|error| unreadable(input, error))?;
    let parent = output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    limits::ensure_parent_dir(output)?;
    let parent_abs = std::fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
    let output_abs = parent_abs.join(
        output
            .file_name()
            .ok_or_else(|| ConversionError::Other("choose an output file name".to_owned()))?,
    );
    if input_abs == output_abs {
        return Err(ConversionError::Other(
            "the output would replace the original; choose a different file name".to_owned(),
        ));
    }

    let mut document = open_pdf(input, password)?;
    let total = document.get_pages().len() as u32;
    apply_metadata(&mut document, input, edit, remove_all)?;
    let size = save_pdf(document, output, Some(total))?;
    if remove_all {
        verify_metadata_removed(output)?;
    }
    Ok(size)
}

/// The `/Info` dictionary is optional; create it when the document has none.
fn ensure_info(document: &mut Document, input: &Path) -> Result<ObjectId, ConversionError> {
    let existing = document
        .trailer
        .get(b"Info")
        .ok()
        .and_then(|object| object.as_reference().ok());
    if let Some(id) = existing {
        document
            .get_object_mut(id)
            .and_then(Object::as_dict_mut)
            .map_err(|_| corrupt(input))?;
        return Ok(id);
    }
    let id = document.add_object(Object::Dictionary(Dictionary::new()));
    document.trailer.set("Info", id);
    Ok(id)
}

fn ascii_text<'a>(text: &'a str, what: &str) -> Result<&'a str, ConversionError> {
    if text.is_ascii() {
        Ok(text)
    } else {
        Err(ConversionError::Other(format!(
            "{what} must use plain ASCII letters, digits and punctuation in this build; \
             the built-in Helvetica font cannot draw other scripts"
        )))
    }
}

fn escape_pdf_text(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '\\' => escaped.push_str("\\\\"),
            '(' => escaped.push_str("\\("),
            ')' => escaped.push_str("\\)"),
            '\n' | '\r' => escaped.push(' '),
            other => escaped.push(other),
        }
    }
    escaped
}

fn rgb_from_hex(color: &str) -> Result<(f32, f32, f32), ConversionError> {
    let hex = color.trim().trim_start_matches('#');
    let bad = || {
        ConversionError::Other(format!(
            "\"{color}\" is not a colour; use a six-digit hex value like #c0392b"
        ))
    };
    if hex.len() != 6 {
        return Err(bad());
    }
    let channel = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&hex[range], 16)
            .map(|value| value as f32 / 255.0)
            .map_err(|_| bad())
    };
    Ok((channel(0..2)?, channel(2..4)?, channel(4..6)?))
}

/// Width approximation for Helvetica, which is enough to centre and right-align
/// stamps. PDF has no text-measuring primitive without reading font metrics.
fn text_width(text: &str, size: f32) -> f32 {
    size * 0.52 * text.chars().count() as f32
}

/// Effective page size, following `/MediaBox` up the page tree like a viewer.
fn page_size(document: &Document, page_id: ObjectId) -> (f32, f32) {
    let mut cursor = document.get_dictionary(page_id).ok();
    for _ in 0..64 {
        let Some(dictionary) = cursor else { break };
        if let Ok(values) = dictionary.get(b"MediaBox").and_then(Object::as_array) {
            let numbers: Vec<f32> = values
                .iter()
                .filter_map(|object| {
                    object
                        .as_i64()
                        .map(|value| value as f32)
                        .or_else(|_| object.as_f32())
                        .ok()
                })
                .collect();
            if numbers.len() == 4 {
                return (
                    (numbers[2] - numbers[0]).abs().max(1.0),
                    (numbers[3] - numbers[1]).abs().max(1.0),
                );
            }
        }
        cursor = dictionary
            .get(b"Parent")
            .and_then(Object::as_reference)
            .ok()
            .and_then(|parent| document.get_dictionary(parent).ok());
    }
    (595.0, 842.0)
}

/// Page dictionaries normally point at resource dictionaries directly, but a
/// shared indirect dictionary is legal. Materialising it keeps the existing
/// fonts and images while letting the stamp add its own entries.
fn materialised_resources(document: &mut Document, page_id: ObjectId) -> Dictionary {
    let existing = document
        .get_dictionary(page_id)
        .ok()
        .and_then(|page| page.get(b"Resources").ok())
        .cloned();
    match existing {
        Some(Object::Dictionary(dictionary)) => dictionary,
        Some(Object::Reference(id)) => document.get_dictionary(id).cloned().unwrap_or_default(),
        _ => Dictionary::new(),
    }
}

fn ensure_resource_entry(
    document: &mut Document,
    page_id: ObjectId,
    group: &str,
    key: &str,
    object_id: ObjectId,
) {
    let mut resources = materialised_resources(document, page_id);
    let mut sub = match resources.get(group.as_bytes()) {
        Ok(Object::Dictionary(dictionary)) => dictionary.clone(),
        Ok(Object::Reference(id)) => document.get_dictionary(*id).cloned().unwrap_or_default(),
        _ => Dictionary::new(),
    };
    if sub.get(key.as_bytes()).is_err() {
        sub.set(key, Object::Reference(object_id));
    }
    resources.set(group, sub);
    if let Ok(page) = document
        .get_object_mut(page_id)
        .and_then(Object::as_dict_mut)
    {
        page.set("Resources", resources);
    }
}

fn add_standard_font(document: &mut Document) -> ObjectId {
    document.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    })
}

/// Add a second content stream instead of rewriting the first. `Contents` may be
/// one stream, an array, or an indirect array; all three are preserved.
fn append_page_content(
    document: &mut Document,
    page_id: ObjectId,
    content: String,
    input: &Path,
) -> Result<(), ConversionError> {
    let mut stream = Stream::new(dictionary! {}, content.into_bytes());
    stream
        .compress()
        .map_err(|error| ConversionError::Other(format!("could not compress content: {error}")))?;
    let stream_id = document.add_object(stream);

    let current = document
        .get_dictionary(page_id)
        .ok()
        .and_then(|page| page.get(b"Contents").ok())
        .cloned();
    let replacement = match current {
        Some(Object::Array(mut array)) => {
            array.push(Object::Reference(stream_id));
            Object::Array(array)
        }
        Some(Object::Reference(id)) => match document.get_object(id).cloned() {
            Ok(Object::Array(mut array)) => {
                array.push(Object::Reference(stream_id));
                Object::Array(array)
            }
            _ => Object::Array(vec![Object::Reference(id), Object::Reference(stream_id)]),
        },
        _ => Object::Reference(stream_id),
    };
    document
        .get_object_mut(page_id)
        .and_then(Object::as_dict_mut)
        .map_err(|_| corrupt(input))?
        .set("Contents", replacement);
    Ok(())
}

fn stamp_watermark(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    let raw = settings.watermark.text.trim();
    if raw.is_empty() {
        return Err(ConversionError::Other(
            "type the watermark text before running the watermark operation".to_owned(),
        ));
    }
    let text = ascii_text(raw, "watermark text")?;
    let (red, green, blue) = rgb_from_hex(&settings.watermark.color)?;
    let size = settings.watermark.font_size;
    let opacity = settings.watermark.opacity;
    let radians = settings.watermark.angle.to_radians();
    let (sin, cos) = radians.sin_cos();
    let neg_sin = -sin;
    let escaped = escape_pdf_text(text);

    let input = Path::new(&ctx.job.input_path);
    ctx.progress.report(0.1, "reading");
    let mut document = open_pdf(input, &settings.password)?;
    let pages = document.get_pages();
    let total = pages.len() as u32;
    let targets = page_list(&settings.page_ranges, total)?;
    let font_id = add_standard_font(&mut document);
    let graphics_id = document.add_object(dictionary! {
        "Type" => "ExtGState",
        "ca" => opacity,
        "CA" => opacity,
    });

    for (index, number) in targets.iter().enumerate() {
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(
            index as f64 / targets.len().max(1) as f64,
            &format!("stamping page {number}"),
        );
        let Some(&page_id) = pages.get(number) else {
            continue;
        };
        ensure_resource_entry(&mut document, page_id, "Font", "UCWMF", font_id);
        ensure_resource_entry(&mut document, page_id, "ExtGState", "UCGS", graphics_id);
        let (width, height) = page_size(&document, page_id);
        let span = text_width(text, size);
        let x = width / 2.0 - span / 2.0 * cos;
        let y = height / 2.0 - span / 2.0 * sin;
        let content = format!(
            "q\n/UCGS gs\nBT\n/UCWMF {size:.2} Tf\n{red:.3} {green:.3} {blue:.3} rg\n\
             {cos:.5} {sin:.5} {neg_sin:.5} {cos:.5} {x:.2} {y:.2} Tm\n({escaped}) Tj\nET\nQ\n"
        );
        append_page_content(&mut document, page_id, content, input)?;
    }

    ctx.progress.report(0.9, "validating");
    save_pdf(document, Path::new(&ctx.job.output_path), Some(total))
}

fn stamp_page_text(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    if !settings.page_text.has_text() {
        return Err(ConversionError::Other(
            "fill in at least one header or footer field before running this operation".to_owned(),
        ));
    }
    let text = &settings.page_text;
    for value in [
        &text.header_left,
        &text.header_center,
        &text.header_right,
        &text.footer_left,
        &text.footer_center,
        &text.footer_right,
    ] {
        ascii_text(value, "header and footer text")?;
    }

    let input = Path::new(&ctx.job.input_path);
    ctx.progress.report(0.1, "reading");
    let mut document = open_pdf(input, &settings.password)?;
    let title = document_title(&document);
    let pages = document.get_pages();
    let total = pages.len() as u32;
    let targets = page_list(&settings.page_ranges, total)?;
    let font_id = add_standard_font(&mut document);
    let size = settings.page_text.font_size;
    let margin = settings.page_text.margin_mm * POINTS_PER_MM;

    for (index, number) in targets.iter().enumerate() {
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(
            index as f64 / targets.len().max(1) as f64,
            &format!("numbering page {number}"),
        );
        let Some(&page_id) = pages.get(number) else {
            continue;
        };
        ensure_resource_entry(&mut document, page_id, "Font", "UCTXT", font_id);
        let (width, height) = page_size(&document, page_id);
        let shown = settings.page_text.start_number + number.saturating_sub(1);
        let mut content = String::from("q\nBT\n0 0 0 rg\n");
        let mut slot = |raw: &str, anchor: Anchor, y: f32, box_width: f32| {
            if raw.trim().is_empty() {
                return;
            }
            let filled = raw
                .replace("{page}", &shown.to_string())
                .replace("{total}", &total.to_string())
                .replace("{title}", &title);
            let filled = escape_pdf_text(filled.trim_end());
            let advance = text_width(&filled, size);
            let x = match anchor {
                Anchor::Left => margin,
                Anchor::Center => (box_width - advance) / 2.0,
                Anchor::Right => box_width - margin - advance,
            };
            content.push_str(&format!(
                "/UCTXT {size:.2} Tf {x:.2} {y:.2} Td ({filled}) Tj 0 0 Td\n"
            ));
        };
        let header_y = height - margin - size;
        let footer_y = margin;
        slot(&text.header_left, Anchor::Left, header_y, width);
        slot(&text.header_center, Anchor::Center, header_y, width);
        slot(&text.header_right, Anchor::Right, header_y, width);
        slot(&text.footer_left, Anchor::Left, footer_y, width);
        slot(&text.footer_center, Anchor::Center, footer_y, width);
        slot(&text.footer_right, Anchor::Right, footer_y, width);
        content.push_str("ET\nQ\n");
        append_page_content(&mut document, page_id, content, input)?;
    }

    ctx.progress.report(0.9, "validating");
    save_pdf(document, Path::new(&ctx.job.output_path), Some(total))
}

#[derive(Clone, Copy)]
enum Anchor {
    Left,
    Center,
    Right,
}

fn document_title(document: &Document) -> String {
    document
        .trailer
        .get(b"Info")
        .ok()
        .and_then(|object| object.as_reference().ok())
        .and_then(|id| document.get_dictionary(id).ok())
        .and_then(|info| info.get(b"Title").ok())
        .and_then(|object| lopdf::decode_text_string(object).ok())
        .map(|title| title.trim().to_owned())
        .filter(|title| title.is_ascii())
        .unwrap_or_default()
}

fn annotate_pages(ctx: &EngineContext, settings: &PdfJobSettings) -> Result<u64, ConversionError> {
    let text = settings.annotation.text.trim();
    if text.is_empty() {
        return Err(ConversionError::Other(
            "type the note text before running the annotation operation".to_owned(),
        ));
    }

    let input = Path::new(&ctx.job.input_path);
    ctx.progress.report(0.1, "reading");
    let mut document = open_pdf(input, &settings.password)?;
    let pages = document.get_pages();
    let total = pages.len() as u32;
    let targets = page_list(&settings.page_ranges, total)?;
    let margin = settings.annotation.margin_mm * POINTS_PER_MM;

    for (index, number) in targets.iter().enumerate() {
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(
            index as f64 / targets.len().max(1) as f64,
            &format!("annotating page {number}"),
        );
        let Some(&page_id) = pages.get(number) else {
            continue;
        };
        let (width, height) = page_size(&document, page_id);
        let right = width - margin;
        let top = height - margin;
        let mut annotation = dictionary! {
            "Type" => "Annot",
            "Subtype" => "Text",
            "Rect" => vec![
                Object::Real(right - 20.0),
                Object::Real(top - 20.0),
                Object::Real(right),
                Object::Real(top),
            ],
            "Contents" => text_string(text),
            "Name" => "Comment",
            "F" => 4_i64,
            "CA" => 0.85,
            "P" => Object::Reference(page_id),
        };
        if !settings.annotation.author.trim().is_empty() {
            annotation.set("T", text_string(settings.annotation.author.trim()));
        }
        let annotation_id = document.add_object(annotation);

        let existing = document
            .get_dictionary(page_id)
            .ok()
            .and_then(|page| page.get(b"Annots").ok())
            .cloned();
        let annots = match existing {
            Some(Object::Array(mut array)) => {
                array.push(Object::Reference(annotation_id));
                Object::Array(array)
            }
            Some(Object::Reference(id)) => match document.get_object(id).cloned() {
                Ok(Object::Array(mut array)) => {
                    array.push(Object::Reference(annotation_id));
                    Object::Array(array)
                }
                _ => Object::Array(vec![
                    Object::Reference(id),
                    Object::Reference(annotation_id),
                ]),
            },
            _ => Object::Array(vec![Object::Reference(annotation_id)]),
        };
        document
            .get_object_mut(page_id)
            .and_then(Object::as_dict_mut)
            .map_err(|_| corrupt(input))?
            .set("Annots", annots);
    }

    ctx.progress.report(0.9, "validating");
    save_pdf(document, Path::new(&ctx.job.output_path), Some(total))
}

/// Header-only read for the drop list: size, page count, nothing else.
pub fn page_count(path: &Path) -> Option<u32> {
    if std::fs::metadata(path).ok()?.len() > MAX_PROBED_BYTES {
        return None;
    }
    Document::load_metadata(path)
        .ok()
        .map(|meta| meta.page_count)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedImage {
    pub path: String,
    pub page: u32,
    pub width: u32,
    pub height: u32,
    pub format: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageExtraction {
    pub directory: String,
    pub images: Vec<ExtractedImage>,
    pub skipped: Vec<String>,
}

/// Pull image XObjects out of the selected pages. JPEG streams are copied
/// verbatim; raw samples are rebuilt as PNG. Unsupported encodings are reported
/// instead of being written as broken files.
pub fn extract_images(
    path: &Path,
    password: &str,
    page_spec: &str,
    output_dir: &Path,
) -> Result<ImageExtraction, ConversionError> {
    let document = open_pdf(path, password)?;
    let total = document.get_pages().len() as u32;
    let targets = page_list(page_spec, total)?;
    std::fs::create_dir_all(output_dir).map_err(|error| unreadable(output_dir, error))?;
    if !output_dir.is_dir() {
        return Err(ConversionError::Other(format!(
            "{} is not a folder; choose a folder for extracted images",
            output_dir.display()
        )));
    }

    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "images".to_owned());
    let pages = document.get_pages();
    let mut extraction = ImageExtraction {
        directory: output_dir.display().to_string(),
        images: Vec::new(),
        skipped: Vec::new(),
    };
    let mut seen: std::collections::HashSet<ObjectId> = std::collections::HashSet::new();
    let mut counter = 0_u32;

    for number in targets {
        let Some(&page_id) = pages.get(&number) else {
            continue;
        };
        let resources = document
            .get_dictionary(page_id)
            .ok()
            .and_then(|page| page.get(b"Resources").ok())
            .and_then(|object| resolve_dict(&document, object))
            .cloned();
        let Some(resources) = resources else { continue };
        let xobjects = resources
            .get(b"XObject")
            .ok()
            .and_then(|object| resolve_dict(&document, object))
            .cloned();
        let Some(xobjects) = xobjects else { continue };

        for (name, object) in xobjects.iter() {
            collect_images(
                &document,
                object,
                number,
                &stem,
                output_dir,
                &mut extraction,
                &mut seen,
                &mut counter,
                0,
                &String::from_utf8_lossy(name),
            );
        }
    }

    Ok(extraction)
}

fn resolve_dict<'a>(document: &'a Document, object: &'a Object) -> Option<&'a Dictionary> {
    match object {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Reference(id) => document.get_dictionary(*id).ok(),
        _ => None,
    }
}

fn resolve_stream<'a>(document: &'a Document, object: &'a Object) -> Option<&'a Stream> {
    match object {
        Object::Stream(stream) => Some(stream),
        Object::Reference(id) => document.get_object(*id).and_then(Object::as_stream).ok(),
        _ => None,
    }
}

#[allow(clippy::too_many_arguments)]
fn collect_images(
    document: &Document,
    object: &Object,
    page: u32,
    stem: &str,
    output_dir: &Path,
    extraction: &mut ImageExtraction,
    seen: &mut std::collections::HashSet<ObjectId>,
    counter: &mut u32,
    depth: usize,
    resource_name: &str,
) {
    if depth > 8 {
        extraction.skipped.push(format!(
            "page {page}: nested form {resource_name} is too deep"
        ));
        return;
    }
    let Some(stream) = resolve_stream(document, object) else {
        return;
    };
    if let Object::Reference(id) = object
        && !seen.insert(*id)
    {
        return;
    }

    let subtype = stream
        .dict
        .get(b"Subtype")
        .and_then(Object::as_name)
        .map(|name| String::from_utf8_lossy(name).into_owned())
        .unwrap_or_default();

    if subtype == "Form" {
        if let Some(resources) = stream
            .dict
            .get(b"Resources")
            .ok()
            .and_then(|object| resolve_dict(document, object))
            && let Some(xobjects) = resources
                .get(b"XObject")
                .ok()
                .and_then(|object| resolve_dict(document, object))
        {
            for (name, nested) in xobjects.iter() {
                collect_images(
                    document,
                    nested,
                    page,
                    stem,
                    output_dir,
                    extraction,
                    seen,
                    counter,
                    depth + 1,
                    &String::from_utf8_lossy(name),
                );
            }
        }
        return;
    }
    if subtype != "Image" {
        return;
    }

    let width = stream
        .dict
        .get(b"Width")
        .and_then(Object::as_i64)
        .unwrap_or(0);
    let height = stream
        .dict
        .get(b"Height")
        .and_then(Object::as_i64)
        .unwrap_or(0);
    if width <= 0 || height <= 0 {
        extraction
            .skipped
            .push(format!("page {page}: {resource_name} has no usable size"));
        return;
    }
    if (width as u64) * (height as u64) > limits::MAX_IMAGE_PIXELS {
        extraction.skipped.push(format!(
            "page {page}: {resource_name} exceeds the {} megapixel limit",
            limits::MAX_IMAGE_PIXELS / 1_000_000
        ));
        return;
    }

    let filters = stream_filters(stream);
    let is_jpeg = filters.last().map(String::as_str) == Some("DCTDecode");
    let mask = stream
        .dict
        .get(b"SMask")
        .ok()
        .and_then(|object| resolve_stream(document, object));

    if is_jpeg {
        match image::load_from_memory(&stream.content) {
            Ok(decoded) => {
                let decoded = decoded.to_rgba8();
                if let Some(alpha) = mask.and_then(|mask| gray_samples(mask, width as u32, height as u32)) {
                    let mut canvas = decoded;
                    for (pixel, cover) in canvas.pixels_mut().zip(alpha) {
                        pixel.0[3] = cover;
                    }
                    *counter += 1;
                    let file = unique_file(output_dir, stem, page, *counter, "png");
                    if image::DynamicImage::ImageRgba8(canvas)
                        .save_with_format(&file, image::ImageFormat::Png)
                        .is_ok()
                    {
                        extraction.images.push(ExtractedImage {
                            path: file.display().to_string(),
                            page,
                            width: width as u32,
                            height: height as u32,
                            format: "png".to_owned(),
                        });
                        return;
                    }
                } else {
                    *counter += 1;
                    let file = unique_file(output_dir, stem, page, *counter, "jpg");
                    if std::fs::write(&file, &stream.content).is_ok()
                        && image::load_from_memory(&std::fs::read(&file).unwrap_or_default())
                            .is_ok()
                    {
                        extraction.images.push(ExtractedImage {
                            path: file.display().to_string(),
                            page,
                            width: width as u32,
                            height: height as u32,
                            format: "jpg".to_owned(),
                        });
                        return;
                    }
                    let _ = std::fs::remove_file(&file);
                }
                extraction.skipped.push(format!(
                    "page {page}: {resource_name} could not be written as a readable image"
                ));
            }
            Err(error) => extraction.skipped.push(format!(
                "page {page}: {resource_name} uses a JPEG variant this build cannot decode ({error})"
            )),
        }
        return;
    }

    let raw = stream.decompressed_content().ok();
    let Some(raw) = raw else {
        extraction.skipped.push(format!(
            "page {page}: {resource_name} uses an unsupported compression ({})",
            filters.join(", ")
        ));
        return;
    };
    let Some(pixels) = samples_to_rgba(document, stream, &raw, width as u32, height as u32) else {
        extraction.skipped.push(format!(
            "page {page}: {resource_name} uses an unsupported colour space"
        ));
        return;
    };
    let Some(buffer) = image::RgbaImage::from_raw(width as u32, height as u32, pixels) else {
        extraction.skipped.push(format!(
            "page {page}: {resource_name} has a mismatched sample count"
        ));
        return;
    };
    let mut buffer = buffer;
    if let Some(alpha) = mask.and_then(|mask| gray_samples(mask, width as u32, height as u32)) {
        for (pixel, cover) in buffer.pixels_mut().zip(alpha) {
            pixel.0[3] = cover;
        }
    }
    *counter += 1;
    let file = unique_file(output_dir, stem, page, *counter, "png");
    if image::DynamicImage::ImageRgba8(buffer)
        .save_with_format(&file, image::ImageFormat::Png)
        .is_ok()
    {
        extraction.images.push(ExtractedImage {
            path: file.display().to_string(),
            page,
            width: width as u32,
            height: height as u32,
            format: "png".to_owned(),
        });
    } else {
        extraction
            .skipped
            .push(format!("page {page}: {resource_name} could not be written"));
    }
}

fn unique_file(
    dir: &Path,
    stem: &str,
    page: u32,
    index: u32,
    extension: &str,
) -> std::path::PathBuf {
    let mut candidate = dir.join(format!("{stem}-page-{page}-{index}.{extension}"));
    let mut attempt = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{stem}-page-{page}-{index}-{attempt}.{extension}"));
        attempt += 1;
    }
    candidate
}

fn stream_filters(stream: &Stream) -> Vec<String> {
    match stream.dict.get(b"Filter") {
        Ok(Object::Name(name)) => vec![String::from_utf8_lossy(name).into_owned()],
        Ok(Object::Array(names)) => names
            .iter()
            .filter_map(|name| name.as_name().ok())
            .map(|name| String::from_utf8_lossy(name).into_owned())
            .collect(),
        _ => Vec::new(),
    }
}

fn gray_samples(stream: &Stream, width: u32, height: u32) -> Option<Vec<u8>> {
    let raw = stream.decompressed_content().ok()?;
    let bits = stream
        .dict
        .get(b"BitsPerComponent")
        .and_then(Object::as_i64)
        .unwrap_or(8) as u32;
    if bits != 8 {
        return None;
    }
    let expected = (width as usize).checked_mul(height as usize)?;
    (raw.len() >= expected).then(|| raw[..expected].to_vec())
}

fn samples_to_rgba(
    document: &Document,
    stream: &Stream,
    raw: &[u8],
    width: u32,
    height: u32,
) -> Option<Vec<u8>> {
    let space = color_space(document, stream.dict.get(b"ColorSpace").ok()?)?;
    let bits = stream
        .dict
        .get(b"BitsPerComponent")
        .and_then(Object::as_i64)
        .unwrap_or(8) as u32;
    let count = (width as usize).checked_mul(height as usize)?;
    match space {
        Space::Gray => {
            if bits == 8 {
                let samples = raw.get(..count)?;
                let mut out = Vec::with_capacity(count * 4);
                for &value in samples {
                    out.extend_from_slice(&[value, value, value, 255]);
                }
                Some(out)
            } else if bits == 1 {
                gray_one_bit(raw, count)
            } else if bits == 16 {
                let mut out = Vec::with_capacity(count * 4);
                for chunk in raw.get(..count * 2)?.as_chunks::<2>().0 {
                    let value = chunk[0];
                    out.extend_from_slice(&[value, value, value, 255]);
                }
                Some(out)
            } else {
                None
            }
        }
        Space::Rgb => {
            let mut out = Vec::with_capacity(count * 4);
            if bits == 8 {
                for chunk in raw.get(..count * 3)?.as_chunks::<3>().0 {
                    out.extend_from_slice(&[chunk[0], chunk[1], chunk[2], 255]);
                }
                Some(out)
            } else if bits == 16 {
                for chunk in raw.get(..count * 6)?.as_chunks::<6>().0 {
                    out.extend_from_slice(&[chunk[0], chunk[2], chunk[4], 255]);
                }
                Some(out)
            } else {
                None
            }
        }
        Space::Cmyk => {
            let mut out = Vec::with_capacity(count * 4);
            for chunk in raw.get(..count * 4)?.as_chunks::<4>().0 {
                let (c, m, y, k) = (
                    chunk[0] as f32 / 255.0,
                    chunk[1] as f32 / 255.0,
                    chunk[2] as f32 / 255.0,
                    chunk[3] as f32 / 255.0,
                );
                let channel = |value: f32| ((1.0 - value) * (1.0 - k) * 255.0).round() as u8;
                out.extend_from_slice(&[channel(c), channel(m), channel(y), 255]);
            }
            Some(out)
        }
        Space::Indexed {
            base,
            hival,
            lookup,
        } => {
            let components = match *base {
                Space::Gray => 1,
                Space::Rgb => 3,
                Space::Cmyk => 4,
                Space::Indexed { .. } => return None,
            };
            let samples = match bits {
                8 => raw.get(..count)?.to_vec(),
                4 => unpack_indices(raw, count, 4)?,
                2 => unpack_indices(raw, count, 2)?,
                1 => unpack_indices(raw, count, 1)?,
                _ => return None,
            };
            let mut out = Vec::with_capacity(count * 4);
            for index in samples {
                if index as u32 > hival {
                    out.extend_from_slice(&[0, 0, 0, 255]);
                    continue;
                }
                let start = index as usize * components;
                let entry = lookup.get(start..start + components)?;
                match *base {
                    Space::Gray => out.extend_from_slice(&[entry[0], entry[0], entry[0], 255]),
                    Space::Rgb => out.extend_from_slice(&[entry[0], entry[1], entry[2], 255]),
                    Space::Cmyk => {
                        let (c, m, y, k) = (
                            entry[0] as f32 / 255.0,
                            entry[1] as f32 / 255.0,
                            entry[2] as f32 / 255.0,
                            entry[3] as f32 / 255.0,
                        );
                        let channel = |value: f32| ((1.0 - value) * (1.0 - k) * 255.0) as u8;
                        out.extend_from_slice(&[channel(c), channel(m), channel(y), 255]);
                    }
                    Space::Indexed { .. } => return None,
                }
            }
            Some(out)
        }
    }
}

fn gray_one_bit(raw: &[u8], count: usize) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(count * 4);
    for index in 0..count {
        let byte = *raw.get(index / 8)?;
        let bit = (byte >> (7 - index % 8)) & 1;
        let value = if bit == 1 { 255 } else { 0 };
        out.extend_from_slice(&[value, value, value, 255]);
    }
    Some(out)
}

fn unpack_indices(raw: &[u8], count: usize, bits: u32) -> Option<Vec<u8>> {
    let per_byte = 8 / bits;
    let mut out = Vec::with_capacity(count);
    let mask = (1_u16 << bits) as u8 - 1;
    for index in 0..count {
        let byte = *raw.get(index / per_byte as usize)?;
        let shift = 8 - bits * (index as u32 % per_byte + 1);
        out.push((byte >> shift) & mask);
    }
    Some(out)
}

enum Space {
    Gray,
    Rgb,
    Cmyk,
    Indexed {
        base: Box<Space>,
        hival: u32,
        lookup: Vec<u8>,
    },
}

fn color_space(document: &Document, object: &Object) -> Option<Space> {
    match object {
        Object::Name(name) => match name.as_slice() {
            b"DeviceGray" | b"CalGray" => Some(Space::Gray),
            b"DeviceRGB" | b"CalRGB" => Some(Space::Rgb),
            b"DeviceCMYK" => Some(Space::Cmyk),
            _ => None,
        },
        Object::Reference(id) => color_space(document, document.get_object(*id).ok()?),
        Object::Array(parts) => {
            let family = parts.first()?.as_name().ok()?;
            match family {
                b"ICCBased" => {
                    let stream = parts
                        .get(1)
                        .and_then(|object| resolve_stream(document, object))?;
                    match stream.dict.get(b"N").and_then(Object::as_i64).ok()? {
                        1 => Some(Space::Gray),
                        3 => Some(Space::Rgb),
                        4 => Some(Space::Cmyk),
                        _ => None,
                    }
                }
                b"Indexed" => {
                    let base = color_space(document, parts.get(1)?)?;
                    let hival = parts.get(2)?.as_i64().ok()?.max(0) as u32;
                    let lookup = match parts.get(3)? {
                        Object::String(bytes, _) => bytes.clone(),
                        Object::Reference(id) => match document.get_object(*id).ok()? {
                            Object::String(bytes, _) => bytes.clone(),
                            Object::Stream(stream) => stream.decompressed_content().ok()?,
                            _ => return None,
                        },
                        _ => return None,
                    };
                    Some(Space::Indexed {
                        base: Box::new(base),
                        hival,
                        lookup,
                    })
                }
                _ => None,
            }
        }
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPageReport {
    pub number: u32,
    pub width_pt: f32,
    pub height_pt: f32,
    pub rotation: i64,
    pub fonts: Vec<String>,
    pub image_count: u32,
    pub annotation_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfDeepInfo {
    pub path: String,
    pub file_size: u64,
    pub version: String,
    pub encrypted: bool,
    pub page_count: u32,
    pub pages: Vec<PdfPageReport>,
    pub fonts: Vec<String>,
    pub image_count: u32,
    pub annotation_count: u32,
    pub bookmarks: u32,
    pub form_fields: u32,
    pub has_page_labels: bool,
    pub tagged: bool,
    pub embedded_files: u32,
}

/// A structural inspector: what the pages really contain, read from the object
/// graph rather than guessed from the file name.
pub fn deep_inspect(path: &Path, password: &str) -> Result<PdfDeepInfo, ConversionError> {
    let document = open_pdf(path, password)?;
    let file_size = std::fs::metadata(path)
        .map_err(|error| unreadable(path, error))?
        .len();
    let pages = document.get_pages();
    let mut reports = Vec::with_capacity(pages.len());
    let mut all_fonts = std::collections::BTreeSet::new();
    let mut image_total = 0_u32;
    let mut annotation_total = 0_u32;

    for (&number, &page_id) in &pages {
        let resources = document
            .get_dictionary(page_id)
            .ok()
            .and_then(|page| page.get(b"Resources").ok())
            .and_then(|object| resolve_dict(&document, object))
            .cloned();
        let mut fonts = Vec::new();
        let mut image_count = 0_u32;
        if let Some(resources) = &resources {
            if let Some(font_dict) = resources
                .get(b"Font")
                .ok()
                .and_then(|object| resolve_dict(&document, object))
            {
                for (_, font) in font_dict.iter() {
                    if let Some(name) = resolve_dict(&document, font)
                        .and_then(|dictionary| dictionary.get(b"BaseFont").ok())
                        .and_then(|object| object.as_name().ok())
                    {
                        fonts.push(String::from_utf8_lossy(name).into_owned());
                    }
                }
            }
            if let Some(xobjects) = resources
                .get(b"XObject")
                .ok()
                .and_then(|object| resolve_dict(&document, object))
            {
                for (_, object) in xobjects.iter() {
                    if let Some(stream) = resolve_stream(&document, object)
                        && stream
                            .dict
                            .get(b"Subtype")
                            .and_then(Object::as_name)
                            .map(|name| name == b"Image")
                            .unwrap_or(false)
                    {
                        image_count += 1;
                    }
                }
            }
        }
        fonts.sort();
        fonts.dedup();
        all_fonts.extend(fonts.iter().cloned());
        image_total += image_count;

        let annotations = document
            .get_dictionary(page_id)
            .ok()
            .and_then(|page| page.get(b"Annots").ok())
            .and_then(|object| resolve_array(&document, object))
            .map(|items| items.len() as u32)
            .unwrap_or(0);
        annotation_total += annotations;

        let (width, height) = page_size(&document, page_id);
        reports.push(PdfPageReport {
            number,
            width_pt: width,
            height_pt: height,
            rotation: inherited_rotation(&document, page_id),
            fonts,
            image_count,
            annotation_count: annotations,
        });
    }

    let catalog = document.catalog().ok();
    let bookmarks = catalog
        .and_then(|catalog| catalog.get(b"Outlines").ok())
        .map(|object| count_outline(&document, object, 0))
        .unwrap_or(0);
    let form_fields = catalog
        .and_then(|catalog| catalog.get(b"AcroForm").ok())
        .and_then(|object| resolve_dict(&document, object))
        .and_then(|form| form.get(b"Fields").ok())
        .and_then(|object| resolve_array(&document, object))
        .map(|fields| fields.len() as u32)
        .unwrap_or(0);
    let has_page_labels = catalog
        .map(|catalog| catalog.get(b"PageLabels").is_ok())
        .unwrap_or(false);
    let tagged = catalog
        .and_then(|catalog| catalog.get(b"MarkInfo").ok())
        .and_then(|object| resolve_dict(&document, object))
        .and_then(|marks| marks.get(b"Marked").ok())
        .and_then(|object| object.as_bool().ok())
        .unwrap_or(false);
    let embedded_files = catalog
        .and_then(|catalog| catalog.get(b"Names").ok())
        .and_then(|object| resolve_dict(&document, object))
        .and_then(|names| names.get(b"EmbeddedFiles").ok())
        .and_then(|object| resolve_dict(&document, object))
        .and_then(|files| files.get(b"Names").ok())
        .and_then(|object| resolve_array(&document, object))
        .map(|items| (items.len() / 2) as u32)
        .unwrap_or(0);

    Ok(PdfDeepInfo {
        path: path.display().to_string(),
        file_size,
        version: document.version.clone(),
        encrypted: document.was_encrypted(),
        page_count: pages.len() as u32,
        pages: reports,
        fonts: all_fonts.into_iter().collect(),
        image_count: image_total,
        annotation_count: annotation_total,
        bookmarks,
        form_fields,
        has_page_labels,
        tagged,
        embedded_files,
    })
}

fn resolve_array<'a>(document: &'a Document, object: &'a Object) -> Option<&'a Vec<Object>> {
    match object {
        Object::Array(items) => Some(items),
        Object::Reference(id) => document.get_object(*id).and_then(Object::as_array).ok(),
        _ => None,
    }
}

fn count_outline(document: &Document, object: &Object, depth: usize) -> u32 {
    if depth > 128 {
        return 0;
    }
    let Some(dictionary) = resolve_dict(document, object) else {
        return 0;
    };
    let Some(first) = dictionary.get(b"First").ok() else {
        return 0;
    };
    let mut total = 0;
    let mut cursor = first.clone();
    for _ in 0..10_000 {
        let Some(item) = resolve_dict(document, &cursor) else {
            break;
        };
        total += 1;
        if let Ok(child) = item.get(b"First") {
            total += count_outline(document, child, depth + 1);
        }
        match item.get(b"Next") {
            Ok(next) => cursor = next.clone(),
            Err(_) => break,
        }
    }
    total
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageComparison {
    pub page: u32,
    pub width: u32,
    pub height: u32,
    pub different_pixels: u64,
    pub total_pixels: u64,
    pub difference: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfComparison {
    pub page_count_a: u32,
    pub page_count_b: u32,
    pub pages: Vec<PageComparison>,
    pub identical: bool,
    pub note: Option<String>,
}

/// Rasterise both documents at the same resolution and compare pixels. A text
/// diff would miss reflowed or redrawn pages, so this compares what a reader sees.
pub fn compare_documents(
    a: &Path,
    password_a: &str,
    b: &Path,
    password_b: &str,
) -> Result<PdfComparison, ConversionError> {
    let count_a = pdfium::page_count(a, password_a)?;
    let count_b = pdfium::page_count(b, password_b)?;
    let common = count_a.min(count_b);
    let mut pages = Vec::with_capacity(common as usize);
    let mut identical = count_a == count_b;

    for number in 1..=common {
        let left = pdfium::render_page(a, password_a, number, 96)?;
        let right = pdfium::render_page(b, password_b, number, 96)?;
        let (left, right) = (left.to_rgba8(), right.to_rgba8());
        let width = left.width().max(right.width());
        let height = left.height().max(right.height());
        let left_area = left.width() as u64 * left.height() as u64;
        let right_area = right.width() as u64 * right.height() as u64;
        let total = left_area.max(right_area);
        let overlap_w = left.width().min(right.width());
        let overlap_h = left.height().min(right.height());
        let overlap_area = overlap_w as u64 * overlap_h as u64;
        let mut different = total - overlap_area;
        for y in 0..overlap_h {
            for x in 0..overlap_w {
                let left_pixel = left.get_pixel(x, y).0;
                let right_pixel = right.get_pixel(x, y).0;
                let changed = left_pixel
                    .iter()
                    .zip(right_pixel.iter())
                    .any(|(a, b)| a.abs_diff(*b) > 8);
                if changed {
                    different += 1;
                }
            }
        }
        let difference = if total == 0 {
            0.0
        } else {
            different as f64 / total as f64
        };
        if difference > 0.00005 || left.dimensions() != right.dimensions() {
            identical = false;
        }
        pages.push(PageComparison {
            page: number,
            width,
            height,
            different_pixels: different,
            total_pixels: total,
            difference,
        });
    }

    let note = if count_a != count_b {
        Some(format!(
            "Page counts differ: {count_a} versus {count_b}; only the first {common} page(s) were compared."
        ))
    } else {
        None
    };

    Ok(PdfComparison {
        page_count_a: count_a,
        page_count_b: count_b,
        pages,
        identical,
        note,
    })
}

/// Full read for the PDF page: metadata plus the page count. An encrypted
/// document needs the password first, and says so instead of returning blanks.
pub fn inspect(path: &Path, password: &str) -> Result<PdfDocumentInfo, ConversionError> {
    let document = open_pdf(path, password)?;
    let info_id = document
        .trailer
        .get(b"Info")
        .ok()
        .and_then(|object| object.as_reference().ok());
    let info = match info_id {
        Some(id) => document.get_dictionary(id).ok(),
        None => None,
    };
    let field = |key: &str| {
        info.and_then(|dict| dict.get(key.as_bytes()).ok())
            .and_then(|object| lopdf::decode_text_string(object).ok())
            .map(|text| text.trim().to_owned())
            .filter(|text| !text.is_empty())
    };

    Ok(PdfDocumentInfo {
        path: path.display().to_string(),
        page_count: document.get_pages().len() as u32,
        version: document.version.clone(),
        encrypted: document.was_encrypted(),
        title: field("Title"),
        author: field("Author"),
        subject: field("Subject"),
        keywords: field("Keywords"),
        creator: field("Creator"),
        producer: field("Producer"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::job::{ConversionJob, JobRequest, JobStatus};
    use crate::engines::{CancellationToken, EngineContext, NullProgress};
    use image::{DynamicImage, ImageBuffer, ImageEncoder, Rgba};
    use lopdf::content::{Content, Operation};
    use lopdf::{EncryptionState, EncryptionVersion, Permissions};
    use std::path::PathBuf;

    const PASSWORD: &str = "hunter2-open";

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("uc-pdf-{name}"));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A real multi-page PDF with one text object per page, so tests can prove
    /// which pages survived an edit by reading the file back.
    fn text_pdf(dir: &Path, name: &str, pages: usize) -> PathBuf {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier",
        });
        let resources = dictionary! { "Font" => dictionary! { "F1" => font_id } };

        let mut kids = Vec::new();
        for number in 1..=pages {
            let content = Content {
                operations: vec![
                    Operation::new("BT", vec![]),
                    Operation::new("Tf", vec!["F1".into(), 24.into()]),
                    Operation::new("Td", vec![60.into(), 700.into()]),
                    Operation::new("Tj", vec![Object::string_literal(format!("PAGE {number}"))]),
                    Operation::new("ET", vec![]),
                ],
            };
            let content_id =
                document.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
            kids.push(Object::Reference(document.add_object(dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "Resources" => resources.clone(),
                "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
                "Contents" => content_id,
            })));
        }

        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages", "Kids" => kids, "Count" => pages as i64,
            }),
        );
        let catalog = document.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        document.trailer.set("Root", catalog);
        let info = document.add_object(dictionary! {
            "Title" => text_string("Original title"),
            "Author" => text_string("Original author"),
        });
        document.trailer.set("Info", info);
        // Real writers stamp a file ID; lopdf's encryption needs one, and so do
        // many readers when they decide whether a document was revised.
        document.trailer.set(
            "ID",
            vec![
                Object::string_literal("universal-converter-0001"),
                Object::string_literal("universal-converter-0001"),
            ],
        );

        let path = dir.join(name);
        document.save(&path).unwrap();
        path
    }

    /// A one-page PDF with a deliberately uncompressed, repetitive content
    /// stream, so qpdf compression has something real to shrink.
    fn padded_pdf(dir: &Path, name: &str, padding: usize) -> PathBuf {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier",
        });
        let content = format!(
            "{}\nBT /F1 24 Tf 60 700 Td (PAGE 1) Tj ET\n",
            " ".repeat(padding)
        );
        let content_id = document.add_object(Stream::new(dictionary! {}, content.into_bytes()));
        let page_id = document.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Resources" => dictionary! { "Font" => dictionary! { "F1" => font_id } },
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
            "Contents" => content_id,
        });
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages", "Kids" => vec![Object::Reference(page_id)], "Count" => 1_i64,
            }),
        );
        let catalog = document.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        document.trailer.set("Root", catalog);
        let path = dir.join(name);
        document.save(&path).unwrap();
        path
    }

    fn raster(dir: &Path, name: &str, width: u32, height: u32, alpha: bool) -> PathBuf {
        let mut buffer: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(width, height);
        for (x, y, pixel) in buffer.enumerate_pixels_mut() {
            let a = if alpha && (x + y) % 3 == 0 { 40 } else { 255 };
            *pixel = Rgba([(x * 7 % 256) as u8, (y * 11 % 256) as u8, 90, a]);
        }
        let path = dir.join(name);
        let raster_image = DynamicImage::ImageRgba8(buffer);
        if name.ends_with(".jpg") || name.ends_with(".jpeg") {
            let rgb = raster_image.to_rgb8();
            let mut encoded = Cursor::new(Vec::new());
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut encoded, 85)
                .write_image(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .unwrap();
            std::fs::write(&path, encoded.into_inner()).unwrap();
            return path;
        }
        raster_image.save(&path).unwrap();
        path
    }

    /// Two pages, encrypted with a user password the caller must supply to open
    /// it. Real encryption, so the password paths exercise the real parsers.
    fn locked_pdf(dir: &Path, name: &str) -> PathBuf {
        let plain = text_pdf(dir, "plain-for-lock.pdf", 2);
        let mut document = Document::load(&plain).unwrap();
        let state = EncryptionState::try_from(EncryptionVersion::V1 {
            document: &document,
            owner_password: "owner-only",
            user_password: PASSWORD,
            permissions: Permissions::PRINTABLE | Permissions::COPYABLE,
        })
        .unwrap();
        document.encrypt(&state).unwrap();
        let locked = dir.join(name);
        document.save(&locked).unwrap();
        locked
    }

    fn job(
        inputs: &[PathBuf],
        output: &Path,
        output_format: FormatId,
        settings: serde_json::Value,
    ) -> ConversionJob {
        let paths: Vec<&str> = inputs.iter().filter_map(|path| path.to_str()).collect();
        let request = JobRequest::for_test(&paths, output_format, settings);
        let mut job = ConversionJob::new(
            &request,
            format::detect_from_path(&inputs[0]),
            EngineId::Pdf,
            output.to_path_buf(),
            1024,
        );
        job.status = JobStatus::Processing;
        job
    }

    fn run(
        job: &ConversionJob,
        dir: &Path,
        cancel: &CancellationToken,
    ) -> Result<u64, ConversionError> {
        let settings = crate::core::settings::AppSettings::default();
        PdfEngine.convert(&EngineContext {
            job,
            temp_dir: dir,
            progress: &NullProgress,
            cancel,
            settings: &settings,
            secret: None,
        })
    }

    fn number_of(object: &Object) -> f32 {
        object
            .as_i64()
            .map(|value| value as f32)
            .or_else(|_| object.as_f32())
            .unwrap_or(f32::NAN)
    }

    fn page_box(
        document: &Document,
        pages: &std::collections::BTreeMap<u32, ObjectId>,
        number: u32,
    ) -> (f32, f32) {
        let dict = document.get_dictionary(pages[&number]).unwrap();
        let box_values = dict.get(b"MediaBox").unwrap().as_array().unwrap();
        (number_of(&box_values[2]), number_of(&box_values[3]))
    }

    fn image_of_page(document: &Document, page_id: ObjectId) -> &Stream {
        let page = document.get_dictionary(page_id).unwrap();
        let xobjects = page
            .get(b"Resources")
            .and_then(Object::as_dict)
            .and_then(|resources| resources.get(b"XObject"))
            .and_then(Object::as_dict)
            .expect("the page must carry an inline XObject resource dictionary");
        let id = xobjects
            .get(b"Im0")
            .and_then(Object::as_reference)
            .expect("the page must reference /Im0");
        document
            .get_object(id)
            .and_then(Object::as_stream)
            .expect("/Im0 must be a stream")
    }

    /// The drawn width, height and origin from the `a 0 0 d e f cm` matrix.
    fn placement(document: &Document, page_id: ObjectId) -> (f32, f32, f32, f32) {
        let content =
            String::from_utf8_lossy(&document.get_page_content(page_id).unwrap()).to_string();
        let line = content
            .lines()
            .find(|line| line.ends_with(" cm"))
            .expect("content must place the image with a cm operator");
        let numbers: Vec<f32> = line
            .trim_end_matches("cm")
            .split_whitespace()
            .filter_map(|token| token.parse::<f32>().ok())
            .collect();
        assert_eq!(
            numbers.len(),
            6,
            "\"{line}\" is not a full transformation matrix"
        );
        (numbers[0], numbers[3], numbers[4], numbers[5])
    }

    fn text_of(document: &Document, number: u32) -> String {
        let pages = document.get_pages();
        String::from_utf8_lossy(&document.get_page_content(pages[&number]).unwrap()).into_owned()
    }

    #[test]
    fn images_become_one_page_per_image_in_the_order_given() {
        let dir = scratch("order");
        let first = raster(&dir, "first.png", 8, 4, false);
        let second = raster(&dir, "second.png", 6, 10, false);
        let output = dir.join("album.pdf");

        let request = job(
            &[first, second],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "convert" }),
        );
        assert!(run(&request, &dir, &CancellationToken::new()).unwrap() > 0);

        let document = Document::load(&output).unwrap();
        let pages = document.get_pages();
        assert_eq!(pages.len(), 2, "one page per input image");
        // Default layout is A4 with automatic orientation: the wide image gets
        // landscape A4, the tall one portrait A4.
        assert_eq!(page_box(&document, &pages, 1), (842.0, 595.0));
        assert_eq!(page_box(&document, &pages, 2), (595.0, 842.0));
        assert_eq!(
            format::detect_from_path(&output),
            FormatId::Pdf,
            "the bytes written must really be a PDF"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn margins_and_placement_scale_the_image_without_distorting_it() {
        let dir = scratch("layout");
        let photo = raster(&dir, "photo.png", 8, 4, false);
        let output = dir.join("page.pdf");

        let request = job(
            &[photo],
            &output,
            FormatId::Pdf,
            serde_json::json!({
                "operation": "convert",
                "layout": { "pageSize": "letter", "orientation": "portrait", "marginMm": 10, "placement": "bottom" }
            }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let document = Document::load(&output).unwrap();
        let pages = document.get_pages();
        let (draw_w, draw_h, x, y) = placement(&document, pages[&1]);
        let margin = 10.0 * POINTS_PER_MM;
        // 8:4 aspect must survive, and the image must sit inside the printable box.
        assert!(
            (draw_w / draw_h - 2.0).abs() < 0.01,
            "aspect ratio lost: {draw_w} x {draw_h}"
        );
        assert!(
            draw_w <= 612.0 - 2.0 * margin + 0.01,
            "image overruns the margins"
        );
        assert!(
            (y - margin).abs() < 0.5,
            "bottom placement should park the image on the margin, got {y}"
        );
        assert!(
            (x - (612.0 - draw_w) / 2.0).abs() < 0.5,
            "image is not centred"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn jpeg_bytes_go_in_unchanged_instead_of_being_reencoded() {
        let dir = scratch("jpeg");
        let photo = raster(&dir, "photo.jpg", 24, 16, false);
        let source_bytes = std::fs::metadata(&photo).unwrap().len();
        let output = dir.join("photo.pdf");

        let request = job(
            &[photo],
            &output,
            FormatId::Pdf,
            serde_json::json!({
                "operation": "convert",
                "layout": { "pageSize": "fit", "marginMm": 0 }
            }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let document = Document::load(&output).unwrap();
        let pages = document.get_pages();
        assert_eq!(
            page_box(&document, &pages, 1),
            (24.0, 16.0),
            "fit keeps the image size"
        );
        let stream = image_of_page(&document, pages[&1]);
        assert_eq!(
            stream
                .dict
                .get(b"Filter")
                .and_then(Object::as_name)
                .unwrap(),
            b"DCTDecode"
        );
        assert_eq!(
            stream
                .dict
                .get(b"Subtype")
                .and_then(Object::as_name)
                .unwrap(),
            b"Image"
        );
        assert_eq!(
            stream.dict.get(b"Width").and_then(Object::as_i64).unwrap(),
            24
        );
        assert_eq!(
            stream.content.len() as u64,
            source_bytes,
            "the JPEG had to be re-encoded instead of passed through"
        );
        assert!(
            stream.dict.get(b"SMask").is_err(),
            "an opaque JPEG needs no soft mask"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn transparency_survives_as_a_soft_mask() {
        let dir = scratch("alpha");
        let logo = raster(&dir, "logo.png", 12, 12, true);
        let output = dir.join("logo.pdf");

        let request = job(
            &[logo],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "convert" }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let document = Document::load(&output).unwrap();
        let pages = document.get_pages();
        let stream = image_of_page(&document, pages[&1]);
        let mask = stream
            .dict
            .get(b"SMask")
            .and_then(Object::as_reference)
            .expect("an image with see-through pixels must write an /SMask");
        let mask_stream = document
            .get_object(mask)
            .and_then(Object::as_stream)
            .unwrap();
        assert_eq!(
            mask_stream
                .dict
                .get(b"ColorSpace")
                .and_then(Object::as_name)
                .unwrap(),
            b"DeviceGray"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn extract_keeps_exactly_the_selected_pages() {
        let dir = scratch("extract");
        let source = text_pdf(&dir, "four.pdf", 4);
        let output = dir.join("two-and-four.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "split", "pageRanges": "2,4" }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let document = Document::load(&output).unwrap();
        assert_eq!(document.get_pages().len(), 2);
        let remaining = (1..=2)
            .map(|number| text_of(&document, number))
            .collect::<Vec<_>>()
            .join("|");
        assert!(
            remaining.contains("PAGE 2") && remaining.contains("PAGE 4"),
            "wrong pages survived: {remaining}"
        );
        assert!(
            !remaining.contains("PAGE 1") && !remaining.contains("PAGE 3"),
            "dropped pages are still there"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_range_selects_every_page_between_its_ends() {
        assert_eq!(page_list("1-3,7", 8).unwrap(), vec![1, 2, 3, 7]);
        assert_eq!(page_list("6-", 8).unwrap(), vec![6, 7, 8]);
        assert_eq!(page_list("-2", 8).unwrap(), vec![1, 2]);
        assert_eq!(page_list("3,3,1-2", 8).unwrap(), vec![1, 2, 3]);
        assert_eq!(page_list("", 3).unwrap(), vec![1, 2, 3]);
        assert_eq!(page_list("all", 2).unwrap(), vec![1, 2]);
        for bad in ["0", "9", "5-2", "x", "-", "1-x"] {
            assert!(page_list(bad, 8).is_err(), "\"{bad}\" must not be accepted");
        }
        assert!(matches!(page_list("9", 8), Err(ConversionError::Other(_))));
    }

    #[test]
    fn a_failed_edit_leaves_no_output_behind() {
        let dir = scratch("nooutput");
        let source = text_pdf(&dir, "three.pdf", 3);
        let output = dir.join("never.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "split", "pageRanges": "9" }),
        );
        assert!(run(&request, &dir, &CancellationToken::new()).is_err());
        assert!(
            !output.exists(),
            "a rejected page selection must not write a file"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rotation_adds_to_what_the_page_already_shows() {
        let dir = scratch("rotate");
        let source = text_pdf(&dir, "three.pdf", 3);
        let output = dir.join("rotated.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "rotate", "rotation": 90 }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();
        let document = Document::load(&output).unwrap();
        for number in 1..=3 {
            let dict = document
                .get_dictionary(document.get_pages()[&number])
                .unwrap();
            assert_eq!(dict.get(b"Rotate").and_then(Object::as_i64).unwrap(), 90);
        }
        assert_eq!(
            document.get_pages().len(),
            3,
            "rotation must not lose pages"
        );

        // Second pass: only page 2 turns again, and it wraps 90 + 270 → 0.
        let again = dir.join("rotated2.pdf");
        let request = job(
            &[output],
            &again,
            FormatId::Pdf,
            serde_json::json!({ "operation": "rotate", "rotation": 270, "pageRanges": "2" }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();
        let document = Document::load(&again).unwrap();
        let rotation = |number: u32| {
            document
                .get_dictionary(document.get_pages()[&number])
                .unwrap()
                .get(b"Rotate")
                .and_then(Object::as_i64)
                .unwrap()
        };
        assert_eq!(rotation(1), 90, "untouched pages keep their rotation");
        assert_eq!(rotation(2), 0, "360 degrees must wrap back to 0");
        assert_eq!(rotation(3), 90);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn inherited_rotation_is_taken_into_account() {
        let dir = scratch("inherit");
        let mut document = lopdf::Document::load(text_pdf(&dir, "base.pdf", 2)).unwrap();
        // Put /Rotate on the page-tree root and let page 1 inherit it.
        let pages_id = document
            .catalog()
            .and_then(|catalog| catalog.get(b"Pages").and_then(Object::as_reference))
            .unwrap();
        document
            .get_object_mut(pages_id)
            .and_then(Object::as_dict_mut)
            .unwrap()
            .set("Rotate", 90_i64);
        let source = dir.join("inherited.pdf");
        document.save(&source).unwrap();

        let output = dir.join("turned.pdf");
        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "rotate", "rotation": 90, "pageRanges": "1" }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let document = Document::load(&output).unwrap();
        let page = document.get_dictionary(document.get_pages()[&1]).unwrap();
        assert_eq!(
            page.get(b"Rotate").and_then(Object::as_i64).unwrap(),
            180,
            "a page inheriting 90 and turned 90 more must end up at 180"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn only_quarter_turns_are_allowed() {
        let dir = scratch("badangle");
        let source = text_pdf(&dir, "two.pdf", 2);
        let output = dir.join("nope.pdf");
        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "rotate", "rotation": 45 }),
        );
        let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
        assert!(error.to_string().contains("multiple of 90"), "{error}");
        assert!(!output.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn metadata_edits_round_trip_including_unicode() {
        let dir = scratch("metadata");
        let source = text_pdf(&dir, "doc.pdf", 2);
        let output = dir.join("tagged.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({
                "operation": "metadata",
                "metadata": {
                    "title": "महाभारत — volume 1",
                    "author": "Alok Kumar",
                    "subject": "",
                    "keywords": "epic, index"
                }
            }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let info = inspect(&output, "").unwrap();
        assert_eq!(info.title.as_deref(), Some("महाभारत — volume 1"));
        assert_eq!(info.author.as_deref(), Some("Alok Kumar"));
        assert_eq!(info.subject, None, "an empty value clears the field");
        assert_eq!(info.keywords.as_deref(), Some("epic, index"));
        assert_eq!(
            info.page_count, 2,
            "metadata edits must not disturb the pages"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn metadata_operation_refuses_to_do_nothing() {
        let dir = scratch("metadatanoop");
        let source = text_pdf(&dir, "doc.pdf", 1);
        let output = dir.join("same.pdf");
        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "metadata" }),
        );
        assert!(run(&request, &dir, &CancellationToken::new()).is_err());
        assert!(!output.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_encrypted_document_asks_before_it_reveals() {
        let dir = scratch("crypto");
        let locked = locked_pdf(&dir, "locked.pdf");
        assert!(Document::load(&locked).unwrap().is_encrypted());

        let output = dir.join("turned.pdf");
        let no_password = job(
            std::slice::from_ref(&locked),
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "rotate", "rotation": 90 }),
        );
        let error = run(&no_password, &dir, &CancellationToken::new()).unwrap_err();
        assert_eq!(error.kind(), "needsPassword", "{error}");
        assert!(!output.exists());

        let wrong = job(
            std::slice::from_ref(&locked),
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "rotate", "rotation": 90, "password": "guess" }),
        );
        let error = run(&wrong, &dir, &CancellationToken::new()).unwrap_err();
        assert_eq!(error.kind(), "wrongPassword", "{error}");
        assert!(!output.exists());

        let right = job(
            &[locked],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "rotate", "rotation": 90, "password": PASSWORD }),
        );
        run(&right, &dir, &CancellationToken::new()).unwrap();
        let document = Document::load(&output).unwrap();
        assert!(
            !document.is_encrypted(),
            "the owner supplied the password, so the output is open"
        );
        assert_eq!(document.get_pages().len(), 2);
        assert!(
            inspect(&output, "").is_ok(),
            "an unencrypted output reads without a password"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn garbage_with_a_pdf_header_is_called_damaged_not_converted() {
        let dir = scratch("garbage");
        let source = dir.join("broken.pdf");
        std::fs::write(
            &source,
            b"%PDF-1.4\nthis is not a cross-reference table at all\n%%EOF\n",
        )
        .unwrap();
        let output = dir.join("out.pdf");
        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "rotate", "rotation": 90 }),
        );
        let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
        assert!(
            matches!(
                error,
                ConversionError::Unreadable { .. } | ConversionError::Corrupt { .. }
            ),
            "unexpected error: {error}"
        );
        assert!(!output.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cancellation_stops_before_the_pdf_is_built() {
        let dir = scratch("cancel");
        let photo = raster(&dir, "photo.png", 4, 4, false);
        let output = dir.join("never.pdf");
        let request = job(
            &[photo],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "convert" }),
        );
        let cancel = CancellationToken::new();
        cancel.cancel();
        let error = run(&request, &dir, &cancel).unwrap_err();
        assert_eq!(error.kind(), "cancelled");
        assert!(!output.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn undecodable_images_are_refused_with_a_reason() {
        let dir = scratch("svg");
        let drawing = dir.join("vector.svg");
        std::fs::write(
            &drawing,
            b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
        )
        .unwrap();
        let output = dir.join("never.pdf");
        let request = job(
            &[drawing],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "convert" }),
        );
        let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
        assert_eq!(error.kind(), "engineUnavailable", "{error}");
        assert!(!output.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn settings_the_engine_cannot_understand_are_rejected() {
        let dir = scratch("badsettings");
        let source = text_pdf(&dir, "one.pdf", 1);
        let output = dir.join("out.pdf");
        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "teleport" }),
        );
        assert!(run(&request, &dir, &CancellationToken::new()).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn qpdf_is_bundled_for_the_structural_operations() {
        assert!(
            sidecar::locate("UC_QPDF_PATH", "qpdf", "qpdf").is_some(),
            "resources/qpdf/qpdf.exe must ship with the app, or UC_QPDF_PATH must point at it"
        );
    }

    #[test]
    fn merging_keeps_the_input_order_and_every_page() {
        let dir = scratch("merge");
        let first = text_pdf(&dir, "first.pdf", 2);
        let second = text_pdf(&dir, "second.pdf", 3);
        let output = dir.join("merged.pdf");

        let request = job(
            &[first, second],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "merge" }),
        );
        let size = run(&request, &dir, &CancellationToken::new()).unwrap();
        assert!(size > 0);

        let document = Document::load(&output).unwrap();
        assert_eq!(document.get_pages().len(), 5);
        let text = (1..=5)
            .map(|number| text_of(&document, number))
            .collect::<Vec<_>>();
        // The second file's first page follows the first file's second page.
        assert!(text[1].contains("PAGE 2"));
        assert!(text[2].contains("PAGE 1"), "input order was not preserved");
        assert!(text[4].contains("PAGE 3"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn merging_one_file_is_refused() {
        let dir = scratch("mergeone");
        let source = text_pdf(&dir, "one.pdf", 1);
        let output = dir.join("same.pdf");
        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "merge" }),
        );
        let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
        assert!(error.to_string().contains("at least two"), "{error}");
        assert!(!output.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reordering_uses_the_exact_sequence_and_can_repeat_pages() {
        let dir = scratch("reorder");
        let source = text_pdf(&dir, "three.pdf", 3);
        let output = dir.join("reordered.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "reorder", "pageRanges": "3,1,1" }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let document = Document::load(&output).unwrap();
        let text = (1..=3)
            .map(|number| text_of(&document, number))
            .collect::<Vec<_>>();
        assert!(
            text[0].contains("PAGE 3"),
            "first requested page is wrong: {}",
            text[0]
        );
        assert!(text[1].contains("PAGE 1"));
        assert!(text[2].contains("PAGE 1"), "a repeated page was dropped");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reordering_outside_the_document_is_refused_before_qpdf_runs() {
        let dir = scratch("reorderbad");
        let source = text_pdf(&dir, "two.pdf", 2);
        let output = dir.join("never.pdf");
        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "reorder", "pageRanges": "2,9" }),
        );
        let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
        assert!(error.to_string().contains("outside a document"), "{error}");
        assert!(!output.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn compression_shrinks_a_bloated_pdf_and_keeps_its_pages() {
        let dir = scratch("compress");
        let source = padded_pdf(&dir, "bloated.pdf", 400 * 1024);
        let input_size = std::fs::metadata(&source).unwrap().len();
        let output = dir.join("smaller.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "compress", "compression": "high" }),
        );
        let output_size = run(&request, &dir, &CancellationToken::new()).unwrap();
        assert!(
            output_size < input_size,
            "reported size {output_size} is not smaller than {input_size}"
        );
        assert_eq!(std::fs::metadata(&output).unwrap().len(), output_size);
        assert_eq!(format::detect_from_path(&output), FormatId::Pdf);

        let document = Document::load(&output).unwrap();
        assert_eq!(document.get_pages().len(), 1);
        assert!(text_of(&document, 1).contains("PAGE 1"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn compression_refuses_to_pretend_when_it_would_grow_the_file() {
        let dir = scratch("compressgrow");
        let source = text_pdf(&dir, "tiny.pdf", 1);
        let input_size = std::fs::metadata(&source).unwrap().len();
        let output = dir.join("bigger.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "compress", "compression": "medium" }),
        );
        let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("would not make this file smaller"),
            "unexpected message: {error}"
        );
        assert!(
            !output.exists(),
            "an unhelpful compression must not be presented as success"
        );
        assert!(input_size > 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn compression_level_none_is_rejected_instead_of_copying() {
        let dir = scratch("compressnone");
        let source = padded_pdf(&dir, "doc.pdf", 10 * 1024);
        let output = dir.join("copy.pdf");
        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "compress", "compression": "none" }),
        );
        let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
        assert!(
            error.to_string().contains("choose low, balanced or high"),
            "{error}"
        );
        assert!(!output.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_password_can_be_added_verified_and_removed() {
        let dir = scratch("qpdfcrypto");
        let source = text_pdf(&dir, "plain.pdf", 2);
        let locked = dir.join("locked.pdf");

        let set = job(
            std::slice::from_ref(&source),
            &locked,
            FormatId::Pdf,
            serde_json::json!({ "operation": "password", "newPassword": "phase2-secret" }),
        );
        run(&set, &dir, &CancellationToken::new()).unwrap();

        assert!(
            is_encrypted_document(&locked).unwrap(),
            "the output is not encrypted"
        );
        assert_eq!(
            open_pdf(&locked, "phase2-secret")
                .unwrap()
                .get_pages()
                .len(),
            2
        );
        assert_eq!(open_pdf(&locked, "").unwrap_err().kind(), "needsPassword");
        assert_eq!(
            open_pdf(&locked, "wrong").unwrap_err().kind(),
            "wrongPassword"
        );

        let unlocked = dir.join("unlocked.pdf");
        let remove = job(
            std::slice::from_ref(&locked),
            &unlocked,
            FormatId::Pdf,
            serde_json::json!({
                "operation": "password",
                "password": "phase2-secret",
                "newPassword": ""
            }),
        );
        run(&remove, &dir, &CancellationToken::new()).unwrap();
        assert!(
            !is_encrypted_document(&unlocked).unwrap(),
            "the password was not removed"
        );
        assert_eq!(Document::load(&unlocked).unwrap().get_pages().len(), 2);

        let wrong = job(
            &[locked],
            &dir.join("never.pdf"),
            FormatId::Pdf,
            serde_json::json!({ "operation": "password", "password": "guess" }),
        );
        let error = run(&wrong, &dir, &CancellationToken::new()).unwrap_err();
        assert_eq!(error.kind(), "wrongPassword", "{error}");
        assert!(
            !error.to_string().contains("guess"),
            "the password leaked into an error"
        );

        let remove_open = job(
            &[unlocked],
            &dir.join("never2.pdf"),
            FormatId::Pdf,
            serde_json::json!({ "operation": "password" }),
        );
        let error = run(&remove_open, &dir, &CancellationToken::new()).unwrap_err();
        assert!(error.to_string().contains("not encrypted"), "{error}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_single_page_becomes_a_real_png_at_the_requested_resolution() {
        let dir = scratch("raster");
        let source = text_pdf(&dir, "two.pdf", 2);
        let output = dir.join("page-2.png");

        let request = job(
            &[source],
            &output,
            FormatId::Png,
            serde_json::json!({ "operation": "convert", "pageRanges": "2", "dpi": 144 }),
        );
        let bytes = run(&request, &dir, &CancellationToken::new()).unwrap();
        assert!(bytes > 0);
        assert_eq!(format::detect_from_path(&output), FormatId::Png);

        // A4 at 144 dpi is 1190 x 1684 pixels.
        let rendered = image::open(&output).expect("the PNG must decode");
        assert!(
            (rendered.width() as i32 - 1190).abs() <= 2,
            "width {}",
            rendered.width()
        );
        assert!(
            (rendered.height() as i32 - 1684).abs() <= 2,
            "height {}",
            rendered.height()
        );
        let dark = rendered
            .to_luma8()
            .pixels()
            .filter(|pixel| pixel[0] < 128)
            .count();
        assert!(dark > 100, "the page rendered blank, no text pixels found");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn one_job_writes_one_image_and_refuses_a_multi_page_selection() {
        let dir = scratch("rasterrange");
        let source = text_pdf(&dir, "two.pdf", 2);
        let output = dir.join("pages.png");

        let request = job(
            &[source],
            &output,
            FormatId::Png,
            serde_json::json!({ "operation": "convert", "pageRanges": "1-2" }),
        );
        let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
        assert!(error.to_string().contains("one job per page"), "{error}");
        assert!(
            !output.exists(),
            "a refused selection must not leave a partial image"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rasterising_an_encrypted_pdf_asks_for_its_password() {
        let dir = scratch("rastercrypto");
        let locked = locked_pdf(&dir, "locked.pdf");
        let output = dir.join("page.png");

        let no_password = job(
            std::slice::from_ref(&locked),
            &output,
            FormatId::Png,
            serde_json::json!({ "operation": "convert", "pageRanges": "1" }),
        );
        let error = run(&no_password, &dir, &CancellationToken::new()).unwrap_err();
        assert_eq!(error.kind(), "needsPassword", "{error}");
        assert!(!output.exists());

        let wrong = job(
            std::slice::from_ref(&locked),
            &output,
            FormatId::Png,
            serde_json::json!({ "operation": "convert", "pageRanges": "1", "password": "guess" }),
        );
        let error = run(&wrong, &dir, &CancellationToken::new()).unwrap_err();
        assert_eq!(error.kind(), "wrongPassword", "{error}");
        assert!(!output.exists());

        let right = job(
            &[locked],
            &output,
            FormatId::Png,
            serde_json::json!({ "operation": "convert", "pageRanges": "1", "password": PASSWORD }),
        );
        run(&right, &dir, &CancellationToken::new()).unwrap();
        assert_eq!(format::detect_from_path(&output), FormatId::Png);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn raster_resolution_and_quality_are_validated_not_clamped() {
        let dir = scratch("rasterlimits");
        let source = text_pdf(&dir, "one.pdf", 1);
        for settings in [
            serde_json::json!({ "operation": "convert", "dpi": 900 }),
            serde_json::json!({ "operation": "convert", "rasterQuality": 0 }),
        ] {
            let output = dir.join("refused.png");
            let request = job(
                std::slice::from_ref(&source),
                &output,
                FormatId::Png,
                settings,
            );
            let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
            assert!(matches!(error, ConversionError::Other(_)), "{error}");
            assert!(
                !output.exists(),
                "an out-of-range setting must not write a file"
            );
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_pdf_is_not_accepted_as_a_target_for_pdf_rasterising() {
        let dir = scratch("rastertarget");
        let source = text_pdf(&dir, "one.pdf", 1);
        let output = dir.join("again.pdf");
        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "convert", "pageRanges": "1" }),
        );
        let error = run(&request, &dir, &CancellationToken::new()).unwrap_err();
        assert!(
            matches!(error, ConversionError::Unsupported { .. }),
            "{error}"
        );
        assert!(!output.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_watermark_is_drawn_only_on_the_selected_pages() {
        let dir = scratch("watermark");
        let source = text_pdf(&dir, "plain.pdf", 2);
        let output = dir.join("stamped.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({
                "operation": "watermark",
                "pageRanges": "2",
                "watermark": {
                    "text": "CONFIDENTIAL",
                    "fontSize": 80,
                    "opacity": 0.5,
                    "color": "#c0392b",
                    "angle": 45
                }
            }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let document = Document::load(&output).unwrap();
        let first = text_of(&document, 1);
        let second = text_of(&document, 2);
        assert!(
            !first.contains("CONFIDENTIAL"),
            "untouched page was stamped"
        );
        assert!(
            second.contains("CONFIDENTIAL") && second.contains("/UCWMF"),
            "the watermark content stream is missing: {second}"
        );
        assert!(
            second.contains("PAGE 2"),
            "the original page content was lost"
        );

        let rendered = pdfium::render_page(&output, "", 2, 72).unwrap().to_rgb8();
        let red = rendered
            .pixels()
            .filter(|pixel| pixel[0] > 150 && i16::from(pixel[0]) - i16::from(pixel[1]) > 30)
            .count();
        assert!(
            red > 100,
            "the stamp did not render in colour: {red} red pixels"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn page_numbers_replace_the_placeholders() {
        let dir = scratch("pagetext");
        let source = text_pdf(&dir, "three.pdf", 3);
        let output = dir.join("numbered.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({
                "operation": "pageText",
                "pageText": {
                    "headerCenter": "Quarterly report",
                    "footerCenter": "Page {page} of {total}",
                    "fontSize": 10,
                    "marginMm": 12
                }
            }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let document = Document::load(&output).unwrap();
        for number in 1..=3 {
            let content = text_of(&document, number);
            assert!(
                content.contains(&format!("Page {number} of 3")),
                "page {number} has no filled page number: {content}"
            );
            assert!(content.contains("Quarterly report"));
            assert!(
                content.contains(&format!("PAGE {number}")),
                "original text was lost"
            );
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_note_becomes_a_real_pdf_annotation() {
        let dir = scratch("annotate");
        let source = text_pdf(&dir, "plain.pdf", 2);
        let output = dir.join("noted.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({
                "operation": "annotate",
                "pageRanges": "1",
                "annotation": { "text": "Review this page — please", "author": "Alok" }
            }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let document = Document::load(&output).unwrap();
        let page = document.get_dictionary(document.get_pages()[&1]).unwrap();
        let annots = page.get(b"Annots").unwrap().as_array().unwrap();
        assert_eq!(annots.len(), 1);
        let annotation = document
            .get_dictionary(annots[0].as_reference().unwrap())
            .unwrap();
        assert_eq!(
            annotation.get(b"Subtype").unwrap().as_name().unwrap(),
            b"Text"
        );
        assert_eq!(
            lopdf::decode_text_string(annotation.get(b"Contents").unwrap()).unwrap(),
            "Review this page — please"
        );
        assert_eq!(
            lopdf::decode_text_string(annotation.get(b"T").unwrap()).unwrap(),
            "Alok"
        );

        let reported = deep_inspect(&output, "").unwrap();
        assert_eq!(reported.annotation_count, 1);
        assert_eq!(reported.pages[0].annotation_count, 1);
        assert_eq!(reported.pages[1].annotation_count, 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn removing_all_metadata_clears_info_and_the_xmp_stream() {
        let dir = scratch("metadataclear");
        let plain = text_pdf(&dir, "plain.pdf", 2);
        let mut document = Document::load(&plain).unwrap();
        let catalog_id = document
            .trailer
            .get(b"Root")
            .unwrap()
            .as_reference()
            .unwrap();
        let xmp = document.add_object(Stream::new(
            dictionary! { "Type" => "Metadata", "Subtype" => "XML" },
            b"<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"/>".to_vec(),
        ));
        document
            .get_object_mut(catalog_id)
            .and_then(Object::as_dict_mut)
            .unwrap()
            .set("Metadata", xmp);
        let source = dir.join("tagged.pdf");
        document.save(&source).unwrap();
        let output = dir.join("clean.pdf");

        let request = job(
            &[source],
            &output,
            FormatId::Pdf,
            serde_json::json!({ "operation": "metadata", "removeAllMetadata": true }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let written = Document::load(&output).unwrap();
        let info_empty = written
            .trailer
            .get(b"Info")
            .ok()
            .and_then(|object| object.as_reference().ok())
            .and_then(|id| written.get_dictionary(id).ok())
            .map(Dictionary::is_empty)
            .unwrap_or(true);
        let catalog = written.catalog().unwrap();
        assert!(info_empty, "Info fields survived removal");
        assert!(
            catalog.get(b"Metadata").is_err(),
            "the XMP stream survived removal"
        );
        let info = inspect(&output, "").unwrap();
        assert_eq!(info.title, None);
        assert_eq!(info.author, None);
        assert_eq!(info.page_count, 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn embedded_images_are_extracted_as_readable_files() {
        let dir = scratch("extractimages");
        let photo = raster(&dir, "photo.png", 12, 8, false);
        let jpeg = raster(&dir, "snapshot.jpg", 10, 6, false);
        let album = dir.join("album.pdf");

        let combine = job(
            &[photo.clone(), jpeg],
            &album,
            FormatId::Pdf,
            serde_json::json!({ "operation": "convert" }),
        );
        run(&combine, &dir, &CancellationToken::new()).unwrap();

        let out_dir = dir.join("embedded");
        let extraction = extract_images(&album, "", "", &out_dir).unwrap();
        assert_eq!(extraction.images.len(), 2, "{:?}", extraction.skipped);
        assert_eq!(extraction.images[0].page, 1);
        assert_eq!(extraction.images[1].page, 2);

        let png = image::open(&extraction.images[0].path).unwrap();
        assert_eq!((png.width(), png.height()), (12, 8));
        let jpg = image::open(&extraction.images[1].path).unwrap();
        assert_eq!((jpg.width(), jpg.height()), (10, 6));
        assert_eq!(extraction.images[1].format, "jpg");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_deep_inspector_reports_real_page_structure() {
        let dir = scratch("inspector");
        let source = text_pdf(&dir, "three.pdf", 3);
        let document = deep_inspect(&source, "").unwrap();
        assert_eq!(document.page_count, 3);
        assert_eq!(document.pages.len(), 3);
        assert_eq!(document.pages[0].width_pt, 595.0);
        assert_eq!(document.pages[0].height_pt, 842.0);
        assert!(
            document.fonts.iter().any(|font| font.contains("Courier")),
            "{:?}",
            document.fonts
        );
        assert_eq!(document.image_count, 0);
        assert_eq!(document.annotation_count, 0);
        assert_eq!(document.form_fields, 0);
        assert!(!document.encrypted);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn comparing_identical_and_changed_documents_reads_the_pixels() {
        let dir = scratch("compare");
        let source = text_pdf(&dir, "three.pdf", 2);
        let same = compare_documents(&source, "", &source, "").unwrap();
        assert!(same.identical, "{same:?}");
        assert_eq!(same.pages.len(), 2);
        assert!(same.pages.iter().all(|page| page.different_pixels == 0));
        assert_eq!(same.note, None);

        let stamped = dir.join("stamped.pdf");
        let request = job(
            std::slice::from_ref(&source),
            &stamped,
            FormatId::Pdf,
            serde_json::json!({
                "operation": "watermark",
                "watermark": { "text": "DIFF", "fontSize": 100, "opacity": 0.8 }
            }),
        );
        run(&request, &dir, &CancellationToken::new()).unwrap();

        let changed = compare_documents(&source, "", &stamped, "").unwrap();
        assert!(!changed.identical);
        assert!(
            changed
                .pages
                .iter()
                .all(|page| page.different_pixels > 0 && page.difference > 0.0),
            "{changed:?}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn invalid_stamp_settings_are_refused_without_writing() {
        let dir = scratch("stampbad");
        let source = text_pdf(&dir, "one.pdf", 1);
        for settings in [
            serde_json::json!({ "operation": "watermark", "watermark": { "text": "" } }),
            serde_json::json!({ "operation": "watermark", "watermark": { "text": "नमस्ते" } }),
            serde_json::json!({ "operation": "pageText", "pageText": { "footerCenter": "" } }),
            serde_json::json!({ "operation": "annotate", "annotation": { "text": " " } }),
        ] {
            let output = dir.join("never.pdf");
            let request = job(
                std::slice::from_ref(&source),
                &output,
                FormatId::Pdf,
                settings,
            );
            assert!(run(&request, &dir, &CancellationToken::new()).is_err());
            assert!(!output.exists(), "a refused stamp must not write a file");
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_capability_list_marks_only_what_the_native_core_can_do() {
        let list = capabilities();
        let available = |key: &str| {
            list.iter()
                .find(|entry| entry.operation == key)
                .map(|entry| (entry.available, entry.missing_dependency))
        };
        assert_eq!(available("imagesToPdf"), Some((true, None)));
        assert_eq!(available("split"), Some((true, None)));
        assert_eq!(available("rotate"), Some((true, None)));
        assert_eq!(available("metadata"), Some((true, None)));
        let editor = sidecar::locate("UC_QPDF_PATH", "qpdf", "qpdf").is_some();
        for key in ["merge", "reorder", "compress", "password"] {
            assert_eq!(
                available(key),
                Some((editor, (!editor).then_some("qpdf"))),
                "{key} must follow qpdf's real availability"
            );
        }
        let renderer = pdfium::is_available();
        assert_eq!(
            available("pdfToImages"),
            Some((renderer, (!renderer).then_some("PDFium"))),
            "PDF → image must follow the renderer's real availability"
        );
        assert!(
            list.iter()
                .all(|entry| entry.available == entry.missing_dependency.is_none())
        );
    }

    #[test]
    fn the_probe_reports_a_real_page_count() {
        let dir = scratch("probe");
        let source = text_pdf(&dir, "five.pdf", 5);
        assert_eq!(page_count(&source), Some(5));
        assert_eq!(page_count(Path::new("Z:/not/here.pdf")), None);

        let info = inspect(&source, "").unwrap();
        assert_eq!(info.page_count, 5);
        assert_eq!(info.title.as_deref(), Some("Original title"));
        assert_eq!(info.producer, None, "the fixture sets no producer");
        assert!(!info.encrypted);
        std::fs::remove_dir_all(&dir).ok();
    }
}
