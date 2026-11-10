# PHASE 3 — AUDIO & VIDEO STUDIO
## Universal Converter | Windows Desktop Application

You are continuing development of an existing Universal Converter desktop application.

Phase 1: Image Converter — Completed.

Phase 2: PDF Studio — Previously implemented or being completed.

Your task is to implement Phase 3: a fully functional Audio & Video Conversion Studio powered primarily by FFmpeg.

IMPORTANT:
Do not rebuild the application.
Do not replace existing architecture.
Do not break Phase 1 or Phase 2 functionality.

Extend the existing codebase.

---

# 1. FIRST: ANALYZE THE EXISTING CODEBASE

Before implementing anything:

1. Read docs/architecture.md.
2. Inspect the existing audio and video engine stubs.
3. Inspect ConversionEngine and EngineContext.
4. Inspect EngineId and engine registration.
5. Inspect core/registry.rs.
6. Inspect FormatId and format detection.
7. Inspect the existing conversion manager.
8. Inspect queue concurrency and cancellation.
9. Inspect audio/video frontend pages and settings panels.
10. Inspect existing FFmpeg sidecar detection and execution utilities.
11. Inspect existing tests and build configuration.

Identify what is already implemented and what is missing.

Produce a concise implementation plan before modifying files.

Do not duplicate existing functionality.

# 2. TECHNOLOGY

Primary multimedia engine:

FFmpeg + FFprobe.

Use:
- ffmpeg.exe for encoding and decoding.
- ffprobe.exe for media inspection.
- Rust for process management.
- Existing Sidecar utilities for process execution.

Requirements:

- Support bundled FFmpeg binaries.
- Support UC_FFMPEG_PATH override.
- Support UC_FFPROBE_PATH override.
- Detect installed versions.
- Validate executable availability.
- Display clear dependency errors.
- Never depend silently on the developer's machine.

Use argv-only process execution.

Never invoke cmd.exe or PowerShell to construct conversion commands.

# 3. AUDIO CONVERTER

Implement real audio conversion.

Supported input/output formats:

- MP3
- WAV
- FLAC
- AAC
- M4A
- OGG
- OPUS
- WMA where supported
- AIFF
- ALAC where supported

Features:

A. Format conversion
B. Batch conversion
C. Audio compression
D. Bitrate selection
E. Sample rate selection
F. Channel selection (Mono/Stereo)
G. Audio codec selection
H. Volume adjustment
I. Audio trimming
J. Metadata preservation where supported
K. Output filename customization

Bitrate presets:

- 64 kbps
- 96 kbps
- 128 kbps
- 192 kbps
- 256 kbps
- 320 kbps

Sample rates:

- 22050 Hz
- 32000 Hz
- 44100 Hz
- 48000 Hz
- 96000 Hz

Do not offer invalid combinations for the selected output format.

For lossless formats, explain when bitrate settings do not apply.

# 4. VIDEO CONVERTER

Implement actual video conversion.

Supported formats:

- MP4
- MKV
- MOV
- AVI
- WEBM
- WMV where supported
- FLV
- MPEG
- 3GP
- GIF

Features:

A. Video format conversion
B. Video compression
C. Resolution adjustment
D. Frame rate adjustment
E. Video codec selection
F. Audio codec selection
G. Video bitrate control
H. Audio bitrate control
I. Video trimming
J. Audio removal
K. Audio extraction
L. Thumbnail generation
M. Video metadata inspection
N. Aspect ratio preservation
O. Batch conversion

Resolution presets:

- Original
- 360p
- 480p
- 720p
- 1080p
- 1440p
- 2160p (4K)

Frame rate presets:

- Original
- 24 FPS
- 25 FPS
- 30 FPS
- 50 FPS
- 60 FPS

Do not upscale videos automatically.

Preserve aspect ratio unless the user explicitly selects cropping or stretching.

# 5. AUDIO EXTRACTION

Implement:

- Extract audio from video.
- Save as MP3, WAV, FLAC, AAC, OGG and OPUS where supported.
- Select audio stream when multiple audio tracks exist.
- Preserve metadata where possible.
- Support batch extraction.

# 6. VIDEO TO GIF

Implement:

- Video to GIF.
- Start and end time.
- Width and height selection.
- FPS selection.
- GIF optimization.
- Preview generated GIF.
- Output file-size reporting.

Use an appropriate palette-generation workflow for GIF quality.

# 7. MEDIA INFORMATION / FFPROBE

Build a proper media inspection service.

Extract:

- File duration.
- File size.
- Container format.
- Video codec.
- Audio codec.
- Resolution.
- Frame rate.
- Bitrate.
- Audio channels.
- Sample rate.
- Stream count.
- Metadata.

Display this information in the frontend before conversion.

Use structured FFprobe JSON output and parse it safely.

# 8. VIDEO COMPRESSION

Implement useful compression presets:

- Fast
- Balanced
- High Compression
- Custom

Allow users to configure:

- CRF / quality level.
- Video bitrate.
- Audio bitrate.
- Resolution.
- Codec.
- Encoding speed/preset.

Clearly explain that compression results depend on the input media.

Do not promise a guaranteed percentage reduction.

Report actual source and output file sizes.

# 9. HARDWARE ACCELERATION

Detect available hardware acceleration where practical.

Support optional:

- NVIDIA NVENC.
- Intel Quick Sync.
- AMD AMF.

Requirements:

- Detect encoder availability.
- Allow manual selection.
- Provide software encoding fallback.
- Never claim hardware acceleration is active without verifying it.
- Gracefully handle unsupported hardware.

Software encoding must always remain available.

# 10. CONVERSION ENGINE ARCHITECTURE

Implement dedicated AudioEngine and VideoEngine using the existing ConversionEngine interface.

Preserve:

- ConversionManager.
- Registry.
- EngineContext.
- CancellationToken.
- ProgressSink.
- Job queue.
- Worker pool.
- Events.
- SQLite history.
- Output planning.
- Existing error handling.

Do not create separate multimedia queues.

Extend existing job settings carefully.

Audio and video conversion should use engine-specific typed settings.

Use FFmpeg progress output in a machine-readable format to calculate actual progress.

Handle:
- Process startup.
- Process monitoring.
- Cancellation.
- Timeout.
- Non-zero exit codes.
- Stderr capture.
- Output validation.

Use ffprobe to validate the generated output.

# 11. RESOURCE MANAGEMENT

Audio and video conversion can consume substantial CPU, memory and disk space.

Implement:

- Heavy-job classification.
- Configurable concurrent jobs.
- Bounded worker execution.
- Temporary disk-space checks.
- Cancellation of running processes.
- Process termination and cleanup.
- Safe handling of large files.

Do not load entire video files into memory.

Use the existing heavy-job gate for video conversions.

Audio and video jobs should respect user concurrency settings.

# 12. FRONTEND DESIGN

Build professional Audio and Video conversion interfaces consistent with the existing application.

Audio workspace:

- Audio file dropzone.
- File list.
- Audio format selector.
- Bitrate settings.
- Sample rate settings.
- Channel settings.
- Trim controls.
- Metadata information.
- Output destination.
- Conversion progress.

Video workspace:

- Video file dropzone.
- File list.
- Video information.
- Format selector.
- Resolution selector.
- Codec selector.
- Frame rate selector.
- Compression settings.
- Audio controls.
- Trim controls.
- Output destination.
- Conversion progress.

Additional UI:

- Media preview where supported.
- Thumbnail generation.
- Selected stream information.
- Active job queue.
- Success and failure states.
- Reveal output in Explorer.

Use existing shared UI components and stores.

Do not redesign unrelated pages.

# 13. SECURITY REQUIREMENTS

Implement:

- Validate media signatures.
- Never trust file extensions alone.
- Limit input size according to application settings.
- Apply conversion timeouts.
- Use argv-only process execution.
- Never invoke a command shell.
- Capture stderr safely.
- Limit resource consumption where possible.
- Use isolated temporary directories.
- Never overwrite original files.
- Validate output files.
- Kill and reap subprocesses on cancellation.
- Prevent unsafe output paths.

Treat media files as untrusted input.

# 14. TESTING REQUIREMENTS

Use small real media fixtures.

Audio tests:
- WAV to MP3.
- MP3 to WAV.
- WAV to FLAC.
- Audio bitrate settings.
- Sample rate conversion.
- Channel conversion.
- Audio trimming.
- Metadata handling.

Video tests:
- MP4 to MKV.
- MKV to MP4.
- Video compression.
- Resolution adjustment.
- Frame rate adjustment.
- Audio extraction.
- Video to GIF.
- Video trimming.
- Audio removal.

Engine tests:
- Missing FFmpeg.
- Missing FFprobe.
- Invalid media file.
- Corrupt media.
- Cancellation.
- Timeout.
- Failed conversion.
- Invalid output.
- Source-file preservation.
- Large file handling.

Use FFprobe to validate actual output streams.

Do not rely exclusively on mocked process responses.

# 15. REGRESSION TESTING

All existing phases must remain functional.

Run:

cargo test
cargo check --all-targets
npm run build
npm run lint

Do not remove existing tests or weaken assertions to obtain a passing build.

Fix all regressions.

# 16. DOCUMENTATION

Update:

- docs/architecture.md
- README.md
- FFmpeg setup documentation.
- Supported media formats.
- Codec support matrix.
- Hardware acceleration documentation.
- Known limitations.
- Dependency installation instructions.

Document the exact FFmpeg build and licensing configuration used.

# 17. COMPLETION REPORT

When finished, provide:

1. Audio features implemented.
2. Video features implemented.
3. FFmpeg and FFprobe integration details.
4. Supported codecs and formats.
5. Hardware acceleration availability.
6. Files created or modified.
7. Automated test results.
8. Build and lint results.
9. Manual testing instructions.
10. Remaining limitations.
11. Confirmation that Phase 1 and Phase 2 remain functional.

FINAL RULE:

Do not mark Phase 3 complete just because the Audio and Video pages render.

Real audio and video files must successfully convert.

Generated files must be validated using FFprobe.

Cancellation, progress, errors and output handling must work correctly.

Preserve the existing architecture and prioritize reliability over the number of features.