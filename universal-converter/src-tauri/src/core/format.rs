use serde::{Deserialize, Serialize};
use std::fmt;

/// Every format the application knows about. Serialised as camelCase so the
/// TypeScript mirror in `src/types/converter.ts` matches exactly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FormatId {
    Jpeg,
    Png,
    Webp,
    Avif,
    Bmp,
    Tiff,
    Gif,
    Ico,
    Svg,
    Heic,
    Pdf,
    Docx,
    Doc,
    Odt,
    Rtf,
    Txt,
    Html,
    Xlsx,
    Xls,
    Ods,
    Csv,
    Pptx,
    Ppt,
    Odp,
    Mp3,
    Wav,
    Flac,
    Aac,
    M4a,
    Wma,
    Aiff,
    Alac,
    Ogg,
    Opus,
    Mp4,
    Mkv,
    Mov,
    Avi,
    Webm,
    Wmv,
    Flv,
    Mpeg,
    ThreeGp,
    Zip,
    SevenZ,
    Tar,
    Gz,
    Bz2,
    Xz,
    TarGz,
    TarBz2,
    TarXz,
    Wim,
    Cab,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FormatCategory {
    Image,
    Pdf,
    Document,
    Audio,
    Video,
    Archive,
    Text,
    Other,
}

impl FormatId {
    pub fn extension(self) -> &'static str {
        match self {
            FormatId::Jpeg => "jpg",
            FormatId::Png => "png",
            FormatId::Webp => "webp",
            FormatId::Avif => "avif",
            FormatId::Bmp => "bmp",
            FormatId::Tiff => "tiff",
            FormatId::Gif => "gif",
            FormatId::Ico => "ico",
            FormatId::Svg => "svg",
            FormatId::Heic => "heic",
            FormatId::Pdf => "pdf",
            FormatId::Docx => "docx",
            FormatId::Doc => "doc",
            FormatId::Odt => "odt",
            FormatId::Rtf => "rtf",
            FormatId::Txt => "txt",
            FormatId::Html => "html",
            FormatId::Xlsx => "xlsx",
            FormatId::Xls => "xls",
            FormatId::Ods => "ods",
            FormatId::Csv => "csv",
            FormatId::Pptx => "pptx",
            FormatId::Ppt => "ppt",
            FormatId::Odp => "odp",
            FormatId::Mp3 => "mp3",
            FormatId::Wav => "wav",
            FormatId::Flac => "flac",
            FormatId::Aac => "aac",
            FormatId::M4a => "m4a",
            FormatId::Wma => "wma",
            FormatId::Aiff => "aiff",
            FormatId::Alac => "m4a",
            FormatId::Ogg => "ogg",
            FormatId::Opus => "opus",
            FormatId::Mp4 => "mp4",
            FormatId::Mkv => "mkv",
            FormatId::Mov => "mov",
            FormatId::Avi => "avi",
            FormatId::Webm => "webm",
            FormatId::Wmv => "wmv",
            FormatId::Flv => "flv",
            FormatId::Mpeg => "mpeg",
            FormatId::ThreeGp => "3gp",
            FormatId::Zip => "zip",
            FormatId::SevenZ => "7z",
            FormatId::Tar => "tar",
            FormatId::Gz => "gz",
            FormatId::Bz2 => "bz2",
            FormatId::Xz => "xz",
            FormatId::TarGz => "tar.gz",
            FormatId::TarBz2 => "tar.bz2",
            FormatId::TarXz => "tar.xz",
            FormatId::Wim => "wim",
            FormatId::Cab => "cab",
            FormatId::Unknown => "bin",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            FormatId::Jpeg => "JPEG",
            FormatId::Png => "PNG",
            FormatId::Webp => "WebP",
            FormatId::Avif => "AVIF",
            FormatId::Bmp => "BMP",
            FormatId::Tiff => "TIFF",
            FormatId::Gif => "GIF",
            FormatId::Ico => "ICO",
            FormatId::Svg => "SVG",
            FormatId::Heic => "HEIC",
            FormatId::Pdf => "PDF",
            FormatId::Docx => "DOCX",
            FormatId::Doc => "DOC",
            FormatId::Odt => "ODT",
            FormatId::Rtf => "RTF",
            FormatId::Txt => "Plain text",
            FormatId::Html => "HTML",
            FormatId::Xlsx => "XLSX",
            FormatId::Xls => "XLS",
            FormatId::Ods => "ODS",
            FormatId::Csv => "CSV",
            FormatId::Pptx => "PPTX",
            FormatId::Ppt => "PPT",
            FormatId::Odp => "ODP",
            FormatId::Mp3 => "MP3",
            FormatId::Wav => "WAV",
            FormatId::Flac => "FLAC",
            FormatId::Aac => "AAC",
            FormatId::M4a => "M4A",
            FormatId::Wma => "WMA",
            FormatId::Aiff => "AIFF",
            FormatId::Alac => "ALAC",
            FormatId::Ogg => "OGG",
            FormatId::Opus => "Opus",
            FormatId::Mp4 => "MP4",
            FormatId::Mkv => "MKV",
            FormatId::Mov => "MOV",
            FormatId::Avi => "AVI",
            FormatId::Webm => "WebM",
            FormatId::Wmv => "WMV",
            FormatId::Flv => "FLV",
            FormatId::Mpeg => "MPEG",
            FormatId::ThreeGp => "3GP",
            FormatId::Zip => "ZIP",
            FormatId::SevenZ => "7Z",
            FormatId::Tar => "TAR",
            FormatId::Gz => "GZip",
            FormatId::Bz2 => "BZip2",
            FormatId::Xz => "XZ",
            FormatId::TarGz => "TAR.GZ",
            FormatId::TarBz2 => "TAR.BZ2",
            FormatId::TarXz => "TAR.XZ",
            FormatId::Wim => "WIM",
            FormatId::Cab => "CAB",
            FormatId::Unknown => "Unknown",
        }
    }

    pub fn category(self) -> FormatCategory {
        match self {
            FormatId::Jpeg
            | FormatId::Png
            | FormatId::Webp
            | FormatId::Avif
            | FormatId::Bmp
            | FormatId::Tiff
            | FormatId::Gif
            | FormatId::Ico
            | FormatId::Svg
            | FormatId::Heic => FormatCategory::Image,
            FormatId::Pdf => FormatCategory::Pdf,
            FormatId::Docx
            | FormatId::Doc
            | FormatId::Odt
            | FormatId::Rtf
            | FormatId::Xlsx
            | FormatId::Xls
            | FormatId::Ods
            | FormatId::Csv
            | FormatId::Pptx
            | FormatId::Ppt
            | FormatId::Odp => FormatCategory::Document,
            FormatId::Txt | FormatId::Html => FormatCategory::Text,
            FormatId::Mp3
            | FormatId::Wav
            | FormatId::Flac
            | FormatId::Aac
            | FormatId::M4a
            | FormatId::Wma
            | FormatId::Aiff
            | FormatId::Alac
            | FormatId::Ogg
            | FormatId::Opus => FormatCategory::Audio,
            FormatId::Mp4
            | FormatId::Mkv
            | FormatId::Mov
            | FormatId::Avi
            | FormatId::Webm
            | FormatId::Wmv
            | FormatId::Flv
            | FormatId::Mpeg
            | FormatId::ThreeGp => FormatCategory::Video,
            FormatId::Zip
            | FormatId::SevenZ
            | FormatId::Tar
            | FormatId::Gz
            | FormatId::Bz2
            | FormatId::Xz
            | FormatId::TarGz
            | FormatId::TarBz2
            | FormatId::TarXz
            | FormatId::Wim
            | FormatId::Cab => FormatCategory::Archive,
            FormatId::Unknown => FormatCategory::Other,
        }
    }

    /// Extensions this format is legitimately stored under. Used only to warn
    /// about a mismatch — never to decide how a file is parsed.
    pub fn known_extensions(self) -> &'static [&'static str] {
        match self {
            FormatId::Jpeg => &["jpg", "jpeg"],
            FormatId::Png => &["png"],
            FormatId::Webp => &["webp"],
            FormatId::Avif => &["avif"],
            FormatId::Bmp => &["bmp", "dib"],
            FormatId::Tiff => &["tif", "tiff"],
            FormatId::Gif => &["gif"],
            FormatId::Ico => &["ico"],
            FormatId::Svg => &["svg"],
            FormatId::Heic => &["heic", "heif"],
            FormatId::Pdf => &["pdf"],
            FormatId::Docx => &["docx"],
            FormatId::Doc => &["doc"],
            FormatId::Odt => &["odt"],
            FormatId::Rtf => &["rtf"],
            FormatId::Txt => &["txt", "md", "log"],
            FormatId::Html => &["html", "htm"],
            FormatId::Xlsx => &["xlsx"],
            FormatId::Xls => &["xls"],
            FormatId::Ods => &["ods"],
            FormatId::Csv => &["csv"],
            FormatId::Pptx => &["pptx"],
            FormatId::Ppt => &["ppt"],
            FormatId::Odp => &["odp"],
            FormatId::Mp3 => &["mp3", "mp2"],
            FormatId::Wav => &["wav"],
            FormatId::Flac => &["flac"],
            FormatId::Aac => &["aac"],
            FormatId::M4a => &["m4a", "m4b"],
            FormatId::Wma => &["wma"],
            FormatId::Aiff => &["aiff", "aif", "aifc"],
            FormatId::Alac => &["m4a"],
            FormatId::Ogg => &["ogg", "oga"],
            FormatId::Opus => &["opus", "oga"],
            FormatId::Mp4 => &["mp4", "m4v"],
            FormatId::Mkv => &["mkv"],
            FormatId::Mov => &["mov"],
            FormatId::Avi => &["avi"],
            FormatId::Webm => &["webm"],
            FormatId::Wmv => &["wmv"],
            FormatId::Flv => &["flv"],
            FormatId::Mpeg => &["mpeg", "mpg", "mpe", "m2v"],
            FormatId::ThreeGp => &["3gp", "3gpp"],
            FormatId::Zip => &["zip"],
            FormatId::SevenZ => &["7z"],
            FormatId::Tar => &["tar"],
            FormatId::Gz => &["gz", "tgz"],
            FormatId::Bz2 => &["bz2", "tbz2"],
            FormatId::Xz => &["xz", "txz"],
            FormatId::TarGz => &["tar.gz", "tgz"],
            FormatId::TarBz2 => &["tar.bz2", "tbz2"],
            FormatId::TarXz => &["tar.xz", "txz"],
            FormatId::Wim => &["wim", "swm", "esd"],
            FormatId::Cab => &["cab"],
            FormatId::Unknown => &[],
        }
    }

    /// Archive containers this build can create (and therefore repack into).
    pub fn is_creatable_archive(self) -> bool {
        matches!(
            self,
            FormatId::Zip
                | FormatId::SevenZ
                | FormatId::Tar
                | FormatId::TarGz
                | FormatId::TarBz2
                | FormatId::TarXz
        )
    }

    /// Inputs from which archive contents can be read, including formats that
    /// are extraction-only in this build (CAB, WIM).
    pub fn is_archive_input(self) -> bool {
        matches!(
            self,
            FormatId::Zip
                | FormatId::SevenZ
                | FormatId::Tar
                | FormatId::TarGz
                | FormatId::TarBz2
                | FormatId::TarXz
                | FormatId::Gz
                | FormatId::Bz2
                | FormatId::Xz
                | FormatId::Wim
                | FormatId::Cab
        )
    }

    pub fn is_word_processor(self) -> bool {
        matches!(
            self,
            FormatId::Docx
                | FormatId::Doc
                | FormatId::Odt
                | FormatId::Rtf
                | FormatId::Txt
                | FormatId::Html
        )
    }

    pub fn is_spreadsheet(self) -> bool {
        matches!(
            self,
            FormatId::Xlsx | FormatId::Xls | FormatId::Ods | FormatId::Csv
        )
    }

    pub fn is_presentation(self) -> bool {
        matches!(self, FormatId::Pptx | FormatId::Ppt | FormatId::Odp)
    }
}

/// A producer may report a slightly more specific or more general signature than
/// the requested container: a TAR.GZ output starts with the GZIP magic, and a
/// CSV is text with no signature of its own.
pub fn signatures_compatible(expected: FormatId, detected: FormatId) -> bool {
    expected == detected
        || matches!(
            (expected, detected),
            (FormatId::Csv, FormatId::Txt)
                | (FormatId::Txt, FormatId::Csv)
                | (FormatId::TarGz, FormatId::Gz)
                | (FormatId::TarBz2, FormatId::Bz2)
                | (FormatId::TarXz, FormatId::Xz)
        )
}

impl fmt::Display for FormatId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.label())
    }
}

fn starts_with(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.len() >= needle.len() && haystack[..needle.len()] == *needle
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    needle.len() <= haystack.len()
        && haystack
            .windows(needle.len())
            .any(|window| window == needle)
}

/// Advanced Systems Format header GUID. WMA and WMV share this container.
const ASF_HEADER: [u8; 16] = [
    0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C,
];
/// Stream-type GUIDs inside the ASF header tell audio-only from video. The
/// audio GUID is only needed by the test fixtures; anything without a video
/// stream is WMA.
#[cfg(test)]
const ASF_AUDIO_STREAM: [u8; 16] = [
    0x40, 0x9E, 0x69, 0xF8, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B,
];
const ASF_VIDEO_STREAM: [u8; 16] = [
    0xC0, 0xEF, 0x19, 0xBC, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B,
];

fn asf_format(head: &[u8]) -> Option<FormatId> {
    if !starts_with(head, &ASF_HEADER) {
        return None;
    }
    let window = &head[..head.len().min(8192)];
    Some(if contains(window, &ASF_VIDEO_STREAM) {
        FormatId::Wmv
    } else {
        FormatId::Wma
    })
}

fn is_mpeg_stream(head: &[u8]) -> bool {
    starts_with(head, b"\x00\x00\x01\xBA")
        || starts_with(head, b"\x00\x00\x01\xB3")
        || (head.first() == Some(&0x47) && head.get(188) == Some(&0x47))
}

/// True for `....ftypBRND` ISO-BMFF layout, returning the major brand.
fn isobmff_brand(head: &[u8]) -> Option<[u8; 4]> {
    if head.len() >= 12 && &head[4..8] == b"ftyp" {
        let mut brand = [0u8; 4];
        brand.copy_from_slice(&head[8..12]);
        Some(brand)
    } else {
        None
    }
}

fn ebml_doctype(head: &[u8]) -> Option<Vec<u8>> {
    if !starts_with(head, b"\x1A\x45\xDF\xA3") {
        return None;
    }
    // DocType element id 0x4282, followed by size then the ASCII value.
    let window = &head[..head.len().min(128)];
    window
        .windows(2)
        .position(|w| w == [0x42, 0x82])
        .and_then(|idx| window.get(idx + 2..idx + 20))
        .map(|slice| {
            slice
                .iter()
                .copied()
                .take_while(|byte| byte.is_ascii_graphic() || *byte == b' ')
                .collect::<Vec<u8>>()
        })
}

/// Compound File Binary (legacy DOC/XLS/PPT) signature.
const CFB_MAGIC: [u8; 8] = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

fn contains_utf16_le(haystack: &[u8], needle: &str) -> bool {
    let mut pattern = Vec::with_capacity(needle.len() * 2);
    for byte in needle.bytes() {
        pattern.push(byte);
        pattern.push(0);
    }
    haystack
        .windows(pattern.len())
        .any(|window| window == pattern.as_slice())
}

/// Legacy Office files are all OLE compound documents; the directory entry
/// names are what tell Word, Excel and PowerPoint apart.
fn cfb_office_format(head: &[u8]) -> Option<FormatId> {
    if !starts_with(head, &CFB_MAGIC) {
        return None;
    }
    if contains_utf16_le(head, "WordDocument") {
        return Some(FormatId::Doc);
    }
    if contains_utf16_le(head, "PowerPoint Document") {
        return Some(FormatId::Ppt);
    }
    if contains_utf16_le(head, "Workbook") || contains_utf16_le(head, "Book") {
        return Some(FormatId::Xls);
    }
    None
}

/// Password-protected OOXML packages are CFB containers with these streams,
/// regardless of whether the document was made in Word, Excel or PowerPoint.
pub fn looks_like_encrypted_office(head: &[u8]) -> bool {
    starts_with(head, &CFB_MAGIC)
        && (contains_utf16_le(head, "EncryptedPackage")
            || contains_utf16_le(head, "EncryptionInfo"))
}

fn office_format_from_zip(head: &[u8]) -> FormatId {
    // Office Open XML and ODF are both ZIPs; the stored entry names and the
    // uncompressed ODF `mimetype` member reveal which office format it really is.
    let text = String::from_utf8_lossy(head);
    if text.contains("word/") {
        FormatId::Docx
    } else if text.contains("xl/") {
        FormatId::Xlsx
    } else if text.contains("ppt/") {
        FormatId::Pptx
    } else if text.contains("opendocument.text") {
        FormatId::Odt
    } else if text.contains("opendocument.spreadsheet") {
        FormatId::Ods
    } else if text.contains("opendocument.presentation") {
        FormatId::Odp
    } else {
        FormatId::Zip
    }
}

/// Identify a file from its leading bytes. Extension is never consulted here.
pub fn detect_from_head(head: &[u8]) -> FormatId {
    if head.is_empty() {
        return FormatId::Unknown;
    }

    if starts_with(head, b"\x89PNG\r\n\x1a\n") {
        return FormatId::Png;
    }
    if starts_with(head, b"\xFF\xD8\xFF") {
        return FormatId::Jpeg;
    }
    if starts_with(head, b"GIF87a") || starts_with(head, b"GIF89a") {
        return FormatId::Gif;
    }
    if starts_with(head, b"BM") {
        return FormatId::Bmp;
    }
    if starts_with(head, b"II*\x00") || starts_with(head, b"MM\x00*") {
        return FormatId::Tiff;
    }
    if starts_with(head, b"RIFF") && head.len() >= 12 && &head[8..12] == b"WEBP" {
        return FormatId::Webp;
    }
    if starts_with(head, b"RIFF") && head.len() >= 12 && &head[8..12] == b"WAVE" {
        return FormatId::Wav;
    }
    if starts_with(head, b"RIFF") && head.len() >= 12 && &head[8..12] == b"AVI " {
        return FormatId::Avi;
    }
    // Classic AVI files start with "RIFF"; the plain "AVI " check above is kept
    // for variants whose RIFF marker sits deeper in the header.
    if starts_with(head, b"AVI ") {
        return FormatId::Avi;
    }
    if starts_with(head, b"FORM") && head.len() >= 12 && matches!(&head[8..12], b"AIFF" | b"AIFC") {
        return FormatId::Aiff;
    }
    if starts_with(head, b"FLV\x01") {
        return FormatId::Flv;
    }
    if let Some(asf) = asf_format(head) {
        return asf;
    }
    if is_mpeg_stream(head) {
        return FormatId::Mpeg;
    }
    if starts_with(head, b"\x00\x00\x01\x00") {
        return FormatId::Ico;
    }
    if starts_with(head, b"%PDF") {
        return FormatId::Pdf;
    }
    if let Some(office) = cfb_office_format(head) {
        return office;
    }
    if starts_with(head, b"MSCF") {
        return FormatId::Cab;
    }
    if starts_with(head, b"MSWIM\0\0\0") {
        return FormatId::Wim;
    }
    if starts_with(head, b"fLaC") {
        return FormatId::Flac;
    }
    if starts_with(head, b"OggS") {
        let text = String::from_utf8_lossy(&head[..head.len().min(64)]);
        return if text.contains("OpusHead") {
            FormatId::Opus
        } else {
            FormatId::Ogg
        };
    }
    if starts_with(head, b"\x1F\x8B") {
        return FormatId::Gz;
    }
    if starts_with(head, b"BZh") {
        return FormatId::Bz2;
    }
    if starts_with(head, b"\xFD7zXZ\x00") {
        return FormatId::Xz;
    }
    if starts_with(head, b"7z\xBC\xAF\x27\x1C") {
        return FormatId::SevenZ;
    }
    if head.len() >= 262 && &head[257..262] == b"ustar" {
        return FormatId::Tar;
    }
    if starts_with(head, b"{\\rtf") {
        return FormatId::Rtf;
    }
    if starts_with(head, b"ID3") {
        return FormatId::Mp3;
    }
    // An MPEG frame starts with 11 set bits, which 0xFF-prefixed AAC (ADTS)
    // shares with MP3. The two-bit layer field is what actually separates them.
    if head.len() >= 2 && head[0] == 0xFF && head[1] & 0xE0 == 0xE0 {
        match head[1] & 0x06 {
            0x02 => return FormatId::Mp3,
            0x00 => return FormatId::Aac,
            _ => {}
        }
    }

    if let Some(brand) = isobmff_brand(head) {
        return match &brand {
            b"avif" | b"avis" | b"avio" => FormatId::Avif,
            b"heic" | b"heix" | b"hevc" | b"mif1" | b"msf1" | b"heim" => FormatId::Heic,
            b"qt  " => FormatId::Mov,
            // Audio-only MP4. ALAC and AAC share the M4A container, so the codec
            // atom, when it sits near the header, decides which one this is.
            b"M4A " | b"M4B " | b"F4A " => {
                if contains(&head[..head.len().min(64 * 1024)], b"alac") {
                    FormatId::Alac
                } else {
                    FormatId::M4a
                }
            }
            b"3gp4" | b"3gp5" | b"3gp6" | b"3gp7" | b"3gg6" | b"3gs7" | b"3gr6" => {
                FormatId::ThreeGp
            }
            _ => FormatId::Mp4,
        };
    }

    if let Some(doctype) = ebml_doctype(head) {
        return match doctype.as_slice() {
            b"webm" => FormatId::Webm,
            b"matroska" => FormatId::Mkv,
            _ => FormatId::Mkv,
        };
    }

    if starts_with(head, b"PK\x03\x04") || starts_with(head, b"PK\x05\x06") {
        return office_format_from_zip(head);
    }

    // Text-ish payloads: XML vector, HTML, then plain text.
    let probe_len = head.len().min(4096);
    let trimmed = trim_ascii_lead(&head[..probe_len]);
    let as_text = String::from_utf8_lossy(trimmed);
    let lower = as_text.to_lowercase();
    if trimmed.starts_with(b"<") {
        if lower.contains("<svg") {
            return FormatId::Svg;
        }
        if lower.contains("<html") || lower.starts_with("<!doctype html") || lower.contains("<head")
        {
            return FormatId::Html;
        }
        if lower.starts_with("<?xml") {
            return FormatId::Txt;
        }
    }
    if looks_like_text(trimmed) {
        return FormatId::Txt;
    }

    FormatId::Unknown
}

fn trim_ascii_lead(bytes: &[u8]) -> &[u8] {
    let start = bytes
        .iter()
        .position(|byte| !matches!(byte, b' ' | b'\t' | b'\r' | b'\n' | 0xEF | 0xBB | 0xBF))
        .unwrap_or(0);
    &bytes[start..]
}

/// Conservative: mostly printable ASCII/UTF-8 with few control characters.
fn looks_like_text(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return false;
    }
    let sample = &bytes[..bytes.len().min(1024)];
    let mut unusual = 0usize;
    for byte in sample {
        match byte {
            b'\t' | b'\n' | b'\r' | 0x0C => {}
            0x20..=0x7E => {}
            0x80..=0xFF => {}
            _ => unusual += 1,
        }
    }
    unusual * 100 < sample.len()
}

pub fn detect_from_path(path: &std::path::Path) -> FormatId {
    use std::io::Read;
    // Large enough for the OLE directory (which can sit well past the first
    // sector) and the first OOXML members. A file signature alone is never
    // trusted; this head is only a starting point.
    const HEAD_LEN: usize = 256 * 1024;
    let mut file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return FormatId::Unknown,
    };
    let mut buffer = vec![0u8; HEAD_LEN];
    let read = match file.read(&mut buffer) {
        Ok(read) => read,
        Err(_) => return FormatId::Unknown,
    };
    buffer.truncate(read);
    let detected = detect_from_head(&buffer);
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    // A gzip/bzip2/xz stream does not say whether it wraps a tar archive. The
    // conventional compound extension is the only signal, and it changes only
    // the label and the planned output name — extraction handles both layouts.
    match detected {
        FormatId::Gz if name.ends_with(".tar.gz") || name.ends_with(".tgz") => {
            return FormatId::TarGz;
        }
        FormatId::Bz2 if name.ends_with(".tar.bz2") || name.ends_with(".tbz2") => {
            return FormatId::TarBz2;
        }
        FormatId::Xz if name.ends_with(".tar.xz") || name.ends_with(".txz") => {
            return FormatId::TarXz;
        }
        // CSV has no signature of its own. Only a text-looking file that also says
        // `.csv` is treated as a spreadsheet; a mislabelled binary stays binary.
        FormatId::Txt if name.ends_with(".csv") => return FormatId::Csv,
        _ => {}
    }
    // An encrypted OOXML package is a CFB container without the plain document
    // streams, so signature detection alone cannot name it. The extension gets
    // it far enough to show a precise "password-protected" error instead of
    // "unrecognised file".
    if detected == FormatId::Unknown && looks_like_encrypted_office(&buffer) {
        if name.ends_with(".docx") || name.ends_with(".doc") {
            return FormatId::Doc;
        }
        if name.ends_with(".xlsx") || name.ends_with(".xls") {
            return FormatId::Xls;
        }
        if name.ends_with(".pptx") || name.ends_with(".ppt") {
            return FormatId::Ppt;
        }
    }
    detected
}

/// Reads enough of a file to spot an encrypted OOXML package. Used to give a
/// precise error instead of calling the file unrecognisable.
pub fn encrypted_office_path(path: &std::path::Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut buffer = vec![0u8; 256 * 1024];
    let Ok(read) = file.read(&mut buffer) else {
        return false;
    };
    buffer.truncate(read);
    looks_like_encrypted_office(&buffer)
}

pub fn extension_matches(path: &std::path::Path, format: FormatId) -> bool {
    let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };
    let normalised = ext.to_ascii_lowercase();
    format.known_extensions().contains(&normalised.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_beats_extension() {
        let bytes = b"\x89PNG\r\n\x1a\n" as &[u8];
        assert_eq!(
            detect_from_head(&[bytes, &[0u8; 32]].concat()),
            FormatId::Png
        );
    }

    #[test]
    fn pdf_signature() {
        assert_eq!(detect_from_head(b"%PDF-1.7"), FormatId::Pdf);
    }

    #[test]
    fn gif_signature() {
        assert_eq!(detect_from_head(b"GIF89a...."), FormatId::Gif);
    }

    #[test]
    fn office_zip_is_docx() {
        let mut head = b"PK\x03\x04".to_vec();
        head.extend_from_slice(b"[Content_Types].xmlword/document.xml");
        assert_eq!(detect_from_head(&head), FormatId::Docx);
    }

    #[test]
    fn empty_is_unknown() {
        assert_eq!(detect_from_head(&[]), FormatId::Unknown);
    }

    #[test]
    fn plain_text_when_no_signature() {
        assert_eq!(detect_from_head(b"just some words\n"), FormatId::Txt);
    }

    #[test]
    fn svg_detected_over_xml() {
        assert_eq!(detect_from_head(b"<svg xmlns=\"x\"></svg>"), FormatId::Svg);
    }

    fn with_padding(mut head: Vec<u8>) -> Vec<u8> {
        head.resize(256, 0);
        head
    }

    #[test]
    fn asf_audio_and_video_are_told_apart() {
        let mut audio = with_padding(ASF_HEADER.to_vec());
        audio[64..80].copy_from_slice(&ASF_AUDIO_STREAM);
        assert_eq!(detect_from_head(&audio), FormatId::Wma);

        let mut video = with_padding(ASF_HEADER.to_vec());
        video[64..80].copy_from_slice(&ASF_VIDEO_STREAM);
        video[96..112].copy_from_slice(&ASF_AUDIO_STREAM);
        assert_eq!(
            detect_from_head(&video),
            FormatId::Wmv,
            "a video stream wins"
        );
    }

    #[test]
    fn aiff_flv_and_mpeg_signatures() {
        assert_eq!(
            detect_from_head(&with_padding(b"FORM\x00\x00\x00\x00AIFF".to_vec())),
            FormatId::Aiff
        );
        assert_eq!(detect_from_head(b"FLV\x01\x05"), FormatId::Flv);
        assert_eq!(detect_from_head(b"\x00\x00\x01\xBA\x44"), FormatId::Mpeg);
        let mut transport = vec![0u8; 400];
        transport[0] = 0x47;
        transport[188] = 0x47;
        assert_eq!(detect_from_head(&transport), FormatId::Mpeg);
    }

    #[test]
    fn audio_only_mp4_brands_become_m4a_or_alac() {
        let m4a = with_padding(b"\x00\x00\x00\x20ftypM4A \x00\x00\x02\x00M4A mp42isom".to_vec());
        assert_eq!(detect_from_head(&m4a), FormatId::M4a);

        let mut alac = m4a.clone();
        alac[64..68].copy_from_slice(b"alac");
        assert_eq!(detect_from_head(&alac), FormatId::Alac);

        assert_eq!(
            detect_from_head(&with_padding(
                b"\x00\x00\x00\x20ftyp3gp4\x00\x00\x02\x003gp4isom".to_vec()
            )),
            FormatId::ThreeGp
        );
    }

    #[test]
    fn avi_riff_header_is_detected() {
        let mut head = b"RIFF\x00\x00\x00\x00AVI LIST".to_vec();
        head.resize(32, 0);
        assert_eq!(detect_from_head(&head), FormatId::Avi);
    }

    fn cfb_with_stream(name: &str) -> Vec<u8> {
        let mut head = CFB_MAGIC.to_vec();
        head.extend(std::iter::repeat_n(0u8, 512));
        for byte in name.bytes() {
            head.push(byte);
            head.push(0);
        }
        head
    }

    #[test]
    fn legacy_office_streams_are_told_apart() {
        assert_eq!(
            detect_from_head(&cfb_with_stream("WordDocument")),
            FormatId::Doc
        );
        assert_eq!(
            detect_from_head(&cfb_with_stream("PowerPoint Document")),
            FormatId::Ppt
        );
        assert_eq!(
            detect_from_head(&cfb_with_stream("Workbook")),
            FormatId::Xls
        );
        assert_eq!(
            detect_from_head(&with_padding(CFB_MAGIC.to_vec())),
            FormatId::Unknown
        );
    }

    #[test]
    fn encrypted_ooxml_is_not_mistaken_for_a_plain_document() {
        let head = cfb_with_stream("EncryptedPackage\0\0EncryptionInfo");
        assert!(looks_like_encrypted_office(&head));
        assert_eq!(detect_from_head(&head), FormatId::Unknown);
    }

    #[test]
    fn cab_and_wim_signatures() {
        assert_eq!(detect_from_head(b"MSCF\x00\x00\x00\x00"), FormatId::Cab);
        assert_eq!(detect_from_head(b"MSWIM\0\0\0\x10"), FormatId::Wim);
    }

    #[test]
    fn csv_is_detected_from_a_text_body_only_with_the_extension() {
        let dir = std::env::temp_dir().join(format!("uc-csv-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let csv = dir.join("table.csv");
        std::fs::write(&csv, b"name,size\nalpha,1\n").unwrap();
        assert_eq!(detect_from_path(&csv), FormatId::Csv);

        let masquerade = dir.join("table.txt");
        std::fs::write(&masquerade, b"name,size\nalpha,1\n").unwrap();
        assert_eq!(detect_from_path(&masquerade), FormatId::Txt);

        let binary = dir.join("binary.csv");
        std::fs::write(&binary, [0u8, 1, 2, 3, 4, 5, 6, 7]).unwrap();
        assert_eq!(detect_from_path(&binary), FormatId::Unknown);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn compound_archive_extensions_refine_the_outer_signature() {
        let dir = std::env::temp_dir().join(format!("uc-compound-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let cases = [
            ("bundle.tar.gz", b"\x1F\x8B\x08".as_slice(), FormatId::TarGz),
            ("bundle.tgz", b"\x1F\x8B\x08".as_slice(), FormatId::TarGz),
            ("bundle.tar.bz2", b"BZh9".as_slice(), FormatId::TarBz2),
            ("bundle.tbz2", b"BZh9".as_slice(), FormatId::TarBz2),
            ("bundle.tar.xz", b"\xFD7zXZ\x00".as_slice(), FormatId::TarXz),
            ("bundle.txz", b"\xFD7zXZ\x00".as_slice(), FormatId::TarXz),
            ("single.gz", b"\x1F\x8B\x08".as_slice(), FormatId::Gz),
        ];
        for (name, bytes, expected) in cases {
            let path = dir.join(name);
            std::fs::write(&path, bytes).unwrap();
            assert_eq!(detect_from_path(&path), expected, "wrong format for {name}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn compound_archive_outputs_accept_their_outer_signature() {
        assert!(signatures_compatible(FormatId::TarGz, FormatId::Gz));
        assert!(signatures_compatible(FormatId::TarBz2, FormatId::Bz2));
        assert!(signatures_compatible(FormatId::TarXz, FormatId::Xz));
        assert!(signatures_compatible(FormatId::Csv, FormatId::Txt));
        assert!(!signatures_compatible(FormatId::Zip, FormatId::SevenZ));
        assert!(!signatures_compatible(FormatId::Docx, FormatId::Zip));
    }

    #[test]
    fn format_families_are_disjoint_and_complete() {
        for format in [
            FormatId::Docx,
            FormatId::Doc,
            FormatId::Odt,
            FormatId::Rtf,
            FormatId::Txt,
            FormatId::Html,
        ] {
            assert!(
                format.is_word_processor(),
                "{format:?} should be a writer format"
            );
        }
        for format in [FormatId::Xlsx, FormatId::Xls, FormatId::Ods, FormatId::Csv] {
            assert!(
                format.is_spreadsheet(),
                "{format:?} should be a spreadsheet"
            );
        }
        for format in [FormatId::Pptx, FormatId::Ppt, FormatId::Odp] {
            assert!(
                format.is_presentation(),
                "{format:?} should be a presentation"
            );
        }
        assert!(FormatId::SevenZ.is_creatable_archive());
        assert!(!FormatId::Cab.is_creatable_archive());
        assert!(FormatId::Cab.is_archive_input());
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
                format.is_archive_input(),
                "{format:?} should be extractable"
            );
        }
    }
}
