# Dependency inventory

Last reviewed: 2026-11-02 for version 1.0.0. Exact resolved versions are in
`package-lock.json` and `src-tauri/Cargo.lock`; this file lists the direct
dependencies and the bundled engines with their purpose, licence and update
policy.

## Policy

- Prefer the standard library and existing crates over new dependencies.
- Updates are deliberate: read the changelog, run the full test suite and smoke
  test the affected feature. Do not bulk-upgrade before a release.
- `Cargo.lock` and `package-lock.json` are committed and are the build pins.
  `Cargo.toml` ranges are constrained at least to the tested minor version.
- Security advisories are checked weekly by `security-audit.yml` and before a
  release. An advisory does not automatically justify an untested upgrade; assess
  reachability first.
- Do not add analytics, crash-reporting, telemetry or network dependencies.
- Regenerate `resources/licenses/RUST-CRATES.md` with `npm run notices` after a
  Rust dependency change and update `THIRD-PARTY-NOTICES.md` for engines.

## Frontend (npm)

| Package | Version | Purpose | Licence |
| --- | --- | --- | --- |
| `react`, `react-dom` | 19.3.1 | UI runtime | MIT |
| `react-router-dom` | 7.18.5 | Hash routing | MIT |
| `zustand` | 5.0.16 | Application state | MIT |
| `@tauri-apps/api` | 2.12.4 | Typed IPC and events | MIT / Apache-2.0 |
| `@tauri-apps/plugin-dialog` | 2.7.3 | Native open/save dialogs | MIT / Apache-2.0 |
| `@tauri-apps/plugin-opener` | 2.5.5 | Reveal output in Explorer | MIT / Apache-2.0 |
| `@tauri-apps/plugin-notification` | 2.8.0 | Native completion notifications | MIT / Apache-2.0 |
| `@radix-ui/react-*` | 1.2–2.4 | Accessible UI primitives | MIT |
| `lucide-react` | 1.66.0 | Icons | ISC |
| `class-variance-authority` | 0.7.1 | Component variants | Apache-2.0 |
| `clsx`, `tailwind-merge` | 2.1.1 / 3.7.0 | Class composition | MIT |
| `tailwindcss`, `@tailwindcss/vite` | 4.3.3 | Styling | MIT |
| `vite` | 8.3.5 | Frontend build | MIT |
| `@vitejs/plugin-react` | 6.1.2 | React transform | MIT |
| `typescript` | 7.0.2 | Type checking | Apache-2.0 |
| `oxlint` | 1.90.0 | Frontend lint | MIT |
| `@tauri-apps/cli` | 2.12.4 | Tauri build/dev CLI | MIT / Apache-2.0 |

## Rust (direct crates)

| Crate | Version | Purpose | Licence |
| --- | --- | --- | --- |
| `tauri` | 2.12.5 (`tray-icon`) | Application shell, IPC, tray | MIT / Apache-2.0 |
| `tauri-build` | 2.7.4 | Build script | MIT / Apache-2.0 |
| `tauri-plugin-dialog` | 2.7.3 | File dialogs | MIT / Apache-2.0 |
| `tauri-plugin-log` | 2.9.2 | Rotating local logs | MIT / Apache-2.0 |
| `tauri-plugin-opener` | 2.5.5 | Reveal in Explorer | MIT / Apache-2.0 |
| `tauri-plugin-single-instance` | 2.4.5 | One running instance, file hand-off | MIT / Apache-2.0 |
| `tauri-plugin-notification` | 2.8.0 | Windows toast notifications | MIT / Apache-2.0 |
| `rusqlite` (bundled) | 0.40.2 | SQLite; bundled SQLite 3 via `libsqlite3-sys` 0.38.2 | MIT |
| `serde`, `serde_json` | 1.0.229 / 1.0.154 | Wire and database JSON | MIT / Apache-2.0 |
| `image` | 0.25.9 | In-process raster engine (JPEG/PNG/WebP/BMP/TIFF/GIF/ICO only) | MIT / Apache-2.0 / Zlib |
| `lopdf` | 0.42.0 | Pure-Rust PDF reading/writing | MIT |
| `pdfium-render` | 0.9.5 | PDF rendering and previews via bundled PDFium | MIT / Apache-2.0 |
| `zip` | 9.2.2 | ZIP reading (OOXML package checks, metadata) and test fixtures; the app never calls its extraction helpers | MIT |
| `tar` | 0.4.44 (dev) | TAR fixtures in tests | MIT / Apache-2.0 |
| `kamadak-exif` | 0.6.1 | EXIF read/write | BSD-2-Clause |
| `ab_glyph` | 0.2.29 | Text rendering in tools | Apache-2.0 |
| `base64` | 0.22.1 | Data URI previews | MIT / Apache-2.0 |
| `digest`, `md-5`, `sha1`, `sha2` | 0.10.7 / 0.10.6 / 0.10.6 / 0.10.9 | Checksums | MIT / Apache-2.0 |
| `notify` | 8.2.1 | Folder watching for automation | CC0-1.0 |
| `sysinfo` | 0.36.1 | Memory/CPU-aware concurrency | MIT |
| `uuid` | 1.26.1 | Job and scratch identifiers | MIT / Apache-2.0 |
| `thiserror` | 2.0.21 | Error types | MIT / Apache-2.0 |
| `log` | 0.4.35 | Logging facade | MIT / Apache-2.0 |
| `winreg` | 0.56 | HKCU context-menu entries | MIT |

The complete licence texts for the statically linked dependency tree are
generated into [`resources/licenses/RUST-CRATES.md`](../resources/licenses/RUST-CRATES.md)
by `npm run notices`.

## Bundled engines

These are separate processes, not linked code. Versions are the ones actually in
`resources/` for 1.0.0.

| Engine | Version | Status | Formats / role | Licence |
| --- | --- | --- | --- | --- |
| FFmpeg / ffprobe | n9.0.2-42-gd7643a0fe3-20261101 (BtbN GPL build) | Required for audio/video; bundled | Audio/video conversion, probe, previews, GIF | GPLv3 (`--enable-gpl --enable-version3`) |
| LibreOffice | 25.8.7.3 | Required for documents; bundled | Office document conversion, sheets | MPL-2.0 and LGPL-3.0 components |
| 7-Zip | 26.05 | Required for archives; bundled | Archive create/list/extract, portable ZIP | LGPL-2.1-or-later; `7z.dll` includes unRAR-restricted and BSD code |
| Tesseract OCR | 5.4.0.20240606 | Required for OCR; bundled | Image/PDF OCR, searchable PDF | Apache-2.0 |
| PDFium | 158.0.8125 | Required for PDF rendering; bundled | Page rendering, thumbnails, previews | BSD-3-Clause-style Chromium licence |
| qpdf | 12.4.2 | Required for PDF security/compression; bundled | Password set/remove, compression | Apache-2.0 |
| ImageMagick | — | **Optional, not bundled** | AVIF/HEIC/SVG input when the user supplies `magick.exe` | ImageMagick licence (user-supplied) |

The FFmpeg GPL build is distributed unchanged and invoked as a separate process.
Redistributors must keep its GPL terms in mind. Licence texts ship under
`resources/*/LICENSE*` and are installed with the app.

## Runtime and build toolchain

| Component | Version used for 1.0.0 | Notes |
| --- | --- | --- |
| Windows | 10 build 19045 x64 (tested); 11 expected | No ARM64 build |
| WebView2 | Evergreen runtime | Required by Tauri; bootstrapped by installer if absent |
| Rust | stable 1.99.1, MSVC target | Manifest minimum is 1.88 (required by `zip` 9) |
| Node.js / npm | 24.21.0 / bundled npm | Node 20+ supported |
| NSIS | Tauri's bundled NSIS | Per-user installer, no admin rights |

## Update checks

```bash
npm outdated
npm audit --audit-level=high
cd src-tauri && cargo audit          # requires cargo-audit
npm run notices                      # refresh crate licence inventory
```

`security-audit.yml` runs the advisory checks weekly. Their limits are real:
they flag known advisories in declared dependency versions, not logic flaws,
misconfiguration or vulnerabilities in bundled native engines. A clean audit is
not a security review.

## Deferred updates (reviewed 2026-11-02)

The Tauri JavaScript packages were moved to 2.12.4 and the notification crate to
2.8.0 during release engineering, because Tauri's build-time version check
requires the major/minor of each JavaScript package to match its Rust crate.
`npm outdated` still reports newer versions for these direct packages. They were
not taken before 1.0.0 because none had been compatibility-tested with this
build:

| Package | Installed | Available |
| --- | --- | --- |
| `@tauri-apps/plugin-dialog` | 2.7.3 | 2.8.4 |
| `@tauri-apps/plugin-opener` | 2.5.5 | 2.7.2 |
| `@vitejs/plugin-react` | 6.1.2 | 6.2.1 |
| `@types/node` | 24.19.2 | 26.6.6 |

The Tauri JavaScript packages must stay compatible with the Rust `tauri` crate
and the Tauri CLI; update them together, then run the full suite and a packaged
build. Type packages may jump major versions without runtime impact, but that is
a reason to test, not a reason to skip testing.

## Known dependency risks

- The bundled FFmpeg build is large and GPLv3; replacing it with a smaller build
  changes which codecs are available and must be re-tested.
- LibreOffice and Tesseract are third-party native code with their own security
  history. They are invoked with argv, bounded timeouts and isolated profiles,
  but they are not sandboxed beyond that.
- Tesseract data files must remain in a `tessdata/` subdirectory. Flattening the
  resource mapping silently breaks OCR.
- ImageMagick is optional and user-supplied; the app cannot validate its build or
  licence. It is probed and reported like any other engine.
