use super::{
    ConversionEngine, EngineContext, EngineId, EngineInfo, checked_cancel, parse_settings, sidecar,
    unreadable,
};
use crate::core::format::FormatId;
use crate::error::ConversionError;
use crate::utils::limits;
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

/// Sidecar conversions get a generous but bounded window.
const SIDECAR_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResizeMode {
    None,
    Contain,
    Cover,
    Width,
    Height,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum CropMode {
    #[default]
    None,
    Center,
    Manual,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum WatermarkPosition {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    #[default]
    Center,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ImageOptions {
    pub quality: u8,
    pub resize_mode: ResizeMode,
    pub width: u32,
    pub height: u32,
    pub rotation: u16,
    pub flip_horizontal: bool,
    pub flip_vertical: bool,
    pub strip_metadata: bool,
    pub flatten_background: String,
    pub tiff_compression: String,
    /// Crop happens after rotation and before resize, so the rectangle refers
    /// to the image the user sees after turning it upright.
    pub crop_mode: CropMode,
    pub crop_width: u32,
    pub crop_height: u32,
    pub crop_x: u32,
    pub crop_y: u32,
    pub watermark_text: String,
    pub watermark_position: WatermarkPosition,
    /// 0–100; 100 is fully opaque.
    pub watermark_opacity: u8,
    /// Cap height as a percentage of the image's shorter side.
    pub watermark_size: u8,
    pub watermark_color: String,
}

impl Default for ImageOptions {
    fn default() -> Self {
        ImageOptions {
            quality: 90,
            resize_mode: ResizeMode::None,
            width: 1920,
            height: 1080,
            rotation: 0,
            flip_horizontal: false,
            flip_vertical: false,
            strip_metadata: false,
            flatten_background: "#ffffff".to_owned(),
            tiff_compression: "lzw".to_owned(),
            crop_mode: CropMode::None,
            crop_width: 1024,
            crop_height: 1024,
            crop_x: 0,
            crop_y: 0,
            watermark_text: String::new(),
            watermark_position: WatermarkPosition::Center,
            watermark_opacity: 35,
            watermark_size: 8,
            watermark_color: "#ffffff".to_owned(),
        }
    }
}

fn parse_hex_color(input: &str) -> [u8; 3] {
    let cleaned = input.trim().trim_start_matches('#');
    let pair = |chars: &str| u8::from_str_radix(chars, 16).ok();

    if cleaned.len() == 6
        && let (Some(r), Some(g), Some(b)) = (
            pair(&cleaned[0..2]),
            pair(&cleaned[2..4]),
            pair(&cleaned[4..6]),
        )
    {
        return [r, g, b];
    }
    if cleaned.len() == 3 {
        let expand = |c: char| format!("{c}{c}");
        let mut chars = cleaned.chars();
        if let (Some(Some(r)), Some(Some(g)), Some(Some(b))) = (
            chars.next().map(|c| pair(&expand(c))),
            chars.next().map(|c| pair(&expand(c))),
            chars.next().map(|c| pair(&expand(c))),
        ) {
            return [r, g, b];
        }
    }
    [255, 255, 255]
}

pub(crate) fn image_format(format: FormatId) -> Option<ImageFormat> {
    Some(match format {
        FormatId::Jpeg => ImageFormat::Jpeg,
        FormatId::Png => ImageFormat::Png,
        FormatId::Webp => ImageFormat::WebP,
        FormatId::Bmp => ImageFormat::Bmp,
        FormatId::Tiff => ImageFormat::Tiff,
        FormatId::Gif => ImageFormat::Gif,
        FormatId::Ico => ImageFormat::Ico,
        _ => return None,
    })
}

/// Targets that physically cannot carry an alpha channel.
fn needs_flatten(format: FormatId) -> bool {
    matches!(format, FormatId::Jpeg | FormatId::Bmp | FormatId::Gif)
}

fn decode(input: &Path) -> Result<DynamicImage, ConversionError> {
    let reader = image::ImageReader::open(input).map_err(|error| unreadable(input, error))?;
    reader
        // Magic bytes pick the decoder, matching what core::format already found,
        // so a mislabelled file still decodes correctly.
        .with_guessed_format()
        .map_err(|error| unreadable(input, error))?
        .decode()
        .map_err(|_| ConversionError::Corrupt {
            path: input.display().to_string(),
        })
}

/// Aspect-preserving dimension for one fixed edge.
fn scale_against(source: u32, target: u32, against: u32) -> u32 {
    if source == 0 {
        return against.max(1);
    }
    (((against as f64) * (target as f64) / (source as f64)).round() as u32).max(1)
}

fn apply_geometry(
    image: DynamicImage,
    options: &ImageOptions,
) -> Result<DynamicImage, ConversionError> {
    let mut image = image;

    match options.rotation {
        0 => {}
        90 => image = image.rotate90(),
        180 => image = image.rotate180(),
        270 => image = image.rotate270(),
        other => {
            return Err(ConversionError::Other(format!(
                "rotation must be 0, 90, 180 or 270 degrees, got {other}"
            )));
        }
    }
    if options.flip_horizontal {
        image = image.fliph();
    }
    if options.flip_vertical {
        image = image.flipv();
    }

    image = crop(image, options)?;

    let filter = image::imageops::FilterType::Lanczos3;
    let width = options.width.max(1);
    let height = options.height.max(1);

    let image = match options.resize_mode {
        ResizeMode::None => image,
        // `resize` fits inside the box; `resize_to_fill` fills it by cropping.
        ResizeMode::Contain => image.resize(width, height, filter),
        ResizeMode::Cover => image.resize_to_fill(width, height, filter),
        ResizeMode::Width => {
            let new_height = scale_against(image.width(), width, image.height());
            image.resize_exact(width, new_height, filter)
        }
        ResizeMode::Height => {
            let new_width = scale_against(image.height(), height, image.width());
            image.resize_exact(new_width, height, filter)
        }
    };

    if (image.width() as u64) * (image.height() as u64) > limits::MAX_IMAGE_PIXELS {
        return Err(ConversionError::PixelLimit {
            pixels: (image.width() as u64 * image.height() as u64) / 1_000_000,
            limit: limits::MAX_IMAGE_PIXELS / 1_000_000,
        });
    }

    Ok(image)
}

fn crop(image: DynamicImage, options: &ImageOptions) -> Result<DynamicImage, ConversionError> {
    if options.crop_mode == CropMode::None {
        return Ok(image);
    }
    if options.crop_width == 0 || options.crop_height == 0 {
        return Err(ConversionError::Other(
            "crop width and height must be at least one pixel".to_owned(),
        ));
    }

    let (x, y, width, height) = match options.crop_mode {
        CropMode::Center => {
            let width = options.crop_width.min(image.width());
            let height = options.crop_height.min(image.height());
            (
                (image.width() - width) / 2,
                (image.height() - height) / 2,
                width,
                height,
            )
        }
        CropMode::Manual => {
            let right = options.crop_x.saturating_add(options.crop_width);
            let bottom = options.crop_y.saturating_add(options.crop_height);
            if right > image.width() || bottom > image.height() {
                return Err(ConversionError::Other(format!(
                    "crop {}x{} at ({}, {}) does not fit inside a {}x{} image",
                    options.crop_width,
                    options.crop_height,
                    options.crop_x,
                    options.crop_y,
                    image.width(),
                    image.height()
                )));
            }
            (
                options.crop_x,
                options.crop_y,
                options.crop_width,
                options.crop_height,
            )
        }
        CropMode::None => unreachable!(),
    };

    Ok(image.crop_imm(x, y, width, height))
}

/// Standard Windows fonts, in preference order. Rendering a watermark needs a
/// font file; shipping one would add a licence for no user-visible benefit.
fn watermark_font() -> Option<&'static [u8]> {
    static FONT: OnceLock<Option<Vec<u8>>> = OnceLock::new();
    FONT.get_or_init(|| {
        const CANDIDATES: [&str; 5] = [
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\verdana.ttf",
            r"C:\Windows\Fonts\tahoma.ttf",
            r"C:\Windows\Fonts\calibri.ttf",
        ];
        CANDIDATES.iter().find_map(|path| std::fs::read(path).ok())
    })
    .as_deref()
}

/// Composites text onto the pixels. Alpha is preserved: on a transparent PNG
/// the letters get alpha instead of a flat rectangle, so flattening for JPEG
/// still blends against the background colour.
fn draw_watermark(
    image: DynamicImage,
    options: &ImageOptions,
) -> Result<DynamicImage, ConversionError> {
    use ab_glyph::{Font as _, ScaleFont as _};

    let text = options.watermark_text.trim();
    let opacity = options.watermark_opacity.min(100) as f32 / 100.0;
    if text.is_empty() || opacity <= 0.0 {
        return Ok(image);
    }

    let bytes = watermark_font().ok_or_else(|| {
        ConversionError::Other(
            "text watermarking needs a TrueType font, and none of the standard Windows fonts \
             (Segoe UI, Arial, Verdana, Tahoma, Calibri) could be read"
                .to_owned(),
        )
    })?;
    let font = ab_glyph::FontVec::try_from_vec(bytes.to_vec()).map_err(|error| {
        ConversionError::Other(format!("the watermark font is unusable: {error}"))
    })?;

    let mut pixels = image.to_rgba8();
    let shortest = pixels.width().min(pixels.height()) as f32;
    let size = (shortest * options.watermark_size.clamp(2, 30) as f32 / 100.0).max(8.0);
    let scaled = font.as_scaled(ab_glyph::PxScale::from(size));

    let mut text_width = 0.0_f32;
    for character in text.chars() {
        text_width += scaled.h_advance(scaled.scaled_glyph(character).id);
    }
    let text_height = scaled.ascent() - scaled.descent();
    if text_width <= 0.0 || text_height <= 0.0 {
        return Ok(image);
    }

    let padding = (shortest * 0.03).max(4.0);
    let max_x = pixels.width() as f32 - text_width - padding;
    let max_y = pixels.height() as f32 - text_height - padding;
    let (base_x, base_y) = match options.watermark_position {
        WatermarkPosition::TopLeft => (padding, padding),
        WatermarkPosition::TopRight => (max_x.max(padding), padding),
        WatermarkPosition::BottomLeft => (padding, max_y.max(padding)),
        WatermarkPosition::BottomRight => (max_x.max(padding), max_y.max(padding)),
        WatermarkPosition::Center => (
            ((pixels.width() as f32 - text_width) / 2.0).max(0.0),
            ((pixels.height() as f32 - text_height) / 2.0).max(0.0),
        ),
    };

    let color = parse_hex_color(&options.watermark_color);
    let baseline = base_y + scaled.ascent();
    let mut caret = base_x;
    for character in text.chars() {
        let glyph = scaled.scaled_glyph(character);
        let glyph_id = glyph.id;
        if let Some(outline) = scaled.outline_glyph(glyph) {
            let bounds = outline.px_bounds();
            outline.draw(|gx, gy, coverage| {
                let x = (caret + bounds.min.x) as i32 + gx as i32;
                let y = (baseline + bounds.min.y) as i32 + gy as i32;
                if x < 0 || y < 0 || x >= pixels.width() as i32 || y >= pixels.height() as i32 {
                    return;
                }
                let source = coverage * opacity;
                if source <= 0.0 {
                    return;
                }
                let pixel = pixels.get_pixel_mut(x as u32, y as u32);
                let destination = pixel[3] as f32 / 255.0;
                let alpha = source + destination * (1.0 - source);
                if alpha <= 0.0 {
                    return;
                }
                for channel in 0..3 {
                    let mixed = (color[channel] as f32 * source
                        + pixel[channel] as f32 * destination * (1.0 - source))
                        / alpha;
                    pixel[channel] = mixed.round().clamp(0.0, 255.0) as u8;
                }
                pixel[3] = (alpha * 255.0).round().clamp(0.0, 255.0) as u8;
            });
        }
        caret += scaled.h_advance(glyph_id);
    }

    Ok(DynamicImage::ImageRgba8(pixels))
}

fn flatten(image: DynamicImage, background: [u8; 3]) -> DynamicImage {
    if !image.color().has_alpha() {
        return image;
    }
    let rgba = image.to_rgba8();
    let mut output: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = pixel[3] as f32 / 255.0;
        let blend = |source: u8, backdrop: u8| {
            (source as f32 * alpha + backdrop as f32 * (1.0 - alpha)).round() as u8
        };
        output.put_pixel(
            x,
            y,
            Rgb([
                blend(pixel[0], background[0]),
                blend(pixel[1], background[1]),
                blend(pixel[2], background[2]),
            ]),
        );
    }
    DynamicImage::ImageRgb8(output)
}

/// Writes the encoded file.
///
/// The codecs compiled into the `image` crate cover JPEG quality and PNG
/// compression, but only **lossless** WebP — lossy WebP, AVIF and HEIC stay
/// ImageMagick routes, which is why the registry notes them as such.
pub(crate) fn encode_to(
    image: &DynamicImage,
    output: &Path,
    format: ImageFormat,
    quality: u8,
) -> Result<(), ConversionError> {
    use image::ImageEncoder;
    use image::codecs::jpeg::JpegEncoder;
    use image::codecs::png::{CompressionType, FilterType as PngFilter, PngEncoder};
    use image::codecs::webp::WebPEncoder;

    let encoding = |error: image::ImageError| ConversionError::Image(error.to_string());
    let quality = quality.clamp(1, 100);

    match format {
        ImageFormat::Jpeg => {
            let rgb = image.to_rgb8();
            let file = std::fs::File::create(output).map_err(|error| unreadable(output, error))?;
            JpegEncoder::new_with_quality(file, quality)
                .write_image(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(encoding)
        }
        ImageFormat::Png => {
            // PNG is lossless, so the slider chooses how hard to compress:
            // a high quality value means a smaller file, not better pixels.
            let compression = match quality {
                0..=49 => CompressionType::Fast,
                50..=84 => CompressionType::Default,
                _ => CompressionType::Best,
            };
            let rgba = image.to_rgba8();
            let file = std::fs::File::create(output).map_err(|error| unreadable(output, error))?;
            PngEncoder::new_with_quality(file, compression, PngFilter::Adaptive)
                .write_image(
                    rgba.as_raw(),
                    rgba.width(),
                    rgba.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(encoding)
        }
        ImageFormat::WebP => {
            let rgba = image.to_rgba8();
            let file = std::fs::File::create(output).map_err(|error| unreadable(output, error))?;
            WebPEncoder::new_lossless(file)
                .write_image(
                    rgba.as_raw(),
                    rgba.width(),
                    rgba.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(encoding)
        }
        // BMP, TIFF, GIF, ICO: no lossy knob in these codecs, write straight out.
        other => {
            let file = std::fs::File::create(output).map_err(|error| unreadable(output, error))?;
            image.write_to(file, other).map_err(encoding)
        }
    }
}

/// In-process raster conversion. JPG, PNG, BMP, TIFF, GIF and ICO all work on a
/// machine with nothing else installed; WebP is written losslessly (see encode_to).
pub struct ImageEngine;

impl ConversionEngine for ImageEngine {
    fn id(&self) -> EngineId {
        EngineId::Image
    }

    fn probe(&self) -> EngineInfo {
        EngineInfo {
            id: EngineId::Image,
            label: EngineId::Image.label().to_owned(),
            available: true,
            version: Some(format!("image {}", image_crate_version())),
            unavailable_reason: None,
        }
    }

    fn convert(&self, ctx: &EngineContext) -> Result<u64, ConversionError> {
        let options: ImageOptions = parse_settings(&ctx.job.settings, ImageOptions::default());
        let input = Path::new(&ctx.job.input_path);
        let output = Path::new(&ctx.job.output_path);

        checked_cancel(ctx.cancel)?;
        ctx.progress.report(0.05, "reading");

        let format =
            image_format(ctx.job.output_format).ok_or_else(|| ConversionError::Unsupported {
                input: ctx.job.input_format.label().to_owned(),
                output: ctx.job.output_format.label().to_owned(),
            })?;

        if let Ok((width, height)) = image::image_dimensions(input)
            && (width as u64) * (height as u64) > limits::MAX_IMAGE_PIXELS
        {
            return Err(ConversionError::PixelLimit {
                pixels: (width as u64 * height as u64) / 1_000_000,
                limit: limits::MAX_IMAGE_PIXELS / 1_000_000,
            });
        }

        let decoded = decode(input)?;
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(0.4, "transforming");

        let prepared = apply_geometry(decoded, &options)?;
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(0.55, "watermarking");
        let prepared = draw_watermark(prepared, &options)?;
        let prepared = if needs_flatten(ctx.job.output_format) {
            flatten(prepared, parse_hex_color(&options.flatten_background))
        } else {
            prepared
        };

        checked_cancel(ctx.cancel)?;
        ctx.progress.report(0.7, "encoding");

        limits::ensure_parent_dir(output)?;
        encode_to(&prepared, output, format, options.quality)?;

        ctx.progress.report(0.9, "validating");
        // The pipeline's "validate output" step: re-read the signature we just wrote.
        super::validate_output(output, ctx.job.output_format)
    }

    fn is_memory_heavy(&self) -> bool {
        false
    }
}

fn image_crate_version() -> &'static str {
    "0.25"
}

/// Extended-format raster conversion through the ImageMagick sidecar: AVIF,
/// HEIC and SVG, which the compiled-in Rust codecs do not cover.
pub struct ImageMagickEngine {
    program: Option<PathBuf>,
}

impl Default for ImageMagickEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl ImageMagickEngine {
    pub fn new() -> Self {
        ImageMagickEngine {
            program: sidecar::locate("UC_IMAGEMAGICK_PATH", "magick", "imagemagick"),
        }
    }

    fn build_args(
        job_input: &str,
        job_output: &str,
        options: &ImageOptions,
        output_format: FormatId,
    ) -> Vec<String> {
        let mut args: Vec<String> = vec![
            // Resource ceilings, per ImageMagick's own security guidance.
            "-limit".to_owned(),
            "area".to_owned(),
            "256MP".to_owned(),
            "-limit".to_owned(),
            "memory".to_owned(),
            "1GiB".to_owned(),
            "-limit".to_owned(),
            "disk".to_owned(),
            "2GiB".to_owned(),
            job_input.to_owned(),
        ];

        if options.strip_metadata {
            args.push("+profile".to_owned());
            args.push("*".to_owned());
        }
        if options.rotation != 0 {
            args.extend(["-rotate".to_owned(), options.rotation.to_string()]);
        }
        if options.flip_horizontal {
            args.push("-flop".to_owned());
        }
        if options.flip_vertical {
            args.push("-flip".to_owned());
        }
        match options.crop_mode {
            CropMode::None => {}
            CropMode::Center => {
                if options.crop_width > 0 && options.crop_height > 0 {
                    args.extend([
                        "-gravity".to_owned(),
                        "center".to_owned(),
                        "-crop".to_owned(),
                        format!("{}x{}+0+0", options.crop_width, options.crop_height),
                        "+repage".to_owned(),
                    ]);
                }
            }
            CropMode::Manual => {
                if options.crop_width == 0 || options.crop_height == 0 {
                    args.extend([
                        "-crop".to_owned(),
                        "1x1+0+0".to_owned(),
                        "+repage".to_owned(),
                    ]);
                } else {
                    args.extend([
                        "-crop".to_owned(),
                        format!(
                            "{}x{}+{}+{}",
                            options.crop_width, options.crop_height, options.crop_x, options.crop_y
                        ),
                        "+repage".to_owned(),
                    ]);
                }
            }
        }
        match options.resize_mode {
            ResizeMode::None => {}
            ResizeMode::Contain | ResizeMode::Width => {
                let spec = match options.resize_mode {
                    ResizeMode::Width => format!("{}x", options.width.max(1)),
                    _ => format!("{}x{}", options.width.max(1), options.height.max(1)),
                };
                args.extend(["-resize".to_owned(), spec]);
            }
            ResizeMode::Height => {
                args.extend(["-resize".to_owned(), format!("x{}", options.height.max(1))]);
            }
            ResizeMode::Cover => {
                args.extend([
                    "-resize".to_owned(),
                    format!("{}x{}^", options.width.max(1), options.height.max(1)),
                    "-gravity".to_owned(),
                    "center".to_owned(),
                    "-extent".to_owned(),
                    format!("{}x{}", options.width.max(1), options.height.max(1)),
                ]);
            }
        }
        if needs_flatten(output_format) {
            args.extend([
                "-background".to_owned(),
                options.flatten_background.clone(),
                "-flatten".to_owned(),
            ]);
        }
        if !options.watermark_text.trim().is_empty() && options.watermark_opacity > 0 {
            let gravity = match options.watermark_position {
                WatermarkPosition::TopLeft => "NorthWest",
                WatermarkPosition::TopRight => "NorthEast",
                WatermarkPosition::BottomLeft => "SouthWest",
                WatermarkPosition::BottomRight => "SouthEast",
                WatermarkPosition::Center => "Center",
            };
            let [r, g, b] = parse_hex_color(&options.watermark_color);
            args.extend([
                "-gravity".to_owned(),
                gravity.to_owned(),
                // Points are absolute; the Rust engine sizes relative to the
                // image. Extended formats can only be reached through this
                // optional sidecar, so the size is a documented approximation.
                "-pointsize".to_owned(),
                (options.watermark_size.max(2) as u32 * 6).to_string(),
                "-fill".to_owned(),
                format!(
                    "rgba({r},{g},{b},{:.2})",
                    options.watermark_opacity.min(100) as f32 / 100.0
                ),
                "-annotate".to_owned(),
                "+0+0".to_owned(),
                options.watermark_text.trim().to_owned(),
            ]);
        }
        args.extend(["-quality".to_owned(), options.quality.to_string()]);
        args.push(job_output.to_owned());
        args
    }
}

impl ConversionEngine for ImageMagickEngine {
    fn id(&self) -> EngineId {
        EngineId::Imagemagick
    }

    fn probe(&self) -> EngineInfo {
        match &self.program {
            Some(program) => {
                let version =
                    sidecar::run_capturing(program, &["-version"], 200, Duration::from_secs(10))
                        .ok()
                        .and_then(|text| text.lines().next().map(str::to_owned));
                EngineInfo {
                    id: EngineId::Imagemagick,
                    label: EngineId::Imagemagick.label().to_owned(),
                    available: true,
                    version,
                    unavailable_reason: None,
                }
            }
            None => EngineInfo {
                id: EngineId::Imagemagick,
                label: EngineId::Imagemagick.label().to_owned(),
                available: false,
                version: None,
                unavailable_reason: Some(
                    "magick was not found. Install ImageMagick, add it to PATH, or set \
                     UC_IMAGEMAGICK_PATH to its full path."
                        .to_owned(),
                ),
            },
        }
    }

    fn convert(&self, ctx: &EngineContext) -> Result<u64, ConversionError> {
        let Some(program) = &self.program else {
            return Err(self.probe().unavailable_error());
        };
        let options: ImageOptions = parse_settings(&ctx.job.settings, ImageOptions::default());
        checked_cancel(ctx.cancel)?;
        ctx.progress.report(0.1, "starting ImageMagick");

        let args = ImageMagickEngine::build_args(
            &ctx.job.input_path,
            &ctx.job.output_path,
            &options,
            ctx.job.output_format,
        );
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();

        let mut sidecar = sidecar::Sidecar::start(program, &refs)?;
        sidecar.wait(ctx.cancel, SIDECAR_TIMEOUT)?;

        limits::ensure_parent_dir(Path::new(&ctx.job.output_path))?;
        let metadata = std::fs::metadata(&ctx.job.output_path).map_err(|_| {
            ConversionError::InvalidOutput {
                path: ctx.job.output_path.clone(),
            }
        })?;
        Ok(metadata.len())
    }

    fn is_memory_heavy(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::format;
    use crate::engines::CancellationToken;

    #[test]
    fn parses_full_hex() {
        assert_eq!(parse_hex_color("#ff8800"), [255, 136, 0]);
    }

    #[test]
    fn parses_short_hex() {
        assert_eq!(parse_hex_color("#f80"), [255, 136, 0]);
    }

    #[test]
    fn bad_color_falls_back_to_white() {
        assert_eq!(parse_hex_color("nonsense"), [255, 255, 255]);
        assert_eq!(parse_hex_color(""), [255, 255, 255]);
        assert_eq!(parse_hex_color("#12345"), [255, 255, 255]);
    }

    #[test]
    fn flatten_composites_alpha_over_background() {
        let mut buffer: ImageBuffer<image::Rgba<u8>, Vec<u8>> = ImageBuffer::new(2, 1);
        buffer.put_pixel(0, 0, image::Rgba([0, 0, 0, 0]));
        buffer.put_pixel(1, 0, image::Rgba([0, 0, 0, 255]));
        let flat = flatten(DynamicImage::ImageRgba8(buffer), [255, 255, 255]).to_rgb8();
        assert_eq!(flat.get_pixel(0, 0).0, [255, 255, 255]);
        assert_eq!(flat.get_pixel(1, 0).0, [0, 0, 0]);
    }

    #[test]
    fn width_scale_keeps_aspect() {
        assert_eq!(scale_against(2000, 1000, 1000), 500);
        assert_eq!(scale_against(0, 1000, 500), 500);
    }

    #[test]
    fn only_alpha_less_targets_need_flattening() {
        assert!(needs_flatten(FormatId::Jpeg));
        assert!(needs_flatten(FormatId::Bmp));
        assert!(needs_flatten(FormatId::Gif));
        assert!(!needs_flatten(FormatId::Png));
        assert!(!needs_flatten(FormatId::Webp));
    }

    #[test]
    fn only_raster_targets_reach_the_rust_engine() {
        assert!(image_format(FormatId::Png).is_some());
        assert!(image_format(FormatId::Avif).is_none());
        assert!(image_format(FormatId::Pdf).is_none());
    }

    #[test]
    fn invalid_rotation_is_rejected() {
        let options = ImageOptions {
            rotation: 45,
            ..ImageOptions::default()
        };
        let error = apply_geometry(DynamicImage::new_rgb8(2, 2), &options)
            .expect_err("45 degrees is not supported");
        assert!(error.to_string().contains("rotation"), "{error}");
    }

    #[test]
    fn geometry_actually_resizes() {
        let options = ImageOptions {
            resize_mode: ResizeMode::Width,
            width: 10,
            height: 10,
            ..ImageOptions::default()
        };
        let resized = apply_geometry(DynamicImage::new_rgb8(100, 50), &options).unwrap();
        assert_eq!((resized.width(), resized.height()), (10, 5));
    }

    #[test]
    fn cover_crop_hits_exact_target() {
        let options = ImageOptions {
            resize_mode: ResizeMode::Cover,
            width: 32,
            height: 32,
            ..ImageOptions::default()
        };
        let resized = apply_geometry(DynamicImage::new_rgb8(100, 50), &options).unwrap();
        assert_eq!((resized.width(), resized.height()), (32, 32));
    }

    #[test]
    fn center_crop_keeps_the_requested_rectangle() {
        let mut buffer: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(100, 60);
        for (x, y, pixel) in buffer.enumerate_pixels_mut() {
            *pixel = Rgb([x as u8, y as u8, 7]);
        }
        let options = ImageOptions {
            crop_mode: CropMode::Center,
            crop_width: 40,
            crop_height: 30,
            ..ImageOptions::default()
        };
        let cropped = apply_geometry(DynamicImage::ImageRgb8(buffer), &options).unwrap();
        assert_eq!((cropped.width(), cropped.height()), (40, 30));
        let rgb = cropped.to_rgb8();
        assert_eq!(rgb.get_pixel(0, 0).0, [30, 15, 7]);
    }

    #[test]
    fn a_manual_crop_outside_the_image_is_refused() {
        let options = ImageOptions {
            crop_mode: CropMode::Manual,
            crop_width: 80,
            crop_height: 40,
            crop_x: 30,
            crop_y: 0,
            ..ImageOptions::default()
        };
        let error = apply_geometry(DynamicImage::new_rgb8(100, 40), &options)
            .expect_err("the rectangle does not fit");
        assert!(error.to_string().contains("does not fit"), "{error}");
    }

    #[test]
    fn a_watermark_darkens_its_letters_and_leaves_the_corner_alone() {
        let options = ImageOptions {
            watermark_text: "TEST".to_owned(),
            watermark_position: WatermarkPosition::Center,
            watermark_opacity: 100,
            watermark_size: 30,
            watermark_color: "#000000".to_owned(),
            ..ImageOptions::default()
        };
        let white =
            DynamicImage::ImageRgb8(ImageBuffer::from_pixel(400, 200, Rgb([255, 255, 255])));
        let marked = draw_watermark(white, &options).unwrap();
        assert_eq!((marked.width(), marked.height()), (400, 200));
        let rgba = marked.to_rgba8();
        assert_eq!(rgba.get_pixel(0, 0).0, [255, 255, 255, 255]);
        assert!(
            rgba.pixels().any(|pixel| pixel[0] < 200),
            "at least one letter pixel must be blended in"
        );
    }

    #[test]
    fn a_watermark_on_transparency_adds_alpha_instead_of_a_box() {
        let options = ImageOptions {
            watermark_text: "A".to_owned(),
            watermark_opacity: 80,
            watermark_size: 40,
            watermark_color: "#ffffff".to_owned(),
            ..ImageOptions::default()
        };
        let transparent = DynamicImage::ImageRgba8(ImageBuffer::new(200, 100));
        let marked = draw_watermark(transparent, &options).unwrap().to_rgba8();
        assert_eq!(marked.get_pixel(0, 0).0[3], 0, "the corner stays clear");
        assert!(
            marked.pixels().any(|pixel| pixel[3] > 0),
            "the glyph must carry alpha"
        );
    }

    #[test]
    fn an_empty_watermark_is_a_no_op() {
        let options = ImageOptions {
            watermark_text: "   ".to_owned(),
            ..ImageOptions::default()
        };
        let image = DynamicImage::new_rgb8(20, 10);
        let unchanged = draw_watermark(image, &options).unwrap();
        assert_eq!((unchanged.width(), unchanged.height()), (20, 10));
    }

    #[test]
    fn imagemagick_args_end_with_output_path() {
        let args = ImageMagickEngine::build_args(
            "C:\\data\\a png.jpg",
            "C:\\data\\Converted\\a png.avif",
            &ImageOptions::default(),
            FormatId::Avif,
        );
        assert_eq!(
            args.last().map(String::as_str),
            Some("C:\\data\\Converted\\a png.avif")
        );
        assert!(args.iter().any(|arg| arg == "C:\\data\\a png.jpg"));
        assert!(args.windows(2).any(|pair| pair == ["-limit", "memory"]));
    }

    /// End-to-end through the real codec: PNG in, JPEG out, signature verified.
    #[test]
    fn converts_png_to_jpeg_on_disk() {
        use crate::core::job::ConversionJob;
        use crate::engines::{EngineContext, NullProgress};

        let dir = std::env::temp_dir().join("uc-image-engine-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let source = dir.join("source.png");
        let mut buffer: ImageBuffer<image::Rgba<u8>, Vec<u8>> = ImageBuffer::new(8, 4);
        for pixel in buffer.pixels_mut() {
            *pixel = image::Rgba([10, 200, 40, 128]);
        }
        DynamicImage::ImageRgba8(buffer).save(&source).unwrap();

        let output = dir.join("out.jpg");
        let job = ConversionJob {
            id: "test".to_owned(),
            input_path: source.display().to_string(),
            input_name: "source.png".to_owned(),
            inputs: vec![source.display().to_string()],
            input_format: FormatId::Png,
            output_format: FormatId::Jpeg,
            engine: EngineId::Image,
            output_path: output.display().to_string(),
            settings: serde_json::json!({ "quality": 80 }),
            progress: 0.0,
            status: crate::core::job::JobStatus::Processing,
            error: None,
            error_kind: None,
            created_at_ms: 0,
            started_at_ms: None,
            finished_at_ms: None,
            input_bytes: 0,
            output_bytes: None,
            operation: crate::core::job::JobOperation::Convert,
            selected_entries: Vec::new(),
        };

        let cancel = CancellationToken::new();
        let sink = NullProgress;
        let settings = crate::core::settings::AppSettings::default();
        let context = EngineContext {
            job: &job,
            temp_dir: &dir,
            progress: &sink,
            cancel: &cancel,
            settings: &settings,
            secret: None,
        };
        let written = ImageEngine
            .convert(&context)
            .expect("conversion should succeed");
        assert!(written > 0);
        assert_eq!(format::detect_from_path(&output), FormatId::Jpeg);
        assert_eq!(image::image_dimensions(&output).unwrap(), (8, 4));
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Crop and watermark are applied in one real encode, and the output is
    /// re-opened to prove both reached disk.
    #[test]
    fn a_cropped_watermarked_png_reaches_disk() {
        use crate::core::job::ConversionJob;
        use crate::engines::{EngineContext, NullProgress};

        let dir = std::env::temp_dir().join(format!("uc-image-advanced-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.png");
        let white =
            DynamicImage::ImageRgb8(ImageBuffer::from_pixel(200, 100, Rgb([255, 255, 255])));
        white.save(&source).unwrap();
        let output = dir.join("out.png");

        let job = ConversionJob {
            id: "advanced".to_owned(),
            input_path: source.display().to_string(),
            input_name: "source.png".to_owned(),
            inputs: vec![source.display().to_string()],
            input_format: FormatId::Png,
            output_format: FormatId::Png,
            engine: EngineId::Image,
            output_path: output.display().to_string(),
            settings: serde_json::json!({
                "cropMode": "manual",
                "cropWidth": 100,
                "cropHeight": 100,
                "cropX": 50,
                "cropY": 0,
                "watermarkText": "X",
                "watermarkOpacity": 100,
                "watermarkSize": 40,
                "watermarkColor": "#000000"
            }),
            progress: 0.0,
            status: crate::core::job::JobStatus::Processing,
            error: None,
            error_kind: None,
            created_at_ms: 0,
            started_at_ms: None,
            finished_at_ms: None,
            input_bytes: 0,
            output_bytes: None,
            operation: crate::core::job::JobOperation::Convert,
            selected_entries: Vec::new(),
        };
        let cancel = CancellationToken::new();
        let sink = NullProgress;
        let settings = crate::core::settings::AppSettings::default();
        let written = ImageEngine
            .convert(&EngineContext {
                job: &job,
                temp_dir: &dir,
                progress: &sink,
                cancel: &cancel,
                settings: &settings,
                secret: None,
            })
            .expect("conversion succeeds");
        assert!(written > 0);
        assert_eq!(image::image_dimensions(&output).unwrap(), (100, 100));
        let decoded = image::open(&output).unwrap().to_rgb8();
        assert!(
            decoded.pixels().any(|pixel| pixel[0] < 128),
            "the watermark must survive the encode"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cancellation_stops_before_decoding() {
        use crate::core::job::ConversionJob;
        use crate::engines::{EngineContext, NullProgress};

        let dir = std::env::temp_dir();
        let job = ConversionJob {
            id: "cancelled".to_owned(),
            input_path: dir.join("does-not-matter.png").display().to_string(),
            input_name: "does-not-matter.png".to_owned(),
            inputs: vec![dir.join("does-not-matter.png").display().to_string()],
            input_format: FormatId::Png,
            output_format: FormatId::Png,
            engine: EngineId::Image,
            output_path: dir.join("never-written.png").display().to_string(),
            settings: serde_json::Value::Null,
            progress: 0.0,
            status: crate::core::job::JobStatus::Processing,
            error: None,
            error_kind: None,
            created_at_ms: 0,
            started_at_ms: None,
            finished_at_ms: None,
            input_bytes: 0,
            output_bytes: None,
            operation: crate::core::job::JobOperation::Convert,
            selected_entries: Vec::new(),
        };

        let cancel = CancellationToken::new();
        cancel.cancel();
        let sink = NullProgress;
        let settings = crate::core::settings::AppSettings::default();
        let context = EngineContext {
            job: &job,
            temp_dir: &dir,
            progress: &sink,
            cancel: &cancel,
            settings: &settings,
            secret: None,
        };
        let error = ImageEngine
            .convert(&context)
            .expect_err("a cancelled job must not run");
        assert!(matches!(error, ConversionError::Cancelled), "got {error}");
        assert!(
            !dir.join("never-written.png").exists(),
            "cancellation must not leave a partial file"
        );
    }
}
