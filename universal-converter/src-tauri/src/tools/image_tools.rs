use crate::core::format::{self, FormatId};
use crate::error::ConversionError;
use crate::utils::limits;
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageReader, RgbaImage};
use serde::Serialize;
use std::fs::File;
use std::io::Read;
use std::path::Path;

fn invalid(path: &Path, reason: impl std::fmt::Display) -> ConversionError {
    ConversionError::Unreadable {
        path: path.display().to_string(),
        reason: reason.to_string(),
    }
}

fn image_error(path: &Path, error: image::ImageError) -> ConversionError {
    match error {
        image::ImageError::Limits(_) => ConversionError::PixelLimit {
            pixels: limits::MAX_IMAGE_PIXELS,
            limit: limits::MAX_IMAGE_PIXELS,
        },
        other => ConversionError::Corrupt {
            path: format!("{} ({other})", path.display()),
        },
    }
}

fn mime_for(format: FormatId) -> &'static str {
    match format {
        FormatId::Jpeg => "image/jpeg",
        FormatId::Png => "image/png",
        FormatId::Webp => "image/webp",
        FormatId::Gif => "image/gif",
        FormatId::Bmp => "image/bmp",
        FormatId::Tiff => "image/tiff",
        FormatId::Ico => "image/x-icon",
        FormatId::Avif => "image/avif",
        FormatId::Heic => "image/heic",
        FormatId::Svg => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub format: FormatId,
    pub format_label: String,
    pub mime_type: String,
    pub extension: Option<String>,
    pub width: u32,
    pub height: u32,
    pub color_type: String,
    pub bits_per_pixel: u16,
    pub has_alpha: bool,
    pub megapixels: f64,
}

pub fn image_info(path: &Path) -> Result<ImageInfo, ConversionError> {
    let metadata = std::fs::metadata(path).map_err(|error| invalid(path, error))?;
    if !metadata.is_file() {
        return Err(ConversionError::Other(format!(
            "{} is a folder; choose an image file",
            path.display()
        )));
    }
    let reader = ImageReader::open(path)
        .map_err(|error| invalid(path, error))?
        .with_guessed_format()
        .map_err(|error| invalid(path, error))?;
    let format = reader
        .format()
        .map(|format| match format {
            image::ImageFormat::Jpeg => FormatId::Jpeg,
            image::ImageFormat::Png => FormatId::Png,
            image::ImageFormat::WebP => FormatId::Webp,
            image::ImageFormat::Gif => FormatId::Gif,
            image::ImageFormat::Bmp => FormatId::Bmp,
            image::ImageFormat::Tiff => FormatId::Tiff,
            image::ImageFormat::Ico => FormatId::Ico,
            image::ImageFormat::Avif => FormatId::Avif,
            _ => FormatId::Unknown,
        })
        .unwrap_or_else(|| format::detect_from_path(path));
    let decoder = reader
        .into_decoder()
        .map_err(|error| image_error(path, error))?;
    let (width, height) = decoder.dimensions();
    let color = decoder.color_type();
    let pixels = u64::from(width) * u64::from(height);
    if pixels > limits::MAX_IMAGE_PIXELS {
        return Err(ConversionError::PixelLimit {
            pixels,
            limit: limits::MAX_IMAGE_PIXELS,
        });
    }
    Ok(ImageInfo {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string()),
        size_bytes: metadata.len(),
        format,
        format_label: format.label().to_owned(),
        mime_type: mime_for(format).to_owned(),
        extension: path
            .extension()
            .map(|extension| extension.to_string_lossy().to_ascii_lowercase()),
        width,
        height,
        color_type: format!("{color:?}"),
        bits_per_pixel: color.bits_per_pixel(),
        has_alpha: color.has_alpha(),
        megapixels: (pixels as f64 / 1_000_000.0 * 100.0).round() / 100.0,
    })
}

fn decode(path: &Path) -> Result<RgbaImage, ConversionError> {
    let metadata = std::fs::metadata(path).map_err(|error| invalid(path, error))?;
    if !metadata.is_file() {
        return Err(ConversionError::Other(format!(
            "{} is a folder; choose an image file",
            path.display()
        )));
    }
    let reader = ImageReader::open(path)
        .map_err(|error| invalid(path, error))?
        .with_guessed_format()
        .map_err(|error| invalid(path, error))?;
    if let Ok(decoder) = reader.into_decoder() {
        let (width, height) = decoder.dimensions();
        let pixels = u64::from(width) * u64::from(height);
        if pixels > limits::MAX_IMAGE_PIXELS {
            return Err(ConversionError::PixelLimit {
                pixels,
                limit: limits::MAX_IMAGE_PIXELS,
            });
        }
    }
    image::open(path)
        .map(|image| image.to_rgba8())
        .map_err(|error| image_error(path, error))
}

const DIFF_TOLERANCE: i16 = 8;
const PREVIEW_MAX: u32 = 480;

fn channel_diff(a: &[u8], b: &[u8]) -> bool {
    a.iter()
        .zip(b)
        .any(|(left, right)| (i16::from(*left) - i16::from(*right)).abs() > DIFF_TOLERANCE)
}

fn preview(a: &RgbaImage, b: &RgbaImage, width: u32, height: u32) -> RgbaImage {
    let scale = (PREVIEW_MAX as f32 / width.max(1) as f32)
        .min(PREVIEW_MAX as f32 / height.max(1) as f32)
        .min(1.0);
    let preview_width = ((width as f32 * scale).round() as u32).max(1);
    let preview_height = ((height as f32 * scale).round() as u32).max(1);
    let mut base = DynamicImage::ImageRgba8(b.clone())
        .resize_exact(
            preview_width,
            preview_height,
            image::imageops::FilterType::Triangle,
        )
        .to_rgba8();
    let left = DynamicImage::ImageRgba8(a.clone())
        .resize_exact(
            preview_width,
            preview_height,
            image::imageops::FilterType::Triangle,
        )
        .to_rgba8();
    for (x, y, pixel) in base.enumerate_pixels_mut() {
        let other = left.get_pixel(x, y);
        let different = if x < left.width() && y < left.height() {
            channel_diff(&pixel.0, &other.0)
        } else {
            false
        };
        if different {
            *pixel = image::Rgba([220, 56, 56, 255]);
        }
    }
    base
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageComparison {
    pub path_a: String,
    pub path_b: String,
    pub name_a: String,
    pub name_b: String,
    pub width_a: u32,
    pub height_a: u32,
    pub width_b: u32,
    pub height_b: u32,
    pub same_dimensions: bool,
    pub identical: bool,
    pub different_pixels: u64,
    pub total_pixels: u64,
    pub difference_percent: f64,
    pub preview_data_url: String,
    pub note: String,
}

pub fn compare_images(first: &Path, second: &Path) -> Result<ImageComparison, ConversionError> {
    let a = decode(first)?;
    let b = decode(second)?;
    let (width_a, height_a) = a.dimensions();
    let (width_b, height_b) = b.dimensions();
    let width = width_a.max(width_b);
    let height = height_a.max(height_b);
    let total = u64::from(width) * u64::from(height);
    let mut different = 0u64;
    for y in 0..height {
        for x in 0..width {
            let left = (x < width_a && y < height_a).then(|| a.get_pixel(x, y));
            let right = (x < width_b && y < height_b).then(|| b.get_pixel(x, y));
            match (left, right) {
                (Some(left), Some(right)) if !channel_diff(&left.0, &right.0) => {}
                _ => different += 1,
            }
        }
    }
    let same_dimensions = (width_a, height_a) == (width_b, height_b);
    let mut note = "pixels are compared at full resolution; the preview is downscaled".to_owned();
    if !same_dimensions {
        note.push_str(" and areas missing from one image count as different");
    }
    let overlay = preview(&a, &b, width, height);
    let encoded = {
        let mut bytes = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut bytes);
        encoder
            .write_image(
                overlay.as_raw(),
                overlay.width(),
                overlay.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|error| ConversionError::Image(error.to_string()))?;
        format!("data:image/png;base64,{}", base64_encode(&bytes))
    };
    let difference_percent = if total == 0 {
        0.0
    } else {
        (different as f64 / total as f64 * 10_000.0).round() / 100.0
    };
    Ok(ImageComparison {
        path_a: first.display().to_string(),
        path_b: second.display().to_string(),
        name_a: file_name(first),
        name_b: file_name(second),
        width_a,
        height_a,
        width_b,
        height_b,
        same_dimensions,
        identical: different == 0,
        different_pixels: different,
        total_pixels: total,
        difference_percent,
        preview_data_url: encoded,
        note,
    })
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = chunk.get(1).copied().unwrap_or(0);
        let third = chunk.get(2).copied().unwrap_or(0);
        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(TABLE[(((first & 0x03) << 4) | (second >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((second & 0x0F) << 2) | (third >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(third & 0x3F) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

/// Metadata blocks this app can see without decoding the pixels. Used both by
/// the reader and by the removal verifier, so "removed" means the same test
/// passes on the written file.
pub fn metadata_markers(bytes: &[u8], format: FormatId) -> Vec<String> {
    let mut found = Vec::new();
    match format {
        FormatId::Jpeg => {
            let mut cursor = 2usize;
            while cursor + 4 <= bytes.len() {
                if bytes[cursor] != 0xFF {
                    break;
                }
                let mut marker_pos = cursor;
                while marker_pos < bytes.len() && bytes[marker_pos] == 0xFF {
                    marker_pos += 1;
                }
                if marker_pos >= bytes.len() {
                    break;
                }
                let marker = bytes[marker_pos];
                cursor = marker_pos + 1;
                if marker == 0xD8 || marker == 0xD9 || (0xD0..=0xD7).contains(&marker) {
                    continue;
                }
                if cursor + 2 > bytes.len() {
                    break;
                }
                let length = u16::from_be_bytes([bytes[cursor], bytes[cursor + 1]]) as usize;
                if length < 2 || cursor + length > bytes.len() {
                    break;
                }
                let payload = &bytes[cursor + 2..cursor + length];
                match marker {
                    0xE1 if payload.starts_with(b"Exif\0\0") => push_once(&mut found, "EXIF"),
                    0xE1 if payload.starts_with(b"http://ns.adobe.com/xap/1.0/") => {
                        push_once(&mut found, "XMP")
                    }
                    0xE2 if payload.starts_with(b"ICC_PROFILE") => {
                        push_once(&mut found, "ICC profile")
                    }
                    0xED => push_once(&mut found, "IPTC/Photoshop"),
                    _ => {}
                }
                cursor += length;
                if marker == 0xDA {
                    break;
                }
            }
        }
        FormatId::Png => {
            let mut cursor = 8usize;
            while cursor + 8 <= bytes.len() {
                let length = u32::from_be_bytes([
                    bytes[cursor],
                    bytes[cursor + 1],
                    bytes[cursor + 2],
                    bytes[cursor + 3],
                ]) as usize;
                let kind = &bytes[cursor + 4..cursor + 8];
                let name = match kind {
                    b"tEXt" | b"zTXt" => Some("Text comment"),
                    b"iTXt" => {
                        let payload = bytes.get(cursor + 8..).unwrap_or_default();
                        if payload
                            .windows(15)
                            .any(|window| window == b"XML:com.adobe.xmp")
                        {
                            Some("XMP")
                        } else {
                            Some("Text comment")
                        }
                    }
                    b"eXIf" => Some("EXIF"),
                    b"iCCP" => Some("ICC profile"),
                    b"tIME" => Some("Timestamp"),
                    _ => None,
                };
                if let Some(name) = name {
                    push_once(&mut found, name);
                }
                cursor = cursor.saturating_add(12 + length);
                if kind == b"IEND" {
                    break;
                }
            }
        }
        FormatId::Webp => {
            let mut cursor = 12usize;
            while cursor + 8 <= bytes.len() {
                let kind = &bytes[cursor..cursor + 4];
                let length = u32::from_le_bytes([
                    bytes[cursor + 4],
                    bytes[cursor + 5],
                    bytes[cursor + 6],
                    bytes[cursor + 7],
                ]) as usize;
                match kind {
                    b"EXIF" => push_once(&mut found, "EXIF"),
                    b"XMP " => push_once(&mut found, "XMP"),
                    b"ICCP" => push_once(&mut found, "ICC profile"),
                    _ => {}
                }
                cursor = cursor.saturating_add(8 + length + (length & 1));
            }
        }
        FormatId::Tiff => {
            push_once(&mut found, "EXIF (TIFF tags)");
        }
        _ => {
            if contains_bytes(bytes, b"Exif\0\0") {
                push_once(&mut found, "EXIF");
            }
            if contains_bytes(bytes, b"http://ns.adobe.com/xap") {
                push_once(&mut found, "XMP");
            }
            if contains_bytes(bytes, b"ICC_PROFILE") || contains_bytes(bytes, b"iCCP") {
                push_once(&mut found, "ICC profile");
            }
            if contains_bytes(bytes, b"Photoshop 3.0") {
                push_once(&mut found, "IPTC/Photoshop");
            }
        }
    }
    found
}

fn push_once(found: &mut Vec<String>, name: &str) {
    if !found.iter().any(|entry| entry == name) {
        found.push(name.to_owned());
    }
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

fn read_all(path: &Path, limit_bytes: u64) -> Result<Vec<u8>, ConversionError> {
    let metadata = std::fs::metadata(path).map_err(|error| invalid(path, error))?;
    if metadata.len() > limit_bytes {
        return Err(ConversionError::Other(format!(
            "{} is larger than {} MB; metadata editing is limited to files this size",
            path.display(),
            limit_bytes / (1024 * 1024)
        )));
    }
    let mut file = File::open(path).map_err(|error| invalid(path, error))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| invalid(path, error))?;
    Ok(bytes)
}

pub fn markers_in_file(path: &Path) -> Result<Vec<String>, ConversionError> {
    let format = format::detect_from_path(path);
    let bytes = read_all(path, 512 * 1024 * 1024)?;
    Ok(metadata_markers(&bytes, format))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageStripResult {
    pub output_path: String,
    pub format: FormatId,
    pub bytes_before: u64,
    pub bytes_after: u64,
    pub removed: Vec<String>,
    pub verified: bool,
    pub note: String,
}

fn ensure_not_original(input: &Path, output: &Path) -> Result<(), ConversionError> {
    let input_abs = std::fs::canonicalize(input).map_err(|error| invalid(input, error))?;
    let parent = output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(parent).map_err(|error| {
        ConversionError::Other(format!("could not create {}: {error}", parent.display()))
    })?;
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
    Ok(())
}

pub fn strip_image_metadata(
    input: &Path,
    output: &Path,
    overwrite: bool,
) -> Result<ImageStripResult, ConversionError> {
    ensure_not_original(input, output)?;
    if output.exists() && !overwrite {
        return Err(ConversionError::Other(format!(
            "{} already exists; confirm replacing it",
            output.display()
        )));
    }
    let detected = format::detect_from_path(input);
    let bytes = read_all(input, 512 * 1024 * 1024)?;
    let removed = metadata_markers(&bytes, detected);
    let stripped = match detected {
        FormatId::Jpeg => strip_jpeg(&bytes),
        FormatId::Png => strip_png(&bytes),
        FormatId::Webp => strip_webp(&bytes),
        other => {
            return Err(ConversionError::Other(format!(
                "{} metadata cannot be removed losslessly in this build; supported formats are JPEG, PNG and WebP",
                other.label()
            )))
        }
    }
    .map_err(|reason| ConversionError::Corrupt {
        path: format!("{} ({reason})", input.display()),
    })?;

    limits::ensure_parent_dir(output)?;
    std::fs::write(output, &stripped).map_err(|error| {
        ConversionError::Other(format!("could not write {}: {error}", output.display()))
    })?;

    let verification = (|| -> Result<(), ConversionError> {
        let written = std::fs::read(output).map_err(|error| invalid(output, error))?;
        image::load_from_memory_with_format(&written, image_format(detected))
            .map_err(|error| image_error(output, error))?;
        let remaining = metadata_markers(&written, detected);
        if !remaining.is_empty() {
            return Err(ConversionError::InvalidOutput {
                path: format!(
                    "{} still contains {}",
                    output.display(),
                    remaining.join(", ")
                ),
            });
        }
        Ok(())
    })();
    if let Err(error) = verification {
        let _ = std::fs::remove_file(output);
        return Err(error);
    }

    Ok(ImageStripResult {
        output_path: output.display().to_string(),
        format: detected,
        bytes_before: bytes.len() as u64,
        bytes_after: stripped.len() as u64,
        removed: removed.clone(),
        verified: true,
        note: if removed.is_empty() {
            "no embedded metadata was found; the copy contains the same pixels".to_owned()
        } else {
            "the written file was decoded again and every known metadata block is gone".to_owned()
        },
    })
}

fn image_format(format: FormatId) -> image::ImageFormat {
    match format {
        FormatId::Jpeg => image::ImageFormat::Jpeg,
        FormatId::Png => image::ImageFormat::Png,
        FormatId::Webp => image::ImageFormat::WebP,
        _ => image::ImageFormat::Png,
    }
}

fn strip_jpeg(input: &[u8]) -> Result<Vec<u8>, &'static str> {
    if input.len() < 4 || input[0] != 0xFF || input[1] != 0xD8 {
        return Err("not a JPEG stream");
    }
    let mut output = Vec::with_capacity(input.len());
    output.extend_from_slice(&[0xFF, 0xD8]);
    let mut cursor = 2usize;
    while cursor < input.len() {
        if input[cursor] != 0xFF {
            return Err("a JPEG marker was expected");
        }
        let mut marker_pos = cursor;
        while marker_pos < input.len() && input[marker_pos] == 0xFF {
            marker_pos += 1;
        }
        if marker_pos >= input.len() {
            return Err("the JPEG ends inside a marker");
        }
        let marker = input[marker_pos];
        cursor = marker_pos + 1;
        if marker == 0xD9 {
            output.extend_from_slice(&[0xFF, 0xD9]);
            break;
        }
        if marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
            output.extend_from_slice(&[0xFF, marker]);
            continue;
        }
        if cursor + 2 > input.len() {
            return Err("the JPEG ends inside a segment header");
        }
        let length = u16::from_be_bytes([input[cursor], input[cursor + 1]]) as usize;
        if length < 2 || cursor + length > input.len() {
            return Err("a JPEG segment declares a bad length");
        }
        let keep = !(marker == 0xFE || (0xE1..=0xED).contains(&marker) || marker == 0xEF);
        if keep {
            output.extend_from_slice(&[0xFF, marker]);
            output.extend_from_slice(&input[cursor..cursor + length]);
        }
        cursor += length;
        if marker == 0xDA {
            output.extend_from_slice(&input[cursor..]);
            break;
        }
    }
    if output.len() <= 2 {
        return Err("no image data was found");
    }
    Ok(output)
}

fn strip_png(input: &[u8]) -> Result<Vec<u8>, &'static str> {
    const SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if input.len() < 8 || &input[..8] != SIGNATURE {
        return Err("not a PNG stream");
    }
    let mut output = Vec::with_capacity(input.len());
    output.extend_from_slice(SIGNATURE);
    let mut cursor = 8usize;
    loop {
        if cursor + 12 > input.len() {
            return Err("the PNG ends inside a chunk header");
        }
        let length = u32::from_be_bytes([
            input[cursor],
            input[cursor + 1],
            input[cursor + 2],
            input[cursor + 3],
        ]) as usize;
        let total = 12usize
            .checked_add(length)
            .ok_or("a PNG chunk length overflowed")?;
        if cursor + total > input.len() {
            return Err("a PNG chunk declares a bad length");
        }
        let kind = &input[cursor + 4..cursor + 8];
        let keep = matches!(
            kind,
            b"IHDR"
                | b"PLTE"
                | b"IDAT"
                | b"IEND"
                | b"tRNS"
                | b"gAMA"
                | b"cHRM"
                | b"sRGB"
                | b"sBIT"
                | b"bKGD"
                | b"hIST"
                | b"cICP"
                | b"mDCv"
                | b"cLLi"
        );
        if keep {
            output.extend_from_slice(&input[cursor..cursor + total]);
        }
        cursor += total;
        if kind == b"IEND" {
            break;
        }
    }
    Ok(output)
}

struct WebpChunk<'a> {
    kind: &'a [u8],
    raw: &'a [u8],
    payload: &'a [u8],
}

fn webp_chunks(input: &[u8]) -> Result<Vec<WebpChunk<'_>>, &'static str> {
    if input.len() < 12 || &input[..4] != b"RIFF" || &input[8..12] != b"WEBP" {
        return Err("not a WebP stream");
    }
    let declared = u32::from_le_bytes([input[4], input[5], input[6], input[7]]) as usize;
    let end = (8 + declared).min(input.len());
    let mut chunks = Vec::new();
    let mut cursor = 12usize;
    while cursor + 8 <= end {
        let kind = &input[cursor..cursor + 4];
        let length = u32::from_le_bytes([
            input[cursor + 4],
            input[cursor + 5],
            input[cursor + 6],
            input[cursor + 7],
        ]) as usize;
        let padded = length + (length & 1);
        if cursor + 8 + padded > end {
            return Err("a WebP chunk declares a bad length");
        }
        chunks.push(WebpChunk {
            kind,
            raw: &input[cursor..cursor + 8 + padded],
            payload: &input[cursor + 8..cursor + 8 + length],
        });
        cursor += 8 + padded;
    }
    if chunks.is_empty() {
        return Err("the WebP contains no chunks");
    }
    Ok(chunks)
}

fn strip_webp(input: &[u8]) -> Result<Vec<u8>, &'static str> {
    let chunks = webp_chunks(input)?;
    let mut body = Vec::with_capacity(input.len());
    for chunk in chunks {
        if matches!(chunk.kind, b"EXIF" | b"XMP " | b"ICCP") {
            continue;
        }
        if chunk.kind == b"VP8X" && !chunk.payload.is_empty() {
            let mut payload = chunk.payload.to_vec();
            // ICC (0x20), EXIF (0x08) and XMP (0x04) flags must match the chunks.
            payload[0] &= !0x2C;
            body.extend_from_slice(b"VP8X");
            body.extend_from_slice(&(payload.len() as u32).to_le_bytes());
            body.extend_from_slice(&payload);
            if payload.len() % 2 == 1 {
                body.push(0);
            }
            continue;
        }
        body.extend_from_slice(chunk.raw);
    }
    let riff_size = 4u32
        .checked_add(body.len() as u32)
        .ok_or("the WebP became too large")?;
    let mut output = Vec::with_capacity(body.len() + 12);
    output.extend_from_slice(b"RIFF");
    output.extend_from_slice(&riff_size.to_le_bytes());
    output.extend_from_slice(b"WEBP");
    output.extend_from_slice(&body);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("uc-tools-image-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch");
        dir
    }

    fn png(path: &Path, color: [u8; 4]) {
        let image = RgbaImage::from_pixel(24, 16, image::Rgba(color));
        image.save(path).expect("png");
    }

    #[test]
    fn image_info_reads_dimensions_and_alpha() {
        let dir = scratch("info");
        let file = dir.join("tile.png");
        png(&file, [10, 20, 30, 255]);
        let info = image_info(&file).expect("info");
        assert_eq!((info.width, info.height), (24, 16));
        assert_eq!(info.format, FormatId::Png);
        assert!(info.has_alpha);
        assert_eq!(info.bits_per_pixel, 32);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn comparison_counts_changed_pixels() {
        let dir = scratch("compare");
        let first = dir.join("a.png");
        let second = dir.join("b.png");
        png(&first, [0, 0, 0, 255]);
        png(&second, [0, 0, 0, 255]);
        let same = compare_images(&first, &second).expect("same");
        assert!(same.identical);
        assert_eq!(same.different_pixels, 0);
        assert!(same.preview_data_url.starts_with("data:image/png;base64,"));

        let mut changed = image::open(&second).expect("open").to_rgba8();
        changed.put_pixel(0, 0, image::Rgba([255, 0, 0, 255]));
        changed.save(&second).expect("save");
        let result = compare_images(&first, &second).expect("different");
        assert!(!result.identical);
        assert_eq!(result.different_pixels, 1);
        assert!(result.difference_percent > 0.0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn png_metadata_is_stripped_and_verified() {
        let dir = scratch("strip-png");
        let input = dir.join("input.png");
        let output = dir.join("clean.png");
        let image = RgbaImage::from_pixel(8, 8, image::Rgba([9, 9, 9, 255]));
        image.save(&input).expect("png");
        let mut bytes = std::fs::read(&input).expect("read");
        let text_chunk = {
            let mut data = b"Comment\0image metadata".to_vec();
            let kind = b"tEXt";
            let length = (data.len() as u32).to_be_bytes();
            let mut chunk = Vec::new();
            chunk.extend_from_slice(&length);
            chunk.extend_from_slice(kind);
            chunk.append(&mut data);
            let crc = png_crc(&chunk[4..]);
            chunk.extend_from_slice(&crc.to_be_bytes());
            chunk
        };
        let insert = 8 + 25;
        bytes.splice(insert..insert, text_chunk);
        std::fs::write(&input, &bytes).expect("insert text");
        assert!(metadata_markers(&bytes, FormatId::Png).contains(&"Text comment".to_owned()));

        let result = strip_image_metadata(&input, &output, false).expect("strip");
        assert!(result.verified);
        assert!(result.removed.contains(&"Text comment".to_owned()));
        let clean = std::fs::read(&output).expect("read output");
        assert!(metadata_markers(&clean, FormatId::Png).is_empty());
        image::load_from_memory_with_format(&clean, image::ImageFormat::Png).expect("valid png");
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn png_crc(bytes: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for byte in bytes {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                let mask = (crc & 1).wrapping_neg();
                crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
            }
        }
        !crc
    }

    #[test]
    fn stripping_refuses_to_touch_the_original() {
        let dir = scratch("original");
        let file = dir.join("photo.png");
        png(&file, [1, 2, 3, 255]);
        let error = strip_image_metadata(&file, &file, true).expect_err("must refuse");
        assert!(error.to_string().contains("replace the original"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
