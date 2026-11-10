# Engine drop-in folders

The Rust core finds each external tool in this order (`sidecar::locate`):

1. The path saved in **Settings → Engines → Use a different copy of a tool**. A
   configured path that is wrong reports the engine as missing instead of
   silently falling back to another build.
2. The engine's `UC_*` override variable (see the table), if it points at a real file.
3. Bundled next to the app: walking up from the running executable, each level is
   checked for `resources/<folder>/<tool>.exe`, `binaries/<folder>/<tool>.exe`
   and `../../resources/<folder>/<tool>.exe`.
4. Anywhere on `PATH`, matched with `env::split_paths` — never a shell lookup.

PDFium is a DLL loaded into this process rather than an executable, so it uses
`sidecar::locate_library`: the Settings path, then `UC_PDFIUM_PATH`, then
`resources/pdfium/pdfium.dll`, then `PATH`.

Tesseract language data follows the same idea: the Settings OCR-languages folder,
then `UC_TESSDATA_PREFIX`, then the `tessdata` folder beside `tesseract.exe`, then
`TESSDATA_PREFIX`.

Re-run **Settings → Engines → Re-scan** (or restart the app) after adding a tool;
probes are cached so the app does not re-shell on every job.

| Folder | Tool | Payload looked for | Override variable | Status |
| --- | --- | --- | --- | --- |
| `pdfium/` | PDFium | `pdfium.dll` | `UC_PDFIUM_PATH` | **Bundled and wired** — PDF → images, page previews, Studio thumbnails |
| `qpdf/` | qpdf | `qpdf.exe` | `UC_QPDF_PATH` | **Bundled and wired** — merge, reorder, compress, set/remove password |
| `imagemagick/` | ImageMagick | `magick.exe` | `UC_IMAGEMAGICK_PATH` | wired — adds AVIF, HEIC, SVG |
| `ffmpeg/` | FFmpeg + ffprobe | `ffmpeg.exe`, `ffprobe.exe` | `UC_FFMPEG_PATH`, `UC_FFPROBE_PATH` | **Bundled and wired** — audio/video conversion, ffprobe inspection, thumbnails, GIF |
| `libreoffice/` | LibreOffice | `program/soffice.com` | `UC_LIBREOFFICE_PATH` | **Bundled and wired** — document, spreadsheet and presentation conversion |
| `7zip/` | 7-Zip | `7z.exe` | `UC_7ZIP_PATH` | **Bundled and wired** — archive creation, inspection, extraction and repacking |
| `tesseract/` | Tesseract OCR | `tesseract.exe` + `tessdata/` | `UC_TESSERACT_PATH`, `UC_TESSDATA_PREFIX` | **Bundled and wired** — OCR Studio and the OCR automation mode |
| `licenses/` | — | — | — | third-party notices, including generated Rust crate licences |

## Bundled PDF dependencies

| Tool | Version | Licence | Files |
| --- | --- | --- | --- |
| PDFium | Chromium PDFium **158.0.8125** (build `MAJOR=158 MINOR=0 BUILD=8125`) | BSD-3-Clause-style Chromium licence | `pdfium.dll`, `LICENSE`, `VERSION` |
| qpdf | **12.4.2** | Apache-2.0 | `qpdf.exe`, `qpdf30.dll`, MSVC runtime DLLs, `LICENSE.html` |

## Bundled media dependency

| Tool | Version | Licence | Files |
| --- | --- | --- | --- |
| FFmpeg / ffprobe | **n9.0.2-42-gd7643a0fe3-20261101** (BtbN 9.0 GPL build, 2026-11-01) | GPLv3 (`--enable-gpl --enable-version3`) | `ffmpeg.exe`, `ffprobe.exe`, `LICENSE.txt`, `README.md` |

Provenance, SHA-256 hashes and the exact encoder list are in
[`ffmpeg/README.md`](ffmpeg/README.md). Both binaries are required: conversion
uses `ffmpeg`, and every output is re-opened with `ffprobe` before the job is
allowed to report success.

## Bundled document dependency

| Tool | Version | Licence | Files |
| --- | --- | --- | --- |
| LibreOffice | **25.8.7.3** (`30742500f2d3eb4366ac312fa33d3dcabdb3eba5`) | MPL-2.0, with LGPL-3.0 components; full text in `LICENSE.html` | `program/soffice.com`, `program/`, `share/`, `presets/`, `Fonts/`, `System/`, `System64/`, `LICENSE.html`, `license.txt` |

`soffice.com` is the console launcher; it runs headless and never opens a window.
The engine always passes an isolated `-env:UserInstallation=file:///...` profile
inside the job's scratch folder, so the app never touches the user's own
LibreOffice profile. `UC_LIBREOFFICE_PATH` must point at `soffice.com` (or
`soffice.exe` if copying a normal installation).

## Bundled archive dependency

| Tool | Version | Licence | Files |
| --- | --- | --- | --- |
| 7-Zip | **26.05 (x64)** | LGPL-2.1-or-later; `7z.dll` also contains code under the unRAR restriction and BSD-2/3-clause terms — see `License.txt` | `7z.exe`, `7z.dll`, `License.txt`, `readme.txt`, `History.txt`, `Fonts/` |

`UC_7ZIP_PATH` must point at `7z.exe`. The engine only uses the CLI (`l`, `a`,
`x`, `t`) with argv, including `-sccUTF-8` for listings and `-bsp1` for progress.

## Bundled OCR dependency

| Tool | Version | Licence | Files |
| --- | --- | --- | --- |
| Tesseract OCR | 5.x portable Windows build | Apache-2.0 | `tesseract.exe`, `libtesseract-5.dll`, Leptonica and image libraries, `tessdata/` (`eng`, `osd`), `LICENSE` |

The OCR engine asks Tesseract for its installed languages (`--list-langs`) and
only offers those in the UI. Every page is rendered to a temporary image, OCR'd
with an explicit `--tessdata-dir`, and the text or searchable PDF is validated
before the job settles. The batch password field is not used for OCR.

## Bundled licence texts

`resources/licenses/RUST-CRATES.md` is generated from Cargo metadata with
`npm run notices` and reproduces the licence of every crate linked into the
Windows binary. The engine folders also carry their upstream licence files. The
curated summary is [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md).

`src-tauri/tauri.conf.json` maps all six engine folders and the licence texts into
the packaged app under `resources/`, so an installer carries them without
requiring anything on the developer's machine. During development the same files
are found by walking up from `target/debug/`.

If a dependency is missing, the page does not pretend otherwise:
`pdf_capabilities`, the document engine probe and `archive_capabilities` mark the
affected work unavailable, name the missing tool, and disable the submit button.
The native lopdf operations (images → PDF, split/extract, rotate, metadata) keep
working without either PDF dependency, and an absent LibreOffice or 7-Zip only
removes its own formats.

Nothing here is downloaded automatically, and no folder is required for the
built-in image engine — JPEG, PNG, WebP, BMP, TIFF, GIF and ICO convert with no
external tool at all.
