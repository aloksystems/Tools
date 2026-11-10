# Security and privacy

Universal Converter is offline-first. This document describes what the code
actually does, not a marketing promise. It is not an independent security audit.

## Data handling

- Files are read and written only on this PC. The Rust core contains no network
  client, HTTP call, telemetry or crash upload.
- There is no account, sign-in, cloud conversion or advertising SDK.
- The app does not open converted files automatically and never executes
  extracted archive content.
- Originals are never overwritten. The planner refuses a destination that is the
  source file, whatever the collision policy says.
- History, settings, presets, workflows and automation rules live in
  `%APPDATA%\UniversalConverter\database\converter.db`. Logs rotate at 5 × 10 MB.
- Temporary files are isolated per job under `%APPDATA%\UniversalConverter\temp`
  and removed on success, failure, cancellation and (by default) exit.

## Passwords and secrets

- PDF/archive passwords and OCR-related secrets are held in memory for the job.
- They are sent to the engine through argv, never through a shell.
- Password-shaped keys are removed from job settings before events, history,
  presets or automation logs can see them. Preset import scrubs `password`,
  `secret` and `token` keys recursively.
- Diagnostics never include passwords or file contents.

## Subprocess safety

Every external engine (FFmpeg, FFprobe, LibreOffice, 7-Zip, Tesseract, qpdf) is
spawned with an argument array, `CREATE_NO_WINDOW`, no stdin, bounded output and
a deadline. There is no `cmd /C`, no string-built command line and no shell
expansion. Cancellation kills the child, and partial outputs are deleted.

## File and archive handling

- Input format is detected from magic bytes; an extension mismatch is reported.
- Output is validated before success: signatures, page counts, media streams,
  package structure or text presence depending on the format.
- Archive extraction lists members first, rejects absolute/traversal paths,
  symlinks/hardlinks, case-insensitive duplicates and over-budget archives, then
  extracts into scratch and moves into a new destination. An existing folder is
  never merged into or overwritten.
- Temporary extraction and staging folders are scoped per job.

## Tauri permissions and WEBVIEW

- The capability file grants only native dialogs and
  `opener:allow-reveal-item-in-dir` (opening Explorer at an output). It does not
  grant arbitrary URL/path opening.
- CSP: `default-src 'self'`; inline styles are allowed for the bundled CSS
  runtime; `object-src`, `base-uri`, `form-action` and framing are locked down.
- All custom IPC commands are explicit Tauri commands; there is no eval bridge or
  remote content.

## Diagnostics

Settings → Diagnostics can create a local report plus copies of the current log
files in a folder the user selects. It is never uploaded automatically and
contains no file contents. Logs may contain local paths and engine error text;
review or redact them before sharing.

## Checksums

MD5 and SHA-1 are offered as compatibility checksums only. They are not suitable
for security decisions. SHA-256 and SHA-512 are available for integrity checks.

## Updates and signatures

This build has no live update service. It is unsigned; installers and portable
archives are published with SHA-256 checksums. Do not trust a download whose hash
does not match. Enabling Tauri updater signatures and Windows code signing is
documented in [BUILD.md](BUILD.md).

## Reporting a security issue

No public security contact is configured for this build. Report privately to the
person or organization that supplied it, including the version, a description and
a diagnostic report if it is safe to share. Do not publish exploit details before
the maintainer has had a chance to respond.
