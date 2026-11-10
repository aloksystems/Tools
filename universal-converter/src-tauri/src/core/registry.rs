use crate::core::format::FormatId;
use crate::engines::EngineId;
use serde::Serialize;
use std::sync::LazyLock;

/// One advertised conversion route.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatCapability {
    pub input: FormatId,
    pub output: FormatId,
    pub engine: EngineId,
    pub note: Option<String>,
}

const RASTER: [FormatId; 7] = [
    FormatId::Jpeg,
    FormatId::Png,
    FormatId::Webp,
    FormatId::Bmp,
    FormatId::Tiff,
    FormatId::Gif,
    FormatId::Ico,
];

const RASTER_EXTENDED: [FormatId; 3] = [FormatId::Avif, FormatId::Heic, FormatId::Svg];

/// The only raster targets the bundled PDFium path writes. BMP, TIFF, GIF and
/// ICO are image-engine targets; advertising them here would promise a render
/// that the PDF engine deliberately refuses.
const PDF_TO_RASTER: [FormatId; 3] = [FormatId::Jpeg, FormatId::Png, FormatId::Webp];

const AUDIO: [FormatId; 10] = [
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
];

const VIDEO: [FormatId; 9] = [
    FormatId::Mp4,
    FormatId::Mkv,
    FormatId::Mov,
    FormatId::Avi,
    FormatId::Webm,
    FormatId::Wmv,
    FormatId::Flv,
    FormatId::Mpeg,
    FormatId::ThreeGp,
];

/// LibreOffice Writer formats. Each input is opened by the Writer component and
/// each output is a Writer export filter; a Writer document cannot become a
/// spreadsheet or a slide deck, so those routes are not advertised.
const WRITER_INPUTS: [FormatId; 6] = [
    FormatId::Docx,
    FormatId::Doc,
    FormatId::Odt,
    FormatId::Rtf,
    FormatId::Txt,
    FormatId::Html,
];

const WRITER_OUTPUTS: [FormatId; 7] = [
    FormatId::Docx,
    FormatId::Doc,
    FormatId::Odt,
    FormatId::Rtf,
    FormatId::Txt,
    FormatId::Html,
    FormatId::Pdf,
];

const CALC_INPUTS: [FormatId; 4] = [FormatId::Xlsx, FormatId::Xls, FormatId::Ods, FormatId::Csv];

/// CSV is a projection of one sheet, not a workbook: the note attached below
/// says so rather than letting a multi-sheet file lose data silently.
const CALC_OUTPUTS: [FormatId; 6] = [
    FormatId::Xlsx,
    FormatId::Xls,
    FormatId::Ods,
    FormatId::Csv,
    FormatId::Html,
    FormatId::Pdf,
];

const IMPRESS_INPUTS: [FormatId; 3] = [FormatId::Pptx, FormatId::Ppt, FormatId::Odp];

const IMPRESS_OUTPUTS: [FormatId; 3] = [FormatId::Pptx, FormatId::Odp, FormatId::Pdf];

/// Everything 7-Zip can open here, including extraction-only CAB and WIM and
/// the compound TAR containers (whose inner TAR is unwrapped by the engine).
const ARCHIVE_INPUTS: [FormatId; 11] = [
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
];

/// Containers this build can write. GZ/BZ2/XZ are only offered as the outer
/// layer of a TAR, which is what a user actually expects from those names.
const ARCHIVE_OUTPUTS: [FormatId; 6] = [
    FormatId::Zip,
    FormatId::SevenZ,
    FormatId::Tar,
    FormatId::TarGz,
    FormatId::TarBz2,
    FormatId::TarXz,
];

/// Register every input×output pair for one engine. Same-format pairs are kept
/// on purpose: a PNG→PNG job is how a batch resize or recompress is expressed.
fn push(
    entries: &mut Vec<FormatCapability>,
    inputs: &[FormatId],
    outputs: &[FormatId],
    engine: EngineId,
    note: Option<&str>,
) {
    for input in inputs {
        for output in outputs {
            entries.push(FormatCapability {
                input: *input,
                output: *output,
                engine,
                note: note.map(str::to_owned),
            });
        }
    }
}

/// The registry order encodes engine preference: the first candidate whose
/// engine probes available wins.
static REGISTRY: LazyLock<Vec<FormatCapability>> = LazyLock::new(build_registry);

fn build_registry() -> Vec<FormatCapability> {
    let mut entries: Vec<FormatCapability> = Vec::new();

    // 1. Raster in → raster out, handled in-process by the Rust image crate.
    for input in RASTER {
        for output in RASTER {
            entries.push(FormatCapability {
                input,
                output,
                engine: EngineId::Image,
                note: None,
            });
        }
    }

    // 2. Raster → AVIF/HEIC and back: needs ImageMagick delegates.
    push(
        &mut entries,
        &RASTER,
        &RASTER_EXTENDED,
        EngineId::Imagemagick,
        Some("requires ImageMagick delegates"),
    );
    push(
        &mut entries,
        &RASTER_EXTENDED,
        &RASTER,
        EngineId::Imagemagick,
        Some("requires ImageMagick delegates"),
    );
    push(
        &mut entries,
        &RASTER_EXTENDED,
        &RASTER_EXTENDED,
        EngineId::Imagemagick,
        None,
    );

    // 3. Images in → PDF out, and PDF pages → images out. Only the decoders the
    // PDF engine actually has are offered: no SVG/AVIF/HEIC in, no TIFF/GIF out.
    push(
        &mut entries,
        &RASTER,
        &[FormatId::Pdf],
        EngineId::Pdf,
        Some("one PDF page per image"),
    );
    push(
        &mut entries,
        &[FormatId::Pdf],
        &PDF_TO_RASTER,
        EngineId::Pdf,
        Some("renders pages to images"),
    );
    push(
        &mut entries,
        &[FormatId::Pdf],
        &[FormatId::Pdf],
        EngineId::Pdf,
        Some("merge, split, rotate or compress"),
    );

    // 4. Documents, split by the LibreOffice component that must open them.
    // A Writer file cannot be turned into a workbook or slides, and vice versa.
    push(
        &mut entries,
        &WRITER_INPUTS,
        &WRITER_OUTPUTS,
        EngineId::Document,
        None,
    );
    push(
        &mut entries,
        &CALC_INPUTS,
        &CALC_OUTPUTS,
        EngineId::Document,
        Some("CSV writes one sheet; multi-sheet workbooks keep every sheet in other formats"),
    );
    push(
        &mut entries,
        &IMPRESS_INPUTS,
        &IMPRESS_OUTPUTS,
        EngineId::Document,
        None,
    );

    // 5. Audio, video, and the two cross-over cases (extract audio, video→GIF).
    push(&mut entries, &AUDIO, &AUDIO, EngineId::Media, None);
    push(&mut entries, &VIDEO, &VIDEO, EngineId::Media, None);
    push(
        &mut entries,
        &VIDEO,
        &AUDIO,
        EngineId::Media,
        Some("extracts a chosen audio track"),
    );
    for input in VIDEO {
        entries.push(FormatCapability {
            input,
            output: FormatId::Gif,
            engine: EngineId::Media,
            note: Some("short clips only; GIF is 256-colour and silent".to_owned()),
        });
    }

    // 6. Archives. Every readable container can be repacked into a writable one
    // through an isolated extraction folder; CAB/WIM are extraction-only inputs.
    push(
        &mut entries,
        &ARCHIVE_INPUTS,
        &ARCHIVE_OUTPUTS,
        EngineId::Archive,
        Some("repacks through an isolated temporary folder"),
    );

    entries
}

pub fn candidates(input: FormatId, output: FormatId) -> Vec<&'static FormatCapability> {
    REGISTRY
        .iter()
        .filter(|entry| entry.input == input && entry.output == output)
        .collect()
}

/// Distinct output formats reachable from `input`, ordered by first appearance.
pub fn capabilities_for(input: FormatId) -> Vec<FormatCapability> {
    REGISTRY
        .iter()
        .filter(|entry| entry.input == input)
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raster_pair_prefers_rust_image() {
        let found = candidates(FormatId::Png, FormatId::Jpeg);
        assert_eq!(
            found.first().map(|entry| entry.engine),
            Some(EngineId::Image)
        );
    }

    #[test]
    fn avif_is_routed_to_imagemagick() {
        let found = candidates(FormatId::Png, FormatId::Avif);
        assert!(
            found
                .iter()
                .any(|entry| entry.engine == EngineId::Imagemagick),
            "AVIF output must be reachable via ImageMagick"
        );
    }

    #[test]
    fn pdf_pages_can_become_images() {
        let found = candidates(FormatId::Pdf, FormatId::Png);
        assert!(found.iter().any(|entry| entry.engine == EngineId::Pdf));
    }

    #[test]
    fn video_to_gif_exists() {
        let found = candidates(FormatId::Mp4, FormatId::Gif);
        assert!(found.iter().any(|entry| entry.engine == EngineId::Media));
    }

    #[test]
    fn same_format_roundtrip_is_registered_for_recompress() {
        let found = candidates(FormatId::Png, FormatId::Png);
        assert!(
            found.iter().any(|entry| entry.engine == EngineId::Image),
            "PNG→PNG must be offered so a batch resize/recompress is possible"
        );
    }

    #[test]
    fn unknown_format_offers_nothing() {
        assert!(capabilities_for(FormatId::Unknown).is_empty());
    }

    #[test]
    fn document_families_never_cross() {
        assert!(candidates(FormatId::Docx, FormatId::Pdf).len() == 1);
        assert!(candidates(FormatId::Docx, FormatId::Xlsx).is_empty());
        assert!(candidates(FormatId::Xlsx, FormatId::Csv).len() == 1);
        assert!(candidates(FormatId::Xlsx, FormatId::Pptx).is_empty());
        assert!(candidates(FormatId::Pptx, FormatId::Odp).len() == 1);
        assert!(candidates(FormatId::Pptx, FormatId::Docx).is_empty());
        assert!(candidates(FormatId::Txt, FormatId::Rtf).len() == 1);
        assert!(candidates(FormatId::Html, FormatId::Pdf).len() == 1);
    }

    #[test]
    fn archive_routes_cover_creation_but_not_unwritable_formats() {
        assert!(candidates(FormatId::Zip, FormatId::TarGz).len() == 1);
        assert!(candidates(FormatId::Cab, FormatId::Zip).len() == 1);
        assert!(candidates(FormatId::Wim, FormatId::SevenZ).len() == 1);
        for compound in [FormatId::TarGz, FormatId::TarBz2, FormatId::TarXz] {
            assert!(
                candidates(compound, FormatId::Zip).len() == 1,
                "{compound:?} must be repackable"
            );
        }
        assert!(
            candidates(FormatId::Zip, FormatId::Gz).is_empty(),
            "standalone gzip is not a container this page creates"
        );
        assert!(
            candidates(FormatId::Zip, FormatId::Cab).is_empty(),
            "CAB is extraction-only here"
        );
    }

    #[test]
    fn no_duplicate_routes() {
        let mut pairs: Vec<(u8, u8, u8)> = REGISTRY
            .iter()
            .map(|entry| (entry.input as u8, entry.output as u8, entry.engine as u8))
            .collect();
        let before = pairs.len();
        pairs.sort_unstable();
        pairs.dedup();
        assert_eq!(before, pairs.len(), "registry contains duplicate routes");
    }
}
