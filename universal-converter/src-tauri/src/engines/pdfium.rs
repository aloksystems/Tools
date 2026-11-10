use super::{EngineId, sidecar};
use crate::error::ConversionError;
use crate::utils::limits;
use image::DynamicImage;
use pdfium_render::prelude::{
    PdfDocument, PdfPage, PdfRenderConfig, Pdfium, PdfiumError, PdfiumInternalError,
};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// PDFium is a DLL, not a console tool: the process loads it instead of
/// spawning it, so it is located like a library rather than a binary.
const LIBRARY_FILE: &str = "pdfium.dll";
const ENV_KEY: &str = "UC_PDFIUM_PATH";
const BUNDLE_DIR: &str = "pdfium";

/// Rendering every page of a huge document into the UI at once is not worth the
/// memory. The page grid asks for one bounded preview at a time instead.
pub const MAX_PREVIEW_WIDTH: u32 = 320;

/// Where the bundled renderer lives, or `None` when this build really is
/// lopdf-only.
pub fn library_path() -> Option<PathBuf> {
    sidecar::locate_library(ENV_KEY, LIBRARY_FILE, BUNDLE_DIR)
}

pub fn is_available() -> bool {
    library_path().is_some()
}

/// One process-wide binding: pdfium-render publishes the bindings globally, so a
/// second `bind_to_library` call is an error, not a second loader.
fn instance() -> Result<&'static Pdfium, ConversionError> {
    static INSTANCE: OnceLock<Result<Pdfium, String>> = OnceLock::new();
    INSTANCE
        .get_or_init(|| {
            let path = library_path().ok_or_else(|| {
                format!(
                    "{LIBRARY_FILE} is not bundled: expected it in resources/{BUNDLE_DIR}/, \
                     or set {ENV_KEY} to its full path"
                )
            })?;
            let bindings = Pdfium::bind_to_library(&path).map_err(|error| {
                format!(
                    "PDFium could not be loaded from {}: {error}",
                    path.display()
                )
            })?;
            Ok(Pdfium::new(bindings))
        })
        .as_ref()
        .map_err(|reason| ConversionError::EngineUnavailable {
            engine: EngineId::Pdf.label().to_owned(),
            reason: reason.clone(),
        })
}

fn open<'a>(
    pdfium: &'a Pdfium,
    path: &Path,
    password: &str,
) -> Result<PdfDocument<'a>, ConversionError> {
    let supplied = (!password.is_empty()).then_some(password);
    pdfium
        .load_pdf_from_file(path, supplied)
        .map_err(|error| match error {
            PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError) => {
                if supplied.is_some() {
                    ConversionError::WrongPassword {
                        path: path.display().to_string(),
                    }
                } else {
                    ConversionError::NeedsPassword {
                        path: path.display().to_string(),
                    }
                }
            }
            other => super::unreadable(path, other),
        })
}

fn render(
    page: &PdfPage<'_>,
    number: u32,
    target_width: i32,
) -> Result<DynamicImage, ConversionError> {
    let config = PdfRenderConfig::new().set_target_width(target_width.max(1));
    let bitmap = page.render_with_config(&config).map_err(|error| {
        ConversionError::Other(format!("PDFium could not render page {number}: {error}"))
    })?;
    bitmap.as_image().map_err(|error| {
        ConversionError::Other(format!(
            "PDFium returned no pixels for page {number}: {error}"
        ))
    })
}

fn page_of<'a>(
    document: &'a PdfDocument<'_>,
    number: u32,
    total: u32,
) -> Result<PdfPage<'a>, ConversionError> {
    if number == 0 || number > total {
        return Err(ConversionError::Other(format!(
            "page {number} is outside a document of {total} page(s)"
        )));
    }
    document.pages().get((number - 1) as i32).map_err(|error| {
        ConversionError::Other(format!("PDFium could not open page {number}: {error}"))
    })
}

/// Rasterise one page at the requested resolution (dots per inch, not scale).
pub fn render_page(
    path: &Path,
    password: &str,
    number: u32,
    dpi: u32,
) -> Result<DynamicImage, ConversionError> {
    let pdfium = instance()?;
    let document = open(pdfium, path, password)?;
    let total = document.pages().len() as u32;
    let page = page_of(&document, number, total)?;

    let points_w = page.width().value.max(1.0);
    let points_h = page.height().value.max(1.0);
    let target_width = (points_w * dpi as f32 / 72.0).round().max(1.0) as i32;
    let target_height = (points_h * dpi as f32 / 72.0).round().max(1.0) as u64;
    if (target_width as u64) * target_height > limits::MAX_IMAGE_PIXELS {
        return Err(ConversionError::PixelLimit {
            pixels: (target_width as u64 * target_height) / 1_000_000,
            limit: limits::MAX_IMAGE_PIXELS / 1_000_000,
        });
    }

    render(&page, number, target_width)
}

/// Page count as PDFium sees it — the same parser that will render the page.
pub fn page_count(path: &Path, password: &str) -> Result<u32, ConversionError> {
    let pdfium = instance()?;
    Ok(open(pdfium, path, password)?.pages().len() as u32)
}

/// One small page image for the reorder grid. The width is capped so a page
/// preview can never ask PDFium for a screen-sized bitmap.
pub fn preview_page(
    path: &Path,
    password: &str,
    number: u32,
    max_width: u32,
) -> Result<DynamicImage, ConversionError> {
    let pdfium = instance()?;
    let document = open(pdfium, path, password)?;
    let total = document.pages().len() as u32;
    let page = page_of(&document, number, total)?;
    render(&page, number, max_width.clamp(32, MAX_PREVIEW_WIDTH) as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bundled_renderer_is_present() {
        let path = library_path().expect(
            "resources/pdfium/pdfium.dll must ship with the app, or UC_PDFIUM_PATH must point at it",
        );
        assert!(path.is_file(), "{} is not a file", path.display());
        assert!(is_available());
    }
}
