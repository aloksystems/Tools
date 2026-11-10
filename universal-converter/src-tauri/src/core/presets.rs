use crate::core::format::FormatId;
use crate::database::Preset;
use crate::engines::EngineId;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub const PRESET_SCHEMA: &str = "universal-converter.presets";
pub const PRESET_SCHEMA_VERSION: u32 = 1;
pub const MAX_PRESETS_PER_IMPORT: usize = 500;

/// The file format written by "Export JSON" and accepted by "Import".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetBundle {
    pub schema: String,
    pub version: u32,
    pub exported_at_ms: u64,
    pub presets: Vec<Preset>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetImportReport {
    pub imported: usize,
    /// Names that collided with an existing preset; the stored name is listed.
    pub renamed: Vec<String>,
    /// Settings keys that were removed because they looked like secrets.
    pub scrubbed: Vec<String>,
    pub skipped: Vec<String>,
}

/// Strips password-shaped keys before a preset is stored, exported or shown.
/// The removed paths are returned for the report — values are never logged.
pub fn scrub_secrets(value: &Value) -> (Value, Vec<String>) {
    fn walk(value: &Value, path: &str, removed: &mut Vec<String>) -> Value {
        match value {
            Value::Object(map) => {
                let mut clean = serde_json::Map::new();
                for (key, child) in map {
                    let lower = key.to_ascii_lowercase();
                    let next = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{path}.{key}")
                    };
                    if lower.contains("password")
                        || lower.contains("secret")
                        || lower.contains("token")
                    {
                        removed.push(next);
                        continue;
                    }
                    clean.insert(key.clone(), walk(child, &next, removed));
                }
                Value::Object(clean)
            }
            Value::Array(items) => Value::Array(
                items
                    .iter()
                    .enumerate()
                    .map(|(index, child)| walk(child, &format!("{path}[{index}]"), removed))
                    .collect(),
            ),
            other => other.clone(),
        }
    }

    let mut removed = Vec::new();
    let cleaned = walk(value, "", &mut removed);
    (cleaned, removed)
}

pub fn settings_have_secret(value: &Value) -> Option<String> {
    fn walk(value: &Value, path: &str) -> Option<String> {
        match value {
            Value::Object(map) => {
                for (key, child) in map {
                    let lower = key.to_ascii_lowercase();
                    let next = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{path}.{key}")
                    };
                    if lower.contains("password")
                        || lower.contains("secret")
                        || lower.contains("token")
                    {
                        return Some(next);
                    }
                    if let Some(found) = walk(child, &next) {
                        return Some(found);
                    }
                }
                None
            }
            Value::Array(items) => items
                .iter()
                .enumerate()
                .find_map(|(index, child)| walk(child, &format!("{path}[{index}]"))),
            _ => None,
        }
    }
    walk(value, "")
}

/// Rules for anything that can be written into the database or a bundle.
pub fn validate_preset(preset: &Preset) -> Result<(), String> {
    let name = preset.name.trim();
    if name.is_empty() {
        return Err("a preset needs a name".to_owned());
    }
    if name.chars().count() > 80 {
        return Err("preset names are limited to 80 characters".to_owned());
    }
    if preset.output_format == FormatId::Unknown {
        return Err(format!("{} has no output format", preset.name));
    }
    if !preset.settings.is_object() && !preset.settings.is_null() {
        return Err(format!(
            "{} stores settings that are not an object",
            preset.name
        ));
    }
    if let Some(path) = settings_have_secret(&preset.settings) {
        return Err(format!(
            "{} contains a secret-looking key ({path}); passwords are never stored in presets",
            preset.name
        ));
    }
    Ok(())
}

pub fn sanitize_for_export(mut preset: Preset) -> Preset {
    preset.name = preset.name.trim().to_owned();
    let (settings, _) = scrub_secrets(&preset.settings);
    preset.settings = settings;
    preset
}

pub fn read_bundle(value: Value) -> Result<PresetBundle, String> {
    let bundle: PresetBundle = serde_json::from_value(value)
        .map_err(|error| format!("this is not a preset export file: {error}"))?;
    if bundle.schema != PRESET_SCHEMA {
        return Err(format!(
            "unknown preset file schema '{}'; expected '{}'",
            bundle.schema, PRESET_SCHEMA
        ));
    }
    if bundle.version > PRESET_SCHEMA_VERSION {
        return Err(format!(
            "this preset file uses schema version {}; this build understands version {} or older",
            bundle.version, PRESET_SCHEMA_VERSION
        ));
    }
    if bundle.presets.len() > MAX_PRESETS_PER_IMPORT {
        return Err(format!(
            "this file contains {} presets; the import limit is {}",
            bundle.presets.len(),
            MAX_PRESETS_PER_IMPORT
        ));
    }
    Ok(bundle)
}

pub fn bundle(presets: Vec<Preset>) -> PresetBundle {
    PresetBundle {
        schema: PRESET_SCHEMA.to_owned(),
        version: PRESET_SCHEMA_VERSION,
        exported_at_ms: crate::utils::time::now_ms(),
        presets: presets.into_iter().map(sanitize_for_export).collect(),
    }
}

pub fn unique_name(base: &str, taken: &[String]) -> String {
    let lower: Vec<String> = taken.iter().map(|name| name.to_lowercase()).collect();
    if !lower.contains(&base.to_lowercase()) {
        return base.to_owned();
    }
    for index in 2..1000 {
        let candidate = format!("{base} ({index})");
        if !lower.contains(&candidate.to_lowercase()) {
            return candidate;
        }
    }
    format!("{base} ({})", Uuid::new_v4())
}

/// Small, safe starters. Every engine fills in its own defaults for keys that
/// are absent, so these stay short and readable.
pub fn default_presets() -> Vec<Preset> {
    vec![
        Preset {
            id: Uuid::new_v4().to_string(),
            name: "Web image (WebP)".to_owned(),
            engine: EngineId::Image,
            output_format: FormatId::Webp,
            settings: serde_json::json!({
                "quality": 82,
                "stripMetadata": true
            }),
        },
        Preset {
            id: Uuid::new_v4().to_string(),
            name: "JPEG 85".to_owned(),
            engine: EngineId::Image,
            output_format: FormatId::Jpeg,
            settings: serde_json::json!({ "quality": 85 }),
        },
        Preset {
            id: Uuid::new_v4().to_string(),
            name: "MP3 192k".to_owned(),
            engine: EngineId::Media,
            output_format: FormatId::Mp3,
            settings: serde_json::json!({
                "bitrateKbps": 192,
                "preserveMetadata": true
            }),
        },
        Preset {
            id: Uuid::new_v4().to_string(),
            name: "MP4 balanced".to_owned(),
            engine: EngineId::Media,
            output_format: FormatId::Mp4,
            settings: serde_json::json!({
                "qualityPreset": "balanced",
                "hardwareAcceleration": false
            }),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn preset(settings: Value) -> Preset {
        Preset {
            id: "p1".to_owned(),
            name: "Test".to_owned(),
            engine: EngineId::Image,
            output_format: FormatId::Webp,
            settings,
        }
    }

    #[test]
    fn secrets_are_removed_from_nested_settings() {
        let (clean, removed) = scrub_secrets(&json!({
            "quality": 80,
            "password": "never",
            "nested": { "Password": "never", "keep": 1 },
            "array": [{ "apiToken": "x" }, { "keep": true }]
        }));
        assert_eq!(clean["quality"], 80);
        assert!(clean["password"].is_null());
        assert!(clean["nested"]["Password"].is_null());
        assert_eq!(clean["nested"]["keep"], 1);
        assert!(clean["array"][0]["apiToken"].is_null());
        assert_eq!(clean["array"][1]["keep"], true);
        assert_eq!(removed.len(), 3);
        assert!(!format!("{removed:?}").contains("never"));
    }

    #[test]
    fn validation_rejects_secret_presets_and_empty_names() {
        let with_secret = preset(json!({ "password": "x" }));
        assert!(validate_preset(&with_secret).is_err());
        let mut unnamed = preset(json!({}));
        unnamed.name = "  ".to_owned();
        assert!(validate_preset(&unnamed).is_err());
        assert!(validate_preset(&preset(json!({ "quality": 80 }))).is_ok());
    }

    #[test]
    fn exported_bundles_never_carry_secrets() {
        let bundle = bundle(vec![preset(json!({
            "quality": 80,
            "password": "must-not-export"
        }))]);
        let text = serde_json::to_string(&bundle).unwrap();
        assert!(!text.contains("must-not-export"));
        assert!(!text.contains("password"));
        assert_eq!(bundle.schema, PRESET_SCHEMA);
        assert_eq!(bundle.version, PRESET_SCHEMA_VERSION);
    }

    #[test]
    fn bundles_from_the_future_are_refused() {
        let mut bundle = bundle(vec![preset(json!({}))]);
        bundle.version = PRESET_SCHEMA_VERSION + 1;
        let value = serde_json::to_value(bundle).unwrap();
        assert!(read_bundle(value).is_err());
    }

    #[test]
    fn unique_names_get_a_suffix() {
        let taken = vec!["Web".to_owned(), "Web (2)".to_owned()];
        assert_eq!(unique_name("Web", &taken), "Web (3)");
        assert_eq!(unique_name("Other", &taken), "Other");
    }

    #[test]
    fn starter_presets_are_valid_and_unique() {
        let presets = default_presets();
        assert!(!presets.is_empty());
        for preset in &presets {
            validate_preset(preset).unwrap();
        }
        let names: Vec<String> = presets.iter().map(|preset| preset.name.clone()).collect();
        let unique: std::collections::HashSet<_> = names.iter().collect();
        assert_eq!(names.len(), unique.len());
    }
}
