# Universal Converter release notes

## 1.0.1 — 2026-11-03

Startup reliability update. All 1.0.0 features are unchanged.

### Fixed

- **No more console window.** Release builds are now Windows GUI subsystem
  binaries, so launching the app no longer opens a command prompt beside it.
- **The window appears immediately.** Engine discovery used to run before the
  first paint and could block for tens of seconds while LibreOffice, FFmpeg or
  Tesseract answered. The window now shows at once; engine status fills in from
  a background worker and the UI stays responsive.
- **Engine probes run concurrently.** One slow engine no longer delays every
  other engine's result.
- **Blank window after install.** If Windows starts the app with a deleted
  working directory (common when an installer launches it), the app now restores
  the directory before WebView2 initialises instead of failing with
  `E_INVALIDARG`.
- **Clearer WebView2 failure.** If the webview still cannot be created, the app
  shows a native error explaining that the WebView2 Runtime needs repair instead
  of leaving a blank, apparently hung window.

### Verification

`cargo test --all-targets`, `cargo fmt --check`,
`cargo clippy --all-targets -- -D warnings`, `npm run lint`, `npm run build`
and `npm run check:versions` pass. The installed 1.0.1 build opens its window in
about 2–3 seconds and stays responsive while the engines are probed in the
background; the executable is a Windows GUI binary, so no console appears.

## 1.0.0 — 2026-11-02

First public build.

Universal Converter is a Windows desktop file converter that runs entirely on
this machine. There is no account, no upload and no telemetry. A converted file
is always written next to a copy-safe name and never replaces the file you
started with.

### What is in 1.0.0

- **Images** — JPEG, PNG, WebP, BMP, TIFF, GIF and ICO convert in-process.
  Resize, crop-to-fill, rotation, flips, quality, metadata stripping and
  flattening. AVIF, HEIC and SVG become available when ImageMagick is present.
- **PDF** — images to one or many PDFs (page size, orientation, margins,
  placement, order); pages to PNG/JPEG/WebP (DPI, quality, ranges); merge,
  split/extract, rotate, reorder with the thumbnail Studio, compress, read or
  edit metadata, set or remove passwords. PDFium and qpdf are bundled.
- **OCR** — read text from images and scanned PDFs with the bundled Tesseract 5.
  Language selection comes from the tessdata folder that is actually installed.
- **Documents** — DOC/DOCX/ODT/RTF/TXT/HTML, XLS/XLSX/ODS/CSV and
  PPT/PPTX/ODP convert through the bundled headless LibreOffice 25.8.
- **Audio** — MP3, WAV, FLAC, AAC, M4A, OGG, Opus, WMA, AIFF and ALAC on the
  bundled FFmpeg. Bitrate, sample rate, channels, volume, loudness
  normalisation, trim, metadata and the codecs the container really offers.
- **Video** — MP4, MKV, MOV, AVI, WEBM, WMV, FLV, MPEG, 3GP and GIF. Quality
  presets, CRF or bitrate, resolution, frame rate, codec choice, audio removal
  or extraction, trim, palette GIFs, poster frame and GIF preview.
- **Archives** — ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, WIM and CAB through the
  bundled 7-Zip 26.05. Create archives with compression levels, AES-256
  password and 7z header encryption; list and extract whole archives or selected
  entries with path validation.
- **Queue and history** — batch, parallel jobs with per-job progress, cancel,
  retry, throttled event updates, SQLite-backed history, reusable presets and
  settings.
- **Advanced tools** — per-file operations (hashing, checksums, rename, file
  info and the existing tool set) plus automation rules and workflows built on
  the same queue and engine registry.
- **Quick Convert and search** — drop mixed files and convert with defaults,
  a Ctrl+K command palette, keyboard shortcuts and favorite tools.
- **Windows integration** — opt-in Explorer context-menu entries and Open With
  (HKCU only, no default-association changes), a tray icon, single-instance
  hand-off when files are opened while the app is running, and optional native
  toasts when a background job finishes.
- **Crash recovery** — jobs interrupted by a crash, shutdown or forced kill are
  marked as interrupted on the next launch, kept for review or retry and never
  restarted automatically; abandoned temp files are cleaned up.
- **Backup and restore** — one validated, versioned JSON file for settings,
  presets, workflows, automation rules, favorites and history. Restore shows a
  preview and replaces data in a single transaction; corrupted or foreign
  backups are refused without touching existing data.
- **First run** — welcome dialog with engine status, privacy summary and the
  default output location.
- **Diagnostics** — local-only support report (version, OS, storage paths,
  engine status, database row counts, log file list), one-click export of the
  report and logs to a folder you choose. No file contents are collected.
- **Settings** — explicit tool paths per engine, output mode (subfolder, source
  folder, custom folder), concurrency, timeouts and extraction limits. Paths
  chosen here take priority over bundled copies and PATH.

### Bundled engines

Everything needed for PDF, OCR, documents, audio, video and archives ships in
`resources/`. ImageMagick is optional and is only needed for AVIF, HEIC and SVG.
Settings → Engines → Re-scan picks up a tool you add later.

| Tool | Version bundled |
| --- | --- |
| FFmpeg / ffprobe | 9.0.2-42 (2026-11-01 build) |
| LibreOffice (headless) | 25.8.7.3 |
| 7-Zip | 26.05 |
| PDFium | bundled |
| qpdf | bundled |
| Tesseract | 5.x with selected language data |

### Install

- **Installer** — `Universal-Converter-Setup-1.0.1.exe`. Per-user install with
  no administrator prompt; installs under `%LOCALAPPDATA%`.
- **Portable** — `Universal-Converter-Portable-1.0.1.zip`. Unzip anywhere and
  run `Universal Converter.exe`. The bundled tools live next to it in
  `resources/`.
- **Checksums** — `checksums.txt` lists the SHA-256 of both artifacts.

### Known limitations

- **The build is unsigned.** Windows SmartScreen may warn on first run. Code
  signing is a release decision for the maintainer; see
  [BUILD.md](BUILD.md#code-signing).
- **Updates are manual.** Version 1.0.1 has no auto-updater and no update
  endpoint. To update, install a newer build; settings and history stay in
  `%APPDATA%\UniversalConverter`.
- **Windows 10 version 19045 is the tested platform.** Windows 11 has not been
  tested on hardware for this release; it is expected to work because the app
  only uses WebView2 and per-user APIs. See the QA report for exact coverage.
- **ImageMagick formats** (AVIF, HEIC, SVG) are unavailable until ImageMagick is
  installed and selected. The UI disables those formats instead of failing a
  job later.
- **OCR** quality depends on the language data present in tessdata; additional
  languages are installed by dropping the traineddata files there.
- Hardware video encoders are offered only after a one-frame test encode
  succeeds; otherwise the software encoder is used.

### Verification

Every output is checked before a job is reported as successful: signatures and
page counts for PDFs, package types for office files, ffprobe for media, archive
listing and path validation for archives. Tests live in `src-tauri` and run with
`cargo test`; the UI builds with `npm run build` and lints with `npm run lint`.

For 1.0.0, 258 automated tests pass, including real OCR, LibreOffice, FFmpeg,
7-Zip, PDFium and qpdf runs. `cargo clippy --all-targets -- -D warnings` is clean,
`npm audit` reports no vulnerabilities, and `cargo audit` reports no
vulnerabilities (unmaintained-crate warnings remain and are documented in
[SECURITY.md](SECURITY.md)). Exact manual coverage and the checks that were not
performed are recorded in [QA-REPORT.md](QA-REPORT.md).

Nothing in this release has been uploaded anywhere. There is no network code in
the Rust core.
