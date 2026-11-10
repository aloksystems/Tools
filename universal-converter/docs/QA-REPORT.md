# QA report — Universal Converter 1.0.0

Date: 2026-11-02. This report records what was executed, on which machine, and
what was not tested. A feature is only marked PASS where there is evidence from a
real run.

## Environment

| Item | Value |
| --- | --- |
| OS | Windows 10 Pro 22H2, version 10.0.19045, 64-bit |
| CPU | Intel Core i7-10510U, 4 cores / 8 threads, 1.80 GHz |
| RAM | 7.8 GB |
| GPU | Intel UHD Graphics |
| WebView2 Runtime | 156.0.4314.58 |
| Rust | stable 1.99.1, `x86_64-pc-windows-msvc` |
| Node.js / npm | 24.21.0 / bundled npm |
| Application | 1.0.0 (test and release builds) |

Windows 11 was **not** available on this machine and was not tested. ARM64 and
32-bit Windows were not tested; no such builds are produced.

## Result summary

| Area | Status | Evidence |
| --- | --- | --- |
| Rust test suite | **PASS** | 258 passed, 0 failed, 0 ignored (237.27 s on the shipped lockfile) |
| Rust formatting | **PASS** | `cargo fmt --check` clean |
| Rust lints | **PASS** | `cargo clippy --all-targets -- -D warnings` clean |
| Frontend lint | **PASS (warnings)** | oxlint: 0 errors, 24 warnings |
| Frontend production build | **PASS** | `tsc -b && vite build` |
| npm security audit | **PASS** | 0 vulnerabilities (`--audit-level=high`) |
| Rust security audit | **PASS (warnings)** | 0 vulnerabilities; 6 unmaintained/unsound warnings after upgrades |
| UI keyboard and semantics | **PASS (browser)** | keyboard shortcuts, palette, skip link, tab order, roles, contrast measured |
| Native Windows integrations | **PARTIAL** | tray icon initialised and single-instance hand-off verified on the packaged build; HKCU menu and toasts not exercised |
| Installer execution | **NOT TESTED** | installer built and inspected, not installed (no authorization to change the machine) |
| Packaged app launch | **PASS** | portable build launched and exited cleanly, see release build section |
| Windows 11 compatibility | **NOT TESTED** | no hardware |
| Screen-reader usability | **NOT TESTED** | no NVDA/Narrator session |
| Auto-update | **NOT APPLICABLE** | no updater implemented or configured |

## Automated tests

Command: `cd src-tauri && cargo test`. All tests use real files and real engines;
there are no mocked conversions.

| Suite | Status | What it proves |
| --- | --- | --- |
| Image engine | PASS | JPEG/PNG/WebP/BMP/TIFF/GIF/ICO conversion, resize, recompress, metadata strip; outputs re-read with the image decoder |
| PDF engine (lopdf/PDFium/qpdf) | PASS | Images → PDF, render PDF pages, extract text, merge, split, rotate, reorder, compress (refuses fake wins), metadata, password add/verify/remove; page counts and signatures re-checked |
| Audio/video engine (FFmpeg) | PASS | WAV → MP3/FLAC, MP3 → WAV, MP4 → WebM/MKV/MP4/GIF, trim, audio extraction, bitrate/sample-rate settings; every output re-probed for container, codec, streams |
| Media failure paths | PASS | corrupt input refused, wrong stream/trim refused before encoding, cancel writes nothing, timeout kills and reaps the child |
| Document engine (LibreOffice) | PASS | DOCX/XLSX/PPTX/TXT/HTML → PDF/ODT/ODS/ODP/CSV/RTF, page range, sheet listing; outputs reopened (PDF pages, ODF mimetype, text content) |
| Archive engine (7-Zip) | PASS | ZIP/7Z/TAR/TAR.GZ/TAR.BZ2/TAR.XZ create/extract/repack, folder trees, selected entries, AES-256 and encrypted headers; traversal, absolute paths, symlinks, duplicates, bomb and malformed fixtures refused; cancel leaves no destination |
| OCR engine (Tesseract) | PASS | Real image → UTF-8 text, scanned PDF → text per selected page, searchable PDF page count, missing language pack named with setup instructions, cancel before Tesseract runs |
| Advanced tools | PASS | Metadata read/edit/remove verified by re-reading; hashes; duplicate and size reports; file/image/metadata comparisons; signature checks |
| Queue and recovery | PASS | Submit/cancel/retry, engine-unavailable path, worker gates, crash-left `pending_jobs` become visible interrupted failures and are not restarted |
| Workflows | PASS | Two-step workflow produces the final format and cleans scratch; invalid names, too many steps and secrets refused |
| Database and backup | PASS | Presets/history/settings/favorites round-trip; backup bundle exports and restores every section in one transaction; corrupted and foreign backups refused without touching data; pending jobs drained once |
| Output planning | PASS | Source file can never be overwritten, same-format self-clobber refused, rename/overwrite/skip policies, typed names cannot escape the folder, extraction cannot target the archive |
| System limits | PASS | Input size, image pixels, free space, extraction size/count; concurrency suggestion plausible |

Totals: **258 executed, 258 passed, 0 failed, 0 ignored**. A first full run under
heavy parallel load (a concurrent Rust build) produced 257 passes and one
LibreOffice test timeout; the test passed in isolation in 32.23 s and the clean
full rerun passed all 258. No test was skipped or weakened.
## Manual UI verification

The React UI was loaded through Vite in a Chromium-based browser (UI-only mode;
the app deliberately reports that the Rust backend is absent). This verifies the
interface, not the native shell.

| Check | Status | Observation |
| --- | --- | --- |
| All routes render | PASS | Home, Quick, seven format pages, Tools, Automation, Workflows, Presets, Queue, History, Settings |
| Graceful no-backend state | PASS | Home explains conversions need `npm run tauri dev`; controls that need IPC are disabled; no crash or blank screen |
| Skip link | PASS | First Tab stop is “Skip to content” targeting `#main-content` |
| Tab order | PASS | Skip link → navigation links in visual order |
| Command palette | PASS | Ctrl+K opens a focused combobox with listbox results; Esc closes |
| Keyboard shortcuts | PASS | F1 opens the shortcut list; Ctrl+, opens Settings; Ctrl+Shift+Q opens Queue |
| ARIA semantics | PASS | Navigation, tabs (Queue), slider, switch, combobox, listbox and dialog labels present |
| Contrast | PASS | Measured body/muted text against background: dark 16.41:1 / 6.76:1; light 16.11:1 / 4.78:1 (WCAG AA normal text needs 4.5:1) |
| Reduced motion / forced colors | PASS (code) | `prefers-reduced-motion` and `forced-colors` rules present; not exercised with OS settings |
| Backup & restore card | PASS (render) | Export and restore controls render with explanation; execution requires the backend |
| Light/dark theme | PASS (code) | Both token sets present and contrast sampled; switching through Settings was not exercised with the backend |

Not tested in this session: native drag-and-drop, file dialogs, tray menu
interaction, notifications, Explorer context menu/Open With, backup and restore
through the real dialogs, screen-reader output, and the minimum window size
layout.

## Packaged first-run verification

The release binary was launched with an empty app-data folder. Windows UI
Automation found the “Start using Universal Converter” button six seconds after
the window appeared, and a screen capture confirmed the dialog contents:

- Version 1.0.0, Windows 10 Pro x86_64.
- 6 of 7 engines ready; ImageMagick listed as optional and missing.
- Privacy summary (local conversion, no account/telemetry, originals are never
  overwritten) and the data folder path.
- Output destination choices and the Start button.

Invoking the Start button through UI Automation dismissed the dialog and wrote
`welcomeCompleted = true` to SQLite. The original app-data folder was restored
afterward; it passes `PRAGMA integrity_check`.

## Bugs found, fixed and retested

| # | Problem | Root cause | Fix | Retest |
| --- | --- | --- | --- | --- |
| 1 | 8 OCR tests failed with “No OCR language packs were found” | Tauri resource globs flattened `tesseract/tessdata/*` into `tesseract/`, so Tesseract could not find `eng.traineddata` | `bundle.resources` now maps each engine directory, preserving nested layouts | All OCR/manager tests pass; packaged resource layout checked |
| 2 | Backup restore failed to decode formats and favorites | Enum values were serialized as quoted JSON while SQLite stores the bare code | Restore writes `code_of(...)` for enum columns | 14 database/backup tests pass |
| 3 | 7 dependency advisories (`zip` 2.6.1, `quick-xml` 0.38.4, `time` 0.3.45) | Stale transitive versions | Upgraded to `zip` 9.2.2, `quick-xml` 0.42.0, `time` 0.3.55; MSRV raised to 1.88 | `cargo audit` reports 0 vulnerabilities; full suite passes |
| 4 | Clippy errors after the MSRV increase | MSRV-gated `collapsible_if` and chunk lints became active | Applied the compiler-verified suggestions, formatted, re-linted | Clippy clean with `-D warnings` |
| 5 | One document test timed out | Concurrent Rust build and LibreOffice jobs on an 8 GB machine | No product change; rerun alone and then as a clean full suite | PASS in 32.23 s isolated, full suite PASS |
| 6 | `npm run tauri build` refused to start: “Found version mismatched Tauri packages” | The JavaScript notification plugin was 2.8.0 while the Rust crate was pinned to 2.4.0; aligning the crate pulled `tauri` 2.12.5, which then mismatched `@tauri-apps/api` 2.11.1 | Raised `tauri-plugin-notification` to 2.8.0 and `@tauri-apps/api` to 2.12.4 | frontend build/lint, `cargo check --all-targets`, full 258-test suite and the packaged build all pass |

## Performance observations

- Full test suite: 237.27 s when run alone on the final lockfile; 538.27 s when
  competing with a Rust build and a package install. Document tests depend on
  LibreOffice startup and are the slowest part.
- The queue runs standard and heavy jobs on separate gates; media tests confirm
  audio extraction is not treated as a heavy video encode.
- No frame-rate, throughput or large-file benchmark was performed. The suite
  proves correctness and bounds, not speed on low-end hardware.

## Security testing

- Source protection, path traversal, archive bombs, symlinks, duplicates,
  malformed archives, encrypted PDF handling and secret scrubbing are covered by
  tests listed above.
- MD5/SHA-1 are labelled legacy and non-security; SHA-256/SHA-512 are available.
- `npm audit` found 0 vulnerabilities.
- `cargo audit` found 0 vulnerabilities after the upgrades; 6 warnings remain
  (unmaintained crates and one Linux/GTK-only unsoundness). They are recorded in
  [SECURITY.md](SECURITY.md) and are not claimed to be a full audit.
- The release is unsigned and has no updater; checksums are the integrity control
  until signing infrastructure exists.

## Platform compatibility

| Platform | Status |
| --- | --- |
| Windows 10 x64 19045 | Tested (automated suite + browser UI) |
| Windows 11 x64 | Not tested |
| Windows 10/11 ARM64 | Not applicable — no build produced |
| Windows 32-bit | Not applicable — no build produced |

## Remaining limitations

- Tray initialisation was confirmed from the packaged build's log, and
  single-instance hand-off was exercised. Completion toasts, HKCU context-menu
  entries/Open With and the installer's own wizard were not manually exercised.
- The installer was inspected but not installed, to avoid changing the machine
  without authorization.
- Screen-reader output and high-contrast mode were not tested with OS assistive
  technology.
- The update system does not exist; this is documented rather than faked.
- Engine integration tests need the ~2 GB payload and do not run on a plain
  GitHub-hosted runner.

## Release build verification

Built on 2026-11-02 from version 1.0.0 with `npm run tauri build`, then
`node scripts/package-release.mjs`.

| Check | Status | Evidence |
| --- | --- | --- |
| `npm run tauri build` completes | **PASS** | release profile compiled in 17m 35s; NSIS bundling completed |
| NSIS installer produced | **PASS** | `Universal Converter_1.0.0_x64-setup.exe`, 604.8 MiB (634,155,465 bytes) |
| Portable ZIP produced | **PASS** | `Universal-Converter-Portable-1.0.0.zip`, 647.2 MiB (678,590,455 bytes); extracted size 2.0 GB |
| SHA-256 checksums match | **PASS** | `sha256sum -c checksums.txt` reports OK for both artifacts |
| Packaged resources include `tesseract/tessdata/eng.traineddata` | **PASS** | listed in both the NSIS archive and the portable ZIP at `resources\tesseract\tessdata\eng.traineddata` (4,113,088 bytes) |
| Packaged app launches | **PASS** | portable copy extracted to a temp folder; window titled “Universal Converter” appeared; log recorded storage ready, engines and queue initialised, tray icon ready |
| Single-instance hand-off | **PASS** | a second launch exited with code 0 while exactly one process remained |
| Installer contents/version metadata | **PASS (inspection only)** | 7-Zip lists FFmpeg, ffprobe, 7-Zip, LibreOffice, Tesseract, PDFium and qpdf; FileVersion and ProductVersion 1.0.0; signature NotSigned; installer was not executed |

Artifact checksums:

```
844cbbe90a395167053a56bc31e91ed6ed11ecb9f5f9fe65b7805b311b0347f8  Universal-Converter-Setup-1.0.0.exe
ba5ab5849a7288d2920cbf3db0dc89764b5b7b6b71133bca5fc1f39c04f9c30d  Universal-Converter-Portable-1.0.0.zip
```

The installer was not run because installing changes the machine and no
interactive authorization was given for that step. Tray interaction, toasts,
HKCU context-menu entries and the installer's own wizard therefore remain
unexercised.
