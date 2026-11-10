use super::image_tools;
use crate::core::format::{self, FormatCategory, FormatId};
use crate::engines::{archive, ffmpeg, pdf, sidecar};
use crate::error::ConversionError;
use exif::{In, Tag, Value};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::{BufReader, Read};
use std::path::Path;
use std::time::Duration;

const PROBE_TIMEOUT: Duration = Duration::from_secs(30);
const REWRITE_TIMEOUT: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MetadataKind {
    Image,
    Pdf,
    Document,
    Audio,
    Video,
    Archive,
    Text,
    Other,
}

impl MetadataKind {
    fn from_category(category: FormatCategory) -> Self {
        match category {
            FormatCategory::Image => Self::Image,
            FormatCategory::Pdf => Self::Pdf,
            FormatCategory::Document => Self::Document,
            FormatCategory::Text => Self::Text,
            FormatCategory::Audio => Self::Audio,
            FormatCategory::Video => Self::Video,
            FormatCategory::Archive => Self::Archive,
            FormatCategory::Other => Self::Other,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataField {
    pub group: String,
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataDocument {
    pub path: String,
    pub name: String,
    pub kind: MetadataKind,
    pub format: FormatId,
    pub format_label: String,
    pub size_bytes: u64,
    pub modified_ms: Option<u64>,
    pub fields: Vec<MetadataField>,
    pub editable: bool,
    pub removable: bool,
    pub notes: Vec<String>,
}

fn field(group: &str, key: &str, value: impl Into<String>) -> MetadataField {
    MetadataField {
        group: group.to_owned(),
        key: key.to_owned(),
        value: value.into(),
    }
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0usize;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.2} {}", UNITS[unit])
    }
}

fn format_time(ms: u64) -> String {
    let seconds = ms / 1000;
    let days = (seconds / 86_400) as i64;
    let remainder = seconds % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC",
        remainder / 3600,
        (remainder % 3600) / 60,
        remainder % 60
    )
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_prime + 2) / 5 + 1) as u32;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    (year, month as u32, day)
}

fn ms(time: std::io::Result<std::time::SystemTime>) -> Option<u64> {
    time.ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|value| value.as_millis() as u64)
}

fn tidy_exif(value: String) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        trimmed[1..trimmed.len() - 1].to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn rational_values(value: &Value) -> Option<Vec<f64>> {
    match value {
        Value::Rational(values) if !values.is_empty() => Some(
            values
                .iter()
                .map(|rational| {
                    if rational.denom == 0 {
                        0.0
                    } else {
                        f64::from(rational.num) / f64::from(rational.denom)
                    }
                })
                .collect(),
        ),
        _ => None,
    }
}

fn gps_decimal(field: &exif::Field, negative_ref: bool) -> Option<f64> {
    let values = rational_values(&field.value)?;
    if values.len() < 3 {
        return None;
    }
    let degrees = values[0] + values[1] / 60.0 + values[2] / 3600.0;
    Some(if negative_ref { -degrees } else { degrees })
}

fn exif_fields(bytes: Option<&Path>) -> (Vec<MetadataField>, Option<String>) {
    let Some(path) = bytes else {
        return (Vec::new(), None);
    };
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) => return (Vec::new(), Some(format!("EXIF could not be read: {error}"))),
    };
    let mut reader = BufReader::new(file);
    let exif = match exif::Reader::new().read_from_container(&mut reader) {
        Ok(exif) => exif,
        Err(exif::Error::NotFound(_)) => return (Vec::new(), None),
        Err(error) => return (Vec::new(), Some(format!("EXIF could not be read: {error}"))),
    };

    let mut fields = Vec::new();
    let mut has_orientation = false;
    for entry in exif.fields() {
        let group = match entry.ifd_num {
            In::PRIMARY => "EXIF",
            _ => "EXIF (thumbnail)",
        };
        if entry.tag == Tag::Orientation {
            has_orientation = true;
        }
        fields.push(field(
            group,
            &entry.tag.to_string(),
            tidy_exif(entry.display_value().with_unit(&exif).to_string()),
        ));
    }

    let latitude = exif
        .get_field(Tag::GPSLatitude, In::PRIMARY)
        .and_then(|entry| {
            let south = exif
                .get_field(Tag::GPSLatitudeRef, In::PRIMARY)
                .map(|reference| tidy_exif(reference.display_value().to_string()))
                .is_some_and(|reference| reference.eq_ignore_ascii_case("S"));
            gps_decimal(entry, south)
        });
    let longitude = exif
        .get_field(Tag::GPSLongitude, In::PRIMARY)
        .and_then(|entry| {
            let west = exif
                .get_field(Tag::GPSLongitudeRef, In::PRIMARY)
                .map(|reference| tidy_exif(reference.display_value().to_string()))
                .is_some_and(|reference| reference.eq_ignore_ascii_case("W"));
            gps_decimal(entry, west)
        });
    if let Some(value) = latitude {
        fields.push(field("GPS", "Latitude", format!("{value:.7}")));
    }
    if let Some(value) = longitude {
        fields.push(field("GPS", "Longitude", format!("{value:.7}")));
    }
    if let Some(entry) = exif.get_field(Tag::GPSAltitude, In::PRIMARY)
        && let Some(values) = rational_values(&entry.value)
    {
        let below = exif
            .get_field(Tag::GPSAltitudeRef, In::PRIMARY)
            .map(|reference| tidy_exif(reference.display_value().to_string()) == "1")
            .unwrap_or(false);
        let value = if below { -values[0] } else { values[0] };
        fields.push(field("GPS", "Altitude", format!("{value:.1} m")));
    }
    if has_orientation {
        fields.push(field(
            "Image",
            "Orientation",
            "EXIF orientation is present; viewers may rotate the image",
        ));
    }
    (fields, None)
}

fn image_fields(
    path: &Path,
    format: FormatId,
    fields: &mut Vec<MetadataField>,
    notes: &mut Vec<String>,
) -> bool {
    let mut removable = matches!(format, FormatId::Jpeg | FormatId::Png | FormatId::Webp);
    match image_tools::image_info(path) {
        Ok(info) => {
            fields.push(field(
                "Image",
                "Dimensions",
                format!("{} × {} px", info.width, info.height),
            ));
            fields.push(field("Image", "Colour type", &info.color_type));
            fields.push(field(
                "Image",
                "Bits per pixel",
                info.bits_per_pixel.to_string(),
            ));
            fields.push(field(
                "Image",
                "Alpha channel",
                if info.has_alpha { "Yes" } else { "No" },
            ));
        }
        Err(error) => notes.push(format!("Image header could not be decoded: {error}")),
    }

    match image_tools::markers_in_file(path) {
        Ok(markers) => {
            if markers.is_empty() {
                fields.push(field("Embedded metadata", "Blocks", "None detected"));
            } else {
                for marker in markers {
                    fields.push(field("Embedded metadata", &marker, "Present"));
                }
            }
        }
        Err(error) => notes.push(format!("Metadata blocks could not be scanned: {error}")),
    }

    let (mut exif, exif_note) = exif_fields(Some(path));
    fields.append(&mut exif);
    if let Some(note) = exif_note {
        notes.push(note);
    }
    if !matches!(format, FormatId::Jpeg | FormatId::Png | FormatId::Webp) {
        removable = false;
        if !matches!(format, FormatId::Gif | FormatId::Bmp | FormatId::Ico) {
            notes.push(
                "Lossless metadata removal is offered for JPEG, PNG and WebP; this format is read-only here."
                    .to_owned(),
            );
        }
    }
    removable
}

fn pdf_fields(
    path: &Path,
    password: &str,
    fields: &mut Vec<MetadataField>,
) -> Result<(), ConversionError> {
    let info = pdf::inspect(path, password)?;
    fields.push(field("PDF", "Pages", info.page_count.to_string()));
    fields.push(field("PDF", "PDF version", &info.version));
    fields.push(field(
        "PDF",
        "Encryption",
        if info.encrypted { "Yes" } else { "No" },
    ));
    let entries = [
        ("Title", info.title),
        ("Author", info.author),
        ("Subject", info.subject),
        ("Keywords", info.keywords),
        ("Creator", info.creator),
        ("Producer", info.producer),
    ];
    let mut any = false;
    for (key, value) in entries {
        if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
            any = true;
            fields.push(field("PDF info", key, value));
        }
    }
    if !any {
        fields.push(field("PDF info", "Fields", "None set"));
    }
    Ok(())
}

fn probe_tags(
    path: &Path,
) -> Result<(ffmpeg::MediaInfo, BTreeMap<String, String>), ConversionError> {
    let tools = ffmpeg::tools()?;
    let info = ffmpeg::inspect(&tools, path)?;
    let target = path.display().to_string();
    let text = sidecar::run_capturing_full(
        &tools.ffprobe,
        &[
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &target,
        ],
        4 * 1024 * 1024,
        PROBE_TIMEOUT,
    )
    .map_err(|error| ConversionError::Unreadable {
        path: target.clone(),
        reason: error.to_string(),
    })?;
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|error| ConversionError::Unreadable {
            path: target.clone(),
            reason: format!("ffprobe returned unreadable metadata: {error}"),
        })?;
    let mut tags = BTreeMap::new();
    if let Some(object) = json.get("format").and_then(|value| value.get("tags"))
        && let Some(map) = object.as_object()
    {
        for (key, value) in map {
            if let Some(text) = value.as_str()
                && !text.trim().is_empty()
            {
                tags.insert(key.clone(), text.to_owned());
            }
        }
    }
    for (index, stream) in json
        .get("streams")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .enumerate()
    {
        if let Some(map) = stream.get("tags").and_then(|value| value.as_object()) {
            for (key, value) in map {
                if key.eq_ignore_ascii_case("language")
                    || key.eq_ignore_ascii_case("handler_name")
                    || key.eq_ignore_ascii_case("vendor_id")
                {
                    continue;
                }
                if let Some(text) = value.as_str()
                    && !text.trim().is_empty()
                {
                    tags.insert(format!("stream {index} {key}"), text.to_owned());
                }
            }
        }
    }
    Ok((info, tags))
}

fn media_fields(path: &Path, fields: &mut Vec<MetadataField>, notes: &mut Vec<String>) {
    match probe_tags(path) {
        Ok((info, tags)) => {
            fields.push(field("Media", "Container", &info.format_label));
            fields.push(field("Media", "Format", &info.format_name));
            if let Some(duration) = info.duration_ms {
                fields.push(field(
                    "Media",
                    "Duration",
                    format!("{} s", ffmpeg::format_seconds(duration)),
                ));
            }
            if let Some(bit_rate) = info.bit_rate {
                fields.push(field(
                    "Media",
                    "Bit rate",
                    format!("{} kb/s", bit_rate / 1000),
                ));
            }
            for stream in &info.streams {
                let group = format!("Stream {}", stream.index);
                fields.push(field(&group, "Type", &stream.kind));
                fields.push(field(&group, "Codec", &stream.codec));
                if let (Some(width), Some(height)) = (stream.width, stream.height) {
                    fields.push(field(&group, "Dimensions", format!("{width} × {height}")));
                }
                if let Some(rate) = stream.sample_rate {
                    fields.push(field(&group, "Sample rate", format!("{rate} Hz")));
                }
                if let Some(channels) = stream.channels {
                    fields.push(field(&group, "Channels", channels.to_string()));
                }
                if let Some(title) = stream.title.as_deref() {
                    fields.push(field(&group, "Title", title));
                }
                if let Some(language) = stream.language.as_deref() {
                    fields.push(field(&group, "Language", language));
                }
            }
            if tags.is_empty() {
                fields.push(field("Tags", "Fields", "None set"));
            } else {
                for (key, value) in tags {
                    fields.push(field("Tags", &key, value));
                }
            }
        }
        Err(error) => notes.push(format!(
            "Media tags could not be read; is FFmpeg available? {error}"
        )),
    }
}

fn unescape_xml(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn xml_value(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let value = unescape_xml(xml[start..end].trim());
    (!value.is_empty()).then_some(value)
}

fn zip_text(archive: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Option<String> {
    let mut entry = archive.by_name(name).ok()?;
    if entry.size() > 2 * 1024 * 1024 {
        return None;
    }
    let mut text = String::new();
    entry.read_to_string(&mut text).ok()?;
    Some(text)
}

fn document_fields(
    path: &Path,
    format: FormatId,
    fields: &mut Vec<MetadataField>,
    notes: &mut Vec<String>,
) {
    let supported = matches!(
        format,
        FormatId::Docx
            | FormatId::Xlsx
            | FormatId::Pptx
            | FormatId::Odt
            | FormatId::Ods
            | FormatId::Odp
    );
    if !supported {
        notes.push(
            "Binary Office and plain-text files have no readable package-level property table here; the Documents page converts them with LibreOffice."
                .to_owned(),
        );
        return;
    }
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) => {
            notes.push(format!("Document package could not be opened: {error}"));
            return;
        }
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(archive) => archive,
        Err(error) => {
            notes.push(format!("Document package could not be read: {error}"));
            return;
        }
    };
    let (core_name, property_map): (&str, &[(&str, &str)]) = match format {
        FormatId::Odt | FormatId::Ods | FormatId::Odp => (
            "meta.xml",
            &[
                ("dc:title", "Title"),
                ("dc:subject", "Subject"),
                ("dc:creator", "Author"),
                ("dc:description", "Description"),
                ("meta:initial-creator", "Initial creator"),
                ("meta:creation-date", "Created"),
                ("dc:date", "Modified"),
                ("meta:generator", "Generator"),
                ("meta:editing-cycles", "Editing cycles"),
            ],
        ),
        _ => (
            "docProps/core.xml",
            &[
                ("dc:title", "Title"),
                ("dc:subject", "Subject"),
                ("dc:creator", "Author"),
                ("cp:keywords", "Keywords"),
                ("dc:description", "Description"),
                ("cp:lastModifiedBy", "Last modified by"),
                ("cp:category", "Category"),
                ("cp:contentStatus", "Content status"),
                ("dcterms:created", "Created"),
                ("dcterms:modified", "Modified"),
            ],
        ),
    };
    let mut any = false;
    if let Some(xml) = zip_text(&mut archive, core_name) {
        for (tag, label) in property_map {
            if let Some(value) = xml_value(&xml, tag) {
                fields.push(field("Document properties", label, value));
                any = true;
            }
        }
    }
    if !matches!(format, FormatId::Odt | FormatId::Ods | FormatId::Odp)
        && let Some(xml) = zip_text(&mut archive, "docProps/app.xml")
    {
        for tag in [
            "Application",
            "AppVersion",
            "Company",
            "Pages",
            "Words",
            "Characters",
            "Paragraphs",
        ] {
            if let Some(value) = xml_value(&xml, tag) {
                fields.push(field("Application", tag, value));
                any = true;
            }
        }
    }
    if !any {
        fields.push(field(
            "Document properties",
            "Fields",
            "None set in the package",
        ));
    }
    notes.push(
        "Document properties are read directly from the package; edit them in the source application."
            .to_owned(),
    );
}

fn archive_fields(path: &Path, fields: &mut Vec<MetadataField>, notes: &mut Vec<String>) {
    match archive::inspect(path, None, PROBE_TIMEOUT) {
        Ok(listing) => {
            fields.push(field("Archive", "Format", listing.format.label()));
            fields.push(field(
                "Archive",
                "Encrypted",
                if listing.encrypted { "Yes" } else { "No" },
            ));
            fields.push(field(
                "Archive",
                "Entries",
                listing.entries.len().to_string(),
            ));
            fields.push(field(
                "Archive",
                "Folders",
                listing
                    .entries
                    .iter()
                    .filter(|entry| entry.is_directory)
                    .count()
                    .to_string(),
            ));
            fields.push(field(
                "Archive",
                "Uncompressed",
                format_bytes(listing.total_bytes),
            ));
            fields.push(field(
                "Archive",
                "Packed",
                format_bytes(listing.total_packed_bytes),
            ));
            if listing.has_links {
                fields.push(field("Archive", "Links", "Present"));
            }
        }
        Err(error) => notes.push(format!("Archive contents could not be listed: {error}")),
    }
}

pub fn read_metadata(path: &Path, password: &str) -> Result<MetadataDocument, ConversionError> {
    let metadata = std::fs::metadata(path).map_err(|error| ConversionError::Unreadable {
        path: path.display().to_string(),
        reason: error.to_string(),
    })?;
    if !metadata.is_file() {
        return Err(ConversionError::Other(format!(
            "{} is a folder; choose a file",
            path.display()
        )));
    }
    let format = format::detect_from_path(path);
    let kind = MetadataKind::from_category(format.category());
    let mut fields = vec![
        field(
            "File",
            "Name",
            path.file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.display().to_string()),
        ),
        field("File", "Format", format.label()),
        field("File", "Size", format_bytes(metadata.len())),
    ];
    if let Some(modified) = ms(metadata.modified()) {
        fields.push(field("File", "Modified", format_time(modified)));
    }
    if let Some(created) = ms(metadata.created()) {
        fields.push(field("File", "Created", format_time(created)));
    }
    let mut notes = Vec::new();
    let removable = match kind {
        MetadataKind::Image => image_fields(path, format, &mut fields, &mut notes),
        MetadataKind::Pdf => {
            pdf_fields(path, password, &mut fields)?;
            true
        }
        MetadataKind::Audio | MetadataKind::Video => {
            media_fields(path, &mut fields, &mut notes);
            true
        }
        MetadataKind::Document => {
            document_fields(path, format, &mut fields, &mut notes);
            false
        }
        MetadataKind::Archive => {
            archive_fields(path, &mut fields, &mut notes);
            false
        }
        MetadataKind::Text | MetadataKind::Other => {
            notes.push(
                "This format has no embedded metadata model here; file information is shown."
                    .to_owned(),
            );
            false
        }
    };
    Ok(MetadataDocument {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string()),
        kind,
        format,
        format_label: format.label().to_owned(),
        size_bytes: metadata.len(),
        modified_ms: ms(metadata.modified()),
        fields,
        editable: matches!(
            kind,
            MetadataKind::Pdf | MetadataKind::Audio | MetadataKind::Video
        ),
        removable,
        notes,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataDifference {
    pub group: String,
    pub key: String,
    pub left: Option<String>,
    pub right: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataComparison {
    pub left_path: String,
    pub right_path: String,
    pub left_kind: MetadataKind,
    pub right_kind: MetadataKind,
    pub differences: Vec<MetadataDifference>,
    pub identical: bool,
    pub left_field_count: usize,
    pub right_field_count: usize,
}

fn field_map(document: &MetadataDocument) -> BTreeMap<(String, String), String> {
    let mut map = BTreeMap::new();
    for entry in &document.fields {
        // File name, size and timestamps describe the container, not embedded
        // metadata; comparing two files should not fail on those alone.
        if entry.group == "File" {
            continue;
        }
        map.insert(
            (entry.group.clone(), entry.key.clone()),
            entry.value.clone(),
        );
    }
    map
}

pub fn compare_metadata(
    left: &Path,
    password_left: &str,
    right: &Path,
    password_right: &str,
) -> Result<MetadataComparison, ConversionError> {
    let left_doc = read_metadata(left, password_left)?;
    let right_doc = read_metadata(right, password_right)?;
    let left_map = field_map(&left_doc);
    let right_map = field_map(&right_doc);
    let mut differences = Vec::new();
    for ((group, key), value) in &left_map {
        match right_map.get(&(group.clone(), key.clone())) {
            Some(other) if other == value => {}
            Some(other) => differences.push(MetadataDifference {
                group: group.clone(),
                key: key.clone(),
                left: Some(value.clone()),
                right: Some(other.clone()),
            }),
            None => differences.push(MetadataDifference {
                group: group.clone(),
                key: key.clone(),
                left: Some(value.clone()),
                right: None,
            }),
        }
    }
    for ((group, key), value) in &right_map {
        if !left_map.contains_key(&(group.clone(), key.clone())) {
            differences.push(MetadataDifference {
                group: group.clone(),
                key: key.clone(),
                left: None,
                right: Some(value.clone()),
            });
        }
    }
    Ok(MetadataComparison {
        left_path: left.display().to_string(),
        right_path: right.display().to_string(),
        left_kind: left_doc.kind,
        right_kind: right_doc.kind,
        identical: differences.is_empty(),
        left_field_count: left_doc.fields.len(),
        right_field_count: right_doc.fields.len(),
        differences,
    })
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MetadataEditRequest {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
    pub description: Option<String>,
    pub copyright: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub date: Option<String>,
    pub comment: Option<String>,
    pub composer: Option<String>,
}

impl MetadataEditRequest {
    fn pdf_edit(&self) -> pdf::MetadataEdit {
        pdf::MetadataEdit {
            title: self.title.clone(),
            author: self.author.clone(),
            subject: self.subject.clone(),
            keywords: self.keywords.clone(),
            creator: self.creator.clone(),
        }
    }

    fn ignored_for_pdf(&self) -> Vec<String> {
        let mut ignored = Vec::new();
        for (name, value) in [
            ("description", &self.description),
            ("copyright", &self.copyright),
            ("artist", &self.artist),
            ("album", &self.album),
            ("albumArtist", &self.album_artist),
            ("genre", &self.genre),
            ("date", &self.date),
            ("comment", &self.comment),
            ("composer", &self.composer),
        ] {
            if value.is_some() {
                ignored.push(name.to_owned());
            }
        }
        ignored
    }

    fn media_tags(&self) -> (Vec<(String, String)>, Vec<String>) {
        let mut tags = Vec::new();
        let mut ignored = Vec::new();
        let artist = self.artist.clone().or_else(|| self.author.clone());
        for (key, value) in [
            ("title", &self.title),
            ("album", &self.album),
            ("album_artist", &self.album_artist),
            ("genre", &self.genre),
            ("date", &self.date),
            ("comment", &self.comment),
            ("copyright", &self.copyright),
            ("description", &self.description),
            ("composer", &self.composer),
        ] {
            if let Some(value) = value {
                tags.push((key.to_owned(), value.clone()));
            }
        }
        if let Some(value) = artist {
            tags.push(("artist".to_owned(), value));
        }
        for (name, value) in [
            ("subject", &self.subject),
            ("keywords", &self.keywords),
            ("creator", &self.creator),
        ] {
            if value.is_some() {
                ignored.push(name.to_owned());
            }
        }
        (tags, ignored)
    }

    fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.author.is_none()
            && self.subject.is_none()
            && self.keywords.is_none()
            && self.creator.is_none()
            && self.description.is_none()
            && self.copyright.is_none()
            && self.artist.is_none()
            && self.album.is_none()
            && self.album_artist.is_none()
            && self.genre.is_none()
            && self.date.is_none()
            && self.comment.is_none()
            && self.composer.is_none()
    }
}

fn prepare_output(input: &Path, output: &Path, overwrite: bool) -> Result<(), ConversionError> {
    let input_abs = std::fs::canonicalize(input).map_err(|error| ConversionError::Unreadable {
        path: input.display().to_string(),
        reason: error.to_string(),
    })?;
    let parent = output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(parent).map_err(|error| {
        ConversionError::Other(format!("could not create {}: {error}", parent.display()))
    })?;
    let parent_abs = std::fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
    let name = output
        .file_name()
        .ok_or_else(|| ConversionError::Other("choose an output file name".to_owned()))?;
    let output_abs = parent_abs.join(name);
    if input_abs == output_abs {
        return Err(ConversionError::Other(
            "the output would replace the original; choose a different file name".to_owned(),
        ));
    }
    if output.exists() && !overwrite {
        return Err(ConversionError::Other(format!(
            "{} already exists; confirm replacing it",
            output.display()
        )));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataWriteResult {
    pub output_path: String,
    pub kind: MetadataKind,
    pub format: FormatId,
    pub written: Vec<String>,
    pub ignored: Vec<String>,
    pub verified: bool,
    pub size_bytes: u64,
    pub note: String,
}

fn media_rewrite(
    input: &Path,
    output: &Path,
    tags: &[(String, String)],
    remove_all: bool,
) -> Result<u64, ConversionError> {
    let tools = ffmpeg::tools()?;
    let mut args: Vec<String> = vec![
        "-hide_banner".to_owned(),
        "-loglevel".to_owned(),
        "error".to_owned(),
        "-y".to_owned(),
        "-i".to_owned(),
        input.display().to_string(),
        "-map".to_owned(),
        "0".to_owned(),
        "-c".to_owned(),
        "copy".to_owned(),
    ];
    if remove_all {
        args.push("-map_metadata".to_owned());
        args.push("-1".to_owned());
    } else {
        args.push("-map_metadata".to_owned());
        args.push("0".to_owned());
        for (key, value) in tags {
            args.push("-metadata".to_owned());
            args.push(format!("{key}={value}"));
        }
    }
    args.push(output.display().to_string());
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    sidecar::capture(&tools.ffmpeg, &args_ref, 1024 * 1024, REWRITE_TIMEOUT)?;
    let format = format::detect_from_path(input);
    ffmpeg::validate_output(&tools, output, format)
}

fn tag_value<'a>(tags: &'a BTreeMap<String, String>, key: &str) -> Option<&'a str> {
    tags.iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(key))
        .map(|(_, value)| value.as_str())
}

fn verify_media_edit(output: &Path, tags: &[(String, String)]) -> Result<(), ConversionError> {
    let (_, actual) = probe_tags(output)?;
    for (key, expected) in tags {
        let actual = tag_value(&actual, key);
        let ok = if expected.is_empty() {
            actual.is_none_or(|value| value.trim().is_empty())
        } else {
            actual.is_some_and(|value| value.trim() == expected.trim())
        };
        if !ok {
            return Err(ConversionError::InvalidOutput {
                path: format!(
                    "{} (tag '{key}' did not verify; found {:?})",
                    output.display(),
                    actual
                ),
            });
        }
    }
    Ok(())
}

fn verify_media_clear(output: &Path) -> Result<(), ConversionError> {
    let (_, tags) = probe_tags(output)?;
    let ignored = [
        "encoder",
        "handler_name",
        "major_brand",
        "minor_version",
        "compatible_brands",
        "vendor_id",
    ];
    let remaining: Vec<String> = tags
        .keys()
        .filter(|key| {
            let lower = key.to_ascii_lowercase();
            !ignored.iter().any(|allowed| lower.contains(allowed)) && !lower.starts_with("stream ")
        })
        .cloned()
        .collect();
    if !remaining.is_empty() {
        return Err(ConversionError::InvalidOutput {
            path: format!(
                "{} still carries these tags: {}",
                output.display(),
                remaining.join(", ")
            ),
        });
    }
    Ok(())
}

pub fn edit_metadata(
    input: &Path,
    password: &str,
    output: &Path,
    edit: &MetadataEditRequest,
    overwrite: bool,
) -> Result<MetadataWriteResult, ConversionError> {
    if edit.is_empty() {
        return Err(ConversionError::Other(
            "fill in at least one metadata field first".to_owned(),
        ));
    }
    prepare_output(input, output, overwrite)?;
    let format = format::detect_from_path(input);
    let kind = MetadataKind::from_category(format.category());

    match kind {
        MetadataKind::Pdf => {
            let pdf_edit = edit.pdf_edit();
            if pdf_edit_is_empty(&pdf_edit) {
                return Err(ConversionError::Other(
                    "no PDF metadata fields were supplied; PDFs store Title, Author, Subject, Keywords and Creator"
                        .to_owned(),
                ));
            }
            pdf::rewrite_metadata(input, output, password, &pdf_edit, false)?;
            let written = pdf::inspect(output, "")?;
            let checks = [
                (&pdf_edit.title, pdf_edit_field(&written, "title")),
                (&pdf_edit.author, pdf_edit_field(&written, "author")),
                (&pdf_edit.subject, pdf_edit_field(&written, "subject")),
                (&pdf_edit.keywords, pdf_edit_field(&written, "keywords")),
                (&pdf_edit.creator, pdf_edit_field(&written, "creator")),
            ];
            for (expected, actual) in checks {
                let Some(expected) = expected else { continue };
                let ok = if expected.is_empty() {
                    actual.is_none_or(|value| value.trim().is_empty())
                } else {
                    actual.is_some_and(|value| value.as_str() == expected.trim())
                };
                if !ok {
                    let _ = std::fs::remove_file(output);
                    return Err(ConversionError::InvalidOutput {
                        path: output.display().to_string(),
                    });
                }
            }
            Ok(MetadataWriteResult {
                output_path: output.display().to_string(),
                kind,
                format,
                written: vec![
                    "Title".to_owned(),
                    "Author".to_owned(),
                    "Subject".to_owned(),
                    "Keywords".to_owned(),
                    "Creator".to_owned(),
                ],
                ignored: edit.ignored_for_pdf(),
                verified: true,
                size_bytes: std::fs::metadata(output).map(|meta| meta.len()).unwrap_or(0),
                note: "the PDF was reopened and the changed fields were read back".to_owned(),
            })
        }
        MetadataKind::Audio | MetadataKind::Video => {
            let (tags, ignored) = edit.media_tags();
            if tags.is_empty() {
                return Err(ConversionError::Other(
                    "no audio or video tag fields were supplied".to_owned(),
                ));
            }
            let size = media_rewrite(input, output, &tags, false)?;
            if let Err(error) = verify_media_edit(output, &tags) {
                let _ = std::fs::remove_file(output);
                return Err(error);
            }
            Ok(MetadataWriteResult {
                output_path: output.display().to_string(),
                kind,
                format,
                written: tags.iter().map(|(key, _)| key.clone()).collect(),
                ignored,
                verified: true,
                size_bytes: size,
                note: "ffprobe reopened the written file and the tags were compared".to_owned(),
            })
        }
        MetadataKind::Image => Err(ConversionError::Other(
            "editing image EXIF tags is not supported in this build; Metadata Studio can remove image metadata losslessly instead"
                .to_owned(),
        )),
        _ => Err(ConversionError::Other(format!(
            "{} metadata is read-only in this build",
            format.label()
        ))),
    }
}

fn pdf_edit_is_empty(edit: &pdf::MetadataEdit) -> bool {
    edit.title.is_none()
        && edit.author.is_none()
        && edit.subject.is_none()
        && edit.keywords.is_none()
        && edit.creator.is_none()
}

fn pdf_edit_field<'a>(info: &'a pdf::PdfDocumentInfo, name: &str) -> Option<&'a String> {
    match name {
        "title" => info.title.as_ref(),
        "author" => info.author.as_ref(),
        "subject" => info.subject.as_ref(),
        "keywords" => info.keywords.as_ref(),
        "creator" => info.creator.as_ref(),
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataRemoval {
    pub output_path: String,
    pub kind: MetadataKind,
    pub format: FormatId,
    pub bytes_before: u64,
    pub bytes_after: u64,
    pub fields_removed: usize,
    pub removed: Vec<String>,
    pub verified: bool,
    pub note: String,
}

fn before_fields(document: &MetadataDocument) -> Vec<String> {
    document
        .fields
        .iter()
        .filter(|entry| {
            !entry.group.starts_with("Stream ")
                && !matches!(
                    entry.group.as_str(),
                    "File" | "Image" | "Media" | "Embedded metadata"
                )
                && entry.key != "Fields"
        })
        .map(|entry| format!("{}: {}", entry.group, entry.key))
        .collect()
}

fn verify_image_clear(output: &Path) -> Result<(), ConversionError> {
    let document = read_metadata(output, "")?;
    let remaining: Vec<String> = document
        .fields
        .iter()
        .filter(|entry| matches!(entry.group.as_str(), "EXIF" | "GPS" | "Embedded metadata"))
        .filter(|entry| entry.key != "Blocks" || entry.value != "None detected")
        .map(|entry| format!("{}: {}", entry.group, entry.key))
        .collect();
    if !remaining.is_empty() {
        return Err(ConversionError::InvalidOutput {
            path: format!(
                "{} still has metadata: {}",
                output.display(),
                remaining.join(", ")
            ),
        });
    }
    Ok(())
}

fn verify_pdf_clear(output: &Path) -> Result<(), ConversionError> {
    let info = pdf::inspect(output, "")?;
    let remaining: Vec<&str> = [
        ("Title", info.title.as_deref()),
        ("Author", info.author.as_deref()),
        ("Subject", info.subject.as_deref()),
        ("Keywords", info.keywords.as_deref()),
        ("Creator", info.creator.as_deref()),
        ("Producer", info.producer.as_deref()),
    ]
    .into_iter()
    .filter_map(|(name, value)| value.filter(|value| !value.trim().is_empty()).map(|_| name))
    .collect();
    if !remaining.is_empty() {
        return Err(ConversionError::InvalidOutput {
            path: format!(
                "{} still has PDF info fields: {}",
                output.display(),
                remaining.join(", ")
            ),
        });
    }
    Ok(())
}

pub fn remove_metadata(
    input: &Path,
    password: &str,
    output: &Path,
    overwrite: bool,
) -> Result<MetadataRemoval, ConversionError> {
    prepare_output(input, output, overwrite)?;
    let format = format::detect_from_path(input);
    let kind = MetadataKind::from_category(format.category());
    let bytes_before = std::fs::metadata(input).map(|meta| meta.len()).unwrap_or(0);
    let before = read_metadata(input, password).ok();
    let removed = before.as_ref().map(before_fields).unwrap_or_default();

    let note = match kind {
        MetadataKind::Image => {
            if !matches!(format, FormatId::Jpeg | FormatId::Png | FormatId::Webp) {
                return Err(ConversionError::Other(format!(
                    "{} metadata cannot be removed losslessly in this build; supported formats are JPEG, PNG and WebP",
                    format.label()
                )));
            }
            let result = image_tools::strip_image_metadata(input, output, overwrite)?;
            verify_image_clear(output).inspect_err(|_error| {
                let _ = std::fs::remove_file(output);
            })?;
            format!(
                "the stripped file decoded successfully and no EXIF, XMP, IPTC or ICC block remained ({})",
                result.note
            )
        }
        MetadataKind::Pdf => {
            let edit = pdf::MetadataEdit::default();
            pdf::rewrite_metadata(input, output, password, &edit, true)?;
            verify_pdf_clear(output).inspect_err(|_error| {
                let _ = std::fs::remove_file(output);
            })?;
            "the PDF was reopened and its Info dictionary and XMP stream were verified empty".to_owned()
        }
        MetadataKind::Audio | MetadataKind::Video => {
            media_rewrite(input, output, &[], true)?;
            verify_media_clear(output).inspect_err(|_error| {
                let _ = std::fs::remove_file(output);
            })?;
            "ffprobe reopened the written file and no user tags remained".to_owned()
        }
        MetadataKind::Document => {
            return Err(ConversionError::Other(
                "document package properties cannot be rewritten safely in this build; edit them in the source application"
                    .to_owned(),
            ))
        }
        MetadataKind::Archive => {
            return Err(ConversionError::Other(
                "archive metadata is read-only; rebuilding the archive would change its contents"
                    .to_owned(),
            ))
        }
        MetadataKind::Text | MetadataKind::Other => {
            return Err(ConversionError::Other(format!(
                "{} has no removable metadata model here",
                format.label()
            )))
        }
    };

    let bytes_after = std::fs::metadata(output)
        .map(|meta| meta.len())
        .unwrap_or(0);
    Ok(MetadataRemoval {
        output_path: output.display().to_string(),
        kind,
        format,
        bytes_before,
        bytes_after,
        fields_removed: removed.len(),
        removed,
        verified: true,
        note,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::RgbaImage;
    use lopdf::dictionary;
    use std::io::Write;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("uc-tools-meta-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("scratch");
        dir
    }

    fn text_pdf(path: &Path, title: &str) {
        let mut document = lopdf::Document::with_version("1.7");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(lopdf::dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        });
        let content = b"BT /F1 24 Tf 72 720 Td (Metadata test) Tj ET".to_vec();
        let content_id = document.add_object(lopdf::Stream::new(lopdf::dictionary! {}, content));
        let page_id = document.add_object(lopdf::dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
            "Contents" => content_id,
            "Resources" => lopdf::dictionary! {
                "Font" => lopdf::dictionary! { "F1" => font_id },
            },
        });
        document.objects.insert(
            pages_id,
            lopdf::Object::Dictionary(lopdf::dictionary! {
                "Type" => "Pages",
                "Kids" => vec![page_id.into()],
                "Count" => 1,
            }),
        );
        let catalog_id = document.add_object(lopdf::dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        document.trailer.set("Root", catalog_id);
        let mut info = lopdf::Dictionary::new();
        info.set("Title", lopdf::Object::string_literal(title));
        let info_id = document.add_object(info);
        document.trailer.set("Info", info_id);
        document.save(path).expect("save pdf");
    }

    fn exif_jpeg(path: &Path) {
        let mut base = RgbaImage::from_pixel(12, 10, image::Rgba([200, 30, 30, 255]));
        base.put_pixel(1, 1, image::Rgba([10, 200, 10, 255]));
        let rgb = image::DynamicImage::ImageRgba8(base).to_rgb8();
        let mut jpeg = Vec::new();
        rgb.write_to(
            &mut std::io::Cursor::new(&mut jpeg),
            image::ImageFormat::Jpeg,
        )
        .expect("jpeg");

        // Minimal little-endian TIFF/EXIF block: Make, Model, Orientation and a
        // GPS IFD with a southern latitude and eastern longitude.
        let ifd0 = 8usize;
        let ifd0_entries = 4usize;
        let ifd0_size = 2 + 12 * ifd0_entries + 4;
        let make = b"TestCam\0";
        let model = b"UC-Test\0";
        let make_offset = ifd0 + ifd0_size;
        let model_offset = make_offset + make.len();
        let gps_offset = model_offset + model.len();
        let gps_entries = 4usize;
        let gps_size = 2 + 12 * gps_entries + 4;
        let lat_offset = gps_offset + gps_size;
        let lon_offset = lat_offset + 24;
        let tiff_len = lon_offset + 24;

        fn entry(tiff: &mut Vec<u8>, tag: u16, kind: u16, count: u32, value: [u8; 4]) {
            tiff.extend_from_slice(&tag.to_le_bytes());
            tiff.extend_from_slice(&kind.to_le_bytes());
            tiff.extend_from_slice(&count.to_le_bytes());
            tiff.extend_from_slice(&value);
        }

        let mut tiff = Vec::with_capacity(tiff_len);
        tiff.extend_from_slice(b"II\x2A\x00");
        tiff.extend_from_slice(&(ifd0 as u32).to_le_bytes());
        tiff.extend_from_slice(&(ifd0_entries as u16).to_le_bytes());
        entry(
            &mut tiff,
            0x010F,
            2,
            make.len() as u32,
            (make_offset as u32).to_le_bytes(),
        );
        entry(
            &mut tiff,
            0x0110,
            2,
            model.len() as u32,
            (model_offset as u32).to_le_bytes(),
        );
        entry(&mut tiff, 0x0112, 3, 1, [6, 0, 0, 0]);
        entry(&mut tiff, 0x8825, 4, 1, (gps_offset as u32).to_le_bytes());
        tiff.extend_from_slice(&0u32.to_le_bytes());
        tiff.extend_from_slice(make);
        tiff.extend_from_slice(model);
        tiff.extend_from_slice(&(gps_entries as u16).to_le_bytes());
        entry(&mut tiff, 0x0001, 2, 2, [b'S', 0, 0, 0]);
        entry(&mut tiff, 0x0002, 5, 3, (lat_offset as u32).to_le_bytes());
        entry(&mut tiff, 0x0003, 2, 2, [b'E', 0, 0, 0]);
        entry(&mut tiff, 0x0004, 5, 3, (lon_offset as u32).to_le_bytes());
        tiff.extend_from_slice(&0u32.to_le_bytes());
        for value in [12u32, 1, 34, 1, 56, 1, 45, 1, 6, 1, 7, 1] {
            tiff.extend_from_slice(&value.to_le_bytes());
        }
        assert_eq!(tiff.len(), tiff_len);

        let mut payload = b"Exif\0\0".to_vec();
        payload.extend_from_slice(&tiff);
        let mut app1 = vec![0xFF, 0xE1];
        app1.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
        app1.extend_from_slice(&payload);
        jpeg.splice(2..2, app1);
        std::fs::write(path, jpeg).expect("write exif jpeg");
    }

    #[test]
    fn image_metadata_reads_exif_and_gps_and_strips_it_verified() {
        let dir = scratch("exif");
        let file = dir.join("photo.jpg");
        exif_jpeg(&file);
        let document = read_metadata(&file, "").expect("metadata");
        assert_eq!(document.kind, MetadataKind::Image);
        assert!(
            document
                .fields
                .iter()
                .any(|field| field.key == "Dimensions")
        );
        assert!(
            document.fields.iter().any(|field| field.group == "EXIF"
                && field.key == "Make"
                && field.value == "TestCam")
        );
        let latitude = document
            .fields
            .iter()
            .find(|field| field.group == "GPS" && field.key == "Latitude")
            .expect("latitude");
        assert!(latitude.value.starts_with("-12.58"), "{}", latitude.value);
        let longitude = document
            .fields
            .iter()
            .find(|field| field.group == "GPS" && field.key == "Longitude")
            .expect("longitude");
        assert!(longitude.value.starts_with("45.10"), "{}", longitude.value);
        assert!(document.removable);

        let output = dir.join("clean.jpg");
        let removal = remove_metadata(&file, "", &output, false).expect("remove");
        assert!(removal.verified);
        assert!(removal.removed.iter().any(|entry| entry.contains("EXIF")));
        let cleaned = read_metadata(&output, "").expect("read clean");
        assert!(
            !cleaned
                .fields
                .iter()
                .any(|field| matches!(field.group.as_str(), "EXIF" | "GPS"))
        );
        image::load_from_memory_with_format(
            &std::fs::read(&output).expect("read"),
            image::ImageFormat::Jpeg,
        )
        .expect("still a valid jpeg");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pdf_metadata_is_read_edited_and_fully_removed() {
        let dir = scratch("pdf");
        let input = dir.join("input.pdf");
        text_pdf(&input, "Original title");
        let document = read_metadata(&input, "").expect("read");
        assert_eq!(document.kind, MetadataKind::Pdf);
        assert!(document.editable);
        assert!(
            document
                .fields
                .iter()
                .any(|field| field.key == "Title" && field.value == "Original title")
        );

        let output = dir.join("edited.pdf");
        let edit = MetadataEditRequest {
            title: Some("Updated title".to_owned()),
            author: Some("Metadata Studio".to_owned()),
            ..MetadataEditRequest::default()
        };
        let result = edit_metadata(&input, "", &output, &edit, false).expect("edit");
        assert!(result.verified);
        let written = read_metadata(&output, "").expect("read back");
        assert!(
            written
                .fields
                .iter()
                .any(|field| field.key == "Title" && field.value == "Updated title")
        );
        assert!(
            written
                .fields
                .iter()
                .any(|field| field.key == "Author" && field.value == "Metadata Studio")
        );

        let clean = dir.join("clean.pdf");
        let removal = remove_metadata(&output, "", &clean, false).expect("remove");
        assert!(removal.verified);
        let cleaned = read_metadata(&clean, "").expect("read clean");
        assert!(
            !cleaned
                .fields
                .iter()
                .any(|field| field.group == "PDF info" && field.key != "Fields")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn metadata_editing_refuses_to_overwrite_the_source() {
        let dir = scratch("same");
        let input = dir.join("input.pdf");
        text_pdf(&input, "Title");
        let edit = MetadataEditRequest {
            title: Some("New".to_owned()),
            ..MetadataEditRequest::default()
        };
        let error = edit_metadata(&input, "", &input, &edit, true).expect_err("must refuse");
        assert!(error.to_string().contains("replace the original"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn document_properties_are_read_from_the_package() {
        let dir = scratch("docx");
        let file = dir.join("letter.docx");
        let zip_file = std::fs::File::create(&file).expect("create docx");
        let mut zip = zip::ZipWriter::new(zip_file);
        zip.start_file(
            "[Content_Types].xml",
            zip::write::SimpleFileOptions::default(),
        )
        .expect("content types");
        zip.write_all(b"<Types/>").expect("write");
        zip.start_file(
            "word/document.xml",
            zip::write::SimpleFileOptions::default(),
        )
        .expect("document");
        zip.write_all(b"<w:document/>").expect("write");
        zip.start_file(
            "docProps/core.xml",
            zip::write::SimpleFileOptions::default(),
        )
        .expect("core");
        zip.write_all(
            b"<cp:coreProperties><dc:title>Quarterly report</dc:title><dc:creator>Alok</dc:creator></cp:coreProperties>",
        )
        .expect("write core");
        zip.finish().expect("finish");
        let document = read_metadata(&file, "").expect("read");
        assert_eq!(document.kind, MetadataKind::Document);
        assert!(
            document
                .fields
                .iter()
                .any(|field| field.key == "Title" && field.value == "Quarterly report")
        );
        assert!(!document.editable);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn comparison_lists_both_sides_of_a_difference() {
        let dir = scratch("compare");
        let left = dir.join("left.pdf");
        let right = dir.join("right.pdf");
        text_pdf(&left, "Same title");
        text_pdf(&right, "Same title");
        let same = compare_metadata(&left, "", &right, "").expect("compare");
        assert!(same.identical);
        text_pdf(&right, "Different title");
        let different = compare_metadata(&left, "", &right, "").expect("compare");
        assert!(!different.identical);
        assert!(
            different
                .differences
                .iter()
                .any(|entry| entry.key == "Title" && entry.left.as_deref() == Some("Same title"))
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn write_wav(path: &Path, seconds: u32) {
        let rate = 44_100u32;
        let samples = rate * seconds;
        let data_len = samples * 2;
        let mut bytes = Vec::with_capacity(44 + data_len as usize);
        bytes.extend(b"RIFF");
        bytes.extend((36 + data_len).to_le_bytes());
        bytes.extend(b"WAVEfmt ");
        bytes.extend(16u32.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(rate.to_le_bytes());
        bytes.extend((rate * 2).to_le_bytes());
        bytes.extend(2u16.to_le_bytes());
        bytes.extend(16u16.to_le_bytes());
        bytes.extend(b"data");
        bytes.extend(data_len.to_le_bytes());
        for index in 0..samples {
            let sample = (index as f64 / rate as f64 * 440.0 * std::f64::consts::TAU).sin() * 0.3;
            bytes.extend(((sample * f64::from(i16::MAX)) as i16).to_le_bytes());
        }
        std::fs::write(path, bytes).expect("write WAV fixture");
    }

    /// A real MP3 with ID3 tags, encoded by the bundled FFmpeg.
    fn tagged_mp3(tools: &ffmpeg::Tools, dir: &Path) -> PathBuf {
        let wav = dir.join("tag-source.wav");
        write_wav(&wav, 1);
        let path = dir.join("tagged.mp3");
        let source = wav.display().to_string();
        let target = path.display().to_string();
        let captured = sidecar::capture(
            &tools.ffmpeg,
            &[
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                &source,
                "-c:a",
                "libmp3lame",
                "-b:a",
                "128k",
                "-metadata",
                "title=Unit Test Tone",
                "-metadata",
                "artist=Universal Converter",
                &target,
            ],
            1024 * 1024,
            Duration::from_secs(120),
        )
        .expect("run FFmpeg to build the MP3 fixture");
        assert!(
            captured.status.success(),
            "MP3 fixture encode failed: {}",
            captured.stderr
        );
        path
    }

    fn tag(document: &MetadataDocument, key: &str) -> Option<String> {
        document
            .fields
            .iter()
            .find(|field| field.group == "Tags" && field.key.eq_ignore_ascii_case(key))
            .map(|field| field.value.clone())
    }

    #[test]
    fn media_tags_are_read_edited_and_removed_with_verification() {
        let tools = ffmpeg::tools().expect("the bundled FFmpeg is required for media tests");
        let dir = scratch("media");
        let input = tagged_mp3(&tools, &dir);

        let before = read_metadata(&input, "").expect("read tags");
        assert_eq!(before.kind, MetadataKind::Audio);
        assert!(before.editable && before.removable);
        assert_eq!(tag(&before, "title").as_deref(), Some("Unit Test Tone"));
        assert_eq!(
            tag(&before, "artist").as_deref(),
            Some("Universal Converter")
        );

        let edited = dir.join("edited.mp3");
        let edit = MetadataEditRequest {
            title: Some("Edited title".to_owned()),
            artist: Some("New artist".to_owned()),
            ..MetadataEditRequest::default()
        };
        let result = edit_metadata(&input, "", &edited, &edit, false).expect("edit tags");
        assert!(result.verified);
        let after = read_metadata(&edited, "").expect("re-read edited file");
        assert_eq!(tag(&after, "title").as_deref(), Some("Edited title"));
        assert_eq!(tag(&after, "artist").as_deref(), Some("New artist"));

        let source = read_metadata(&input, "").expect("re-read source");
        assert_eq!(
            tag(&source, "title").as_deref(),
            Some("Unit Test Tone"),
            "the original file must stay untouched"
        );

        let clean = dir.join("clean.mp3");
        let removal = remove_metadata(&input, "", &clean, false).expect("remove tags");
        assert!(removal.verified);
        assert!(!removal.removed.is_empty());
        let cleared = read_metadata(&clean, "").expect("re-read clean file");
        assert_eq!(tag(&cleared, "title"), None);
        assert_eq!(tag(&cleared, "artist"), None);
        assert!(
            ffmpeg::inspect(&tools, &clean).is_ok(),
            "clean file must still decode"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
