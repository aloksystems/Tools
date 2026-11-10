use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QualityPreset {
    Fast,
    Balanced,
    /// More compression: the smallest file the preset will produce.
    Compression,
    /// High fidelity; kept for saved presets that predate the compression preset.
    High,
    Custom,
}

/// One options bag for both media pages. The audio page writes the audio keys,
/// the video page writes the video keys, and a video→audio job reads the
/// extraction fields from the same JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MediaSettings {
    /// Output audio codec hint. Only OGG offers a real choice (Vorbis or Opus).
    pub codec: String,
    pub bitrate_kbps: u32,
    pub sample_rate_hz: u32,
    pub channels: u32,
    pub volume_percent: u32,
    pub normalize: bool,

    pub start_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    pub preserve_metadata: bool,

    pub video_codec: String,
    pub quality_preset: String,
    pub crf: u32,
    pub video_bitrate_kbps: u32,
    pub target_height_px: u32,
    pub frame_rate: u32,
    pub audio_bitrate_kbps: u32,
    /// Audio codec for a video container; `auto` follows the container.
    pub audio_codec: String,
    pub remove_audio: bool,
    /// Absolute stream index reported by ffprobe for the chosen audio track.
    pub audio_stream_index: Option<u32>,
    pub hardware_acceleration: bool,

    pub gif_fps: u32,
    pub gif_width_px: u32,
    /// 0 keeps the source aspect ratio from `gif_width_px`; >0 fits inside the
    /// chosen width × height box with black padding.
    pub gif_height_px: u32,
}

impl Default for MediaSettings {
    fn default() -> Self {
        MediaSettings {
            codec: "auto".to_owned(),
            bitrate_kbps: 192,
            sample_rate_hz: 0,
            channels: 0,
            volume_percent: 100,
            normalize: false,
            start_ms: None,
            duration_ms: None,
            preserve_metadata: true,
            video_codec: "auto".to_owned(),
            quality_preset: "balanced".to_owned(),
            crf: 23,
            video_bitrate_kbps: 0,
            target_height_px: 0,
            frame_rate: 0,
            audio_bitrate_kbps: 0,
            audio_codec: "auto".to_owned(),
            remove_audio: false,
            audio_stream_index: None,
            hardware_acceleration: false,
            gif_fps: 12,
            gif_width_px: 640,
            gif_height_px: 0,
        }
    }
}

impl MediaSettings {
    /// `small` was the Phase 1 label for the high-compression preset; saved
    /// presets may still carry it.
    pub fn quality(&self) -> QualityPreset {
        match self.quality_preset.as_str() {
            "fast" => QualityPreset::Fast,
            "high" => QualityPreset::High,
            "compression" | "small" => QualityPreset::Compression,
            "custom" => QualityPreset::Custom,
            _ => QualityPreset::Balanced,
        }
    }

    pub fn crf_value(&self) -> u32 {
        match self.quality() {
            QualityPreset::Fast => 28,
            QualityPreset::Balanced => 23,
            QualityPreset::Compression => 30,
            QualityPreset::High => 18,
            QualityPreset::Custom => self.crf.min(51),
        }
    }

    /// Legacy codecs (MPEG-4, WMV, FLV, MPEG-2, H.263) use a 2–31 quality
    /// scale rather than CRF; this maps the same user-facing quality onto it.
    pub fn legacy_quality(&self) -> u32 {
        match self.quality() {
            QualityPreset::Fast => 8,
            QualityPreset::Balanced => 5,
            QualityPreset::Compression => 12,
            QualityPreset::High => 3,
            QualityPreset::Custom => (31.0 - (self.crf.min(51) as f64 / 51.0) * 29.0)
                .round()
                .clamp(2.0, 31.0) as u32,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_preset_name_still_resolves() {
        let settings = MediaSettings {
            quality_preset: "small".to_owned(),
            ..MediaSettings::default()
        };
        assert_eq!(settings.quality(), QualityPreset::Compression);
    }

    #[test]
    fn high_compression_uses_a_higher_crf_than_balanced() {
        let balanced = MediaSettings::default();
        let compression = MediaSettings {
            quality_preset: "compression".to_owned(),
            ..MediaSettings::default()
        };
        assert!(compression.crf_value() > balanced.crf_value());
    }

    #[test]
    fn custom_crf_is_clamped() {
        let settings = MediaSettings {
            quality_preset: "custom".to_owned(),
            crf: 90,
            ..MediaSettings::default()
        };
        assert_eq!(settings.crf_value(), 51);
    }
}
