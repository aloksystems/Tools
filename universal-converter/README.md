# Universal Converter

A Windows desktop file converter that runs entirely offline. One workflow for
images, PDF, OCR, documents, audio, video and archives; batch and parallel; no
account, no upload, and a converted file never replaces the one you started with.

Built with Tauri 2, React 19 + TypeScript and Tailwind v4 on the front, a Rust core
on the back, and SQLite for local state.

## What works

| Area | State |
| --- | --- |
| **Images** — JPEG, PNG, WebP, BMP, TIFF, GIF, ICO | **Working**, in-process, no external tool needed. Resize, crop-to-fill, rotation, flips, quality, metadata strip, flatten. |
| **AVIF, HEIC, SVG** | Working once ImageMagick is present — see [`resources/README.md`](resources/README.md). |
| **PDF** | **Working.** Images into PDFs; PDF pages to PNG/JPEG/WebP (DPI, quality, ranges); merge, split/extract, rotate, reorder with a thumbnail Studio, compress, metadata read/edit, and set/remove passwords. PDFium and qpdf ship in `resources/`. |
| **OCR** — images and PDFs → TXT or searchable PDF | **Working** on the bundled Tesseract 5. Language packs are listed from the installed `tessdata`; page rendering reuses PDFium. |
| **Audio** — MP3, WAV, FLAC, AAC, M4A, OGG, Opus, WMA, AIFF, ALAC | **Working** on the bundled FFmpeg. Batch, bitrate, sample rate, channels, volume, loudness normalisation, trim, metadata. |
| **Video** — MP4, MKV, MOV, AVI, WEBM, WMV, FLV, MPEG, 3GP, GIF | **Working** on the bundled FFmpeg. Quality presets, resolution, frame rate, codecs, audio removal/extraction, trim, palette GIF studio, poster frame and GIF preview. |
| **Documents** — DOC/DOCX/ODT/RTF/TXT/HTML, XLS/XLSX/ODS/CSV, PPT/PPTX/ODP | **Working** on the bundled headless LibreOffice 25.8. Word processors → PDF, DOCX, DOC, ODT, RTF, TXT, HTML; spreadsheets → XLSX, XLS, ODS, CSV, PDF, HTML; presentations → PPTX, ODP, PDF. |
| **Archives** — ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, WIM, CAB | **Working** on the bundled 7-Zip 26.05. Create, inspect and extract; store/fast/normal/maximum levels, AES-256 and encrypted headers. Extraction is validated before anything is written. |
| **Metadata Studio** | Read, edit, compare and remove EXIF/GPS, PDF info, media tags and document properties. Removal is verified by reading the output again. |
| **File Utilities** | MD5/SHA-1/SHA-256/SHA-512, checksum verification, file and metadata comparison, duplicate finder, size reports, signature inspection, image comparison. |
| **Automation Studio** | Folder watchers backed by SQLite rules and logs: convert or OCR new files, format filters, loop prevention, pause/resume, no original deletion. |
| **Workflows** | Saved 1–6 step pipelines that reuse the ordinary queue (for example PNG → JPEG → WebP), with progress, cancellation, per-step failures and automatic temp cleanup. |
| **Presets** | Import/export/duplicate/defaults with schema versioning, validation and recursive secret scrubbing. |
| Queue, cancel, retry, progress, history, settings, search, first run | **Working**, backed by the Rust queue and SQLite. |

The UI only offers an output format whose engine actually probes available on this
machine, so no button can start a job that is guaranteed to fail. A missing
optional engine shows its reason and setup hint instead of a dead button.

## Install

Download the NSIS installer from the published release (per-user, no
administrator prompt):

<https://github.com/aloksystems/universal-converter/releases/download/v1.0.1/Universal-Converter-Setup-1.0.1.exe>

The portable build is a ZIP:

<https://github.com/aloksystems/universal-converter/releases/download/v1.0.1/Universal-Converter-Portable-1.0.1.zip>

`checksums.txt` and `RELEASE-NOTES.md` are attached to the same release. After
building locally the same files appear in `release/`.

Unzip it anywhere and run `Universal Converter.exe`; keep the `resources` folder
next to the executable. Portable data still lives in `%APPDATA%\UniversalConverter`
so an upgrade never loses settings or history. Details and uninstall steps:
[`docs/INSTALLATION.md`](docs/INSTALLATION.md).

The installer, portable ZIP and bundled engine payload are **not committed to
this repository** (they total more than 2 GB). A clone alone cannot run the
document, media, OCR or archive engines until `resources/` is populated; see
[`resources/README.md`](resources/README.md). The image and native PDF operations
work without the external payload.

The current build is **unsigned**; Windows SmartScreen may show an “unknown
publisher” warning. Code-signing requirements and limitations are documented in
[`docs/BUILD.md`](docs/BUILD.md#code-signing).

## First run

The welcome screen shows the application version, engine health, storage
location, default output location and privacy information. Missing optional
engines are listed but never block startup. Everything can be changed later in
Settings, including explicit tool paths, diagnostics export, cache/history cleanup
and a settings reset.

## Build and test

Requirements: Windows 10/11 (WebView2), Node.js 20+, Rust with the MSVC toolchain.
No engine downloads are needed when the engine payload is in `resources/`:
PDFium, qpdf, FFmpeg/ffprobe, LibreOffice, 7-Zip and Tesseract. That payload is
not stored in Git, so a fresh clone must provide it (or copy it from a release
build) before those engines probe as available. ImageMagick is the only optional
drop-in, for AVIF/HEIC/SVG.

```bash
npm install
npm run tauri dev      # desktop app with hot reload
npm run build          # tsc -b && vite build
npm run lint           # oxlint
cd src-tauri && cargo test   # unit + real end-to-end engine tests
```

Release build:

```bash
npm run release:build
```

This runs `tauri build`, then [`scripts/package-release.mjs`](scripts/package-release.mjs)
to create `release/` with the NSIS installer, portable ZIP, SHA-256 checksums and
release notes. It never renames an unrelated executable into an installer.

Licence notices for statically linked crates are regenerated after dependency
changes with `npm run notices`.

## Checks and guarantees

- **No mocked conversions.** Tests write real fixtures and re-open the real
  outputs with the same engines: PNG→JPEG through the queue, real PDF page
  operations with PDFium/qpdf, WAV and tagged media through FFmpeg/ffprobe,
  DOCX/XLSX/PPTX through LibreOffice, ZIP/7Z/TAR round trips and malicious archive
  fixtures, OCR pages through Tesseract, and a two-step workflow that checks the
  final format and temp cleanup.
- **Originals are never overwritten.** The planner refuses any destination that
  resolves onto the source file, whatever the collision policy says. Asserted in
  [src-tauri/src/utils/paths.rs](src-tauri/src/utils/paths.rs).
- **Format comes from the file's bytes, not its name.** Magic-byte detection
  decides how a file is parsed; a mismatched extension is reported, not obeyed.
- **Archive extraction cannot escape its destination.** Member paths are
  normalised and refused if absolute or traversing; links, case-insensitive
  duplicates and over-budget archives are refused before extraction starts.
- **Subprocesses get argv, never a shell.** No string interpolation, no command
  injection, `CREATE_NO_WINDOW`, bounded wait with a deadline, kill on cancel.
- **Passwords never persist.** Job passwords are held in memory for the batch and
  scrubbed from settings, presets, events, history and diagnostics.
- **Local by default.** No telemetry, no network calls in the Rust core, and no
  automatic upload of logs or files.
- **No dead buttons.** If a capability is not implemented, it is not on screen.

## Storage

`%APPDATA%\UniversalConverter\`

```
database/converter.db   history, settings, recent files, presets, engine versions,
                        automation rules/log, workflows
temp/                   scratch space handed to each job; swept on exit and on demand
logs/                   rotating logs — max 5 files × 10 MB
cache/                  derived data only; safe to clear in Settings
presets/                reserved for future file-based presets
```

Diagnostics reports are created only when the user exports one and chooses a
folder. They contain paths and engine health, never file contents.

## Layout

```
src/                    React UI — pages/, components/, features/<area>/, stores/, hooks/
src-tauri/src/
  core/                 format registry, detection, job model, planner, settings, presets
  engines/              one module per backend + sidecar spawn/timeout helpers
  queue/                worker pool, throttled events, cancellation
  database/             SQLite schema and queries
  automation/           folder watcher service and rules
  workflow/             multi-step runs over the shared queue
  tools/                metadata and file utilities
  utils/                paths, limits, system info
  commands.rs           IPC surface used by the UI
scripts/                release packaging, notices, dependency checks
```

Architecture and data flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
User guide: [docs/USER-GUIDE.md](docs/USER-GUIDE.md).
Installation: [docs/INSTALLATION.md](docs/INSTALLATION.md).
Development setup and tests: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
Troubleshooting: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).
Security and privacy: [docs/SECURITY-PRIVACY.md](docs/SECURITY-PRIVACY.md), [docs/SECURITY.md](docs/SECURITY.md).
Build, signing and updates: [docs/BUILD.md](docs/BUILD.md).
Release procedure: [docs/RELEASE-PROCESS.md](docs/RELEASE-PROCESS.md).
Dependency inventory: [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).
Known limitations: [docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md).
Phase-by-phase completion evidence: [docs/COMPLETION-REPORT.md](docs/COMPLETION-REPORT.md).

## Licence

Application code © Alok Kumar. Bundled third-party engines keep their own
licences; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and
`resources/licenses/RUST-CRATES.md`.
