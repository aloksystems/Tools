# Security policy

Universal Converter is an offline desktop application. It handles untrusted
files with third-party engines, so file parsing and extraction are the main
attack surface. This document covers reporting, what is in scope, the controls
that exist, and what is still missing.

## Reporting a security issue

There is no public security contact or published GitHub repository yet, so no
address is invented here.

- If the project has a GitHub repository when you read this, use its **private
  vulnerability reporting / security advisory** feature.
- Otherwise, report privately to the person or organization that supplied the
  build. Do not open a public issue with exploit details.
- Include the app version, Windows version, affected engine and format, step-by-
  step reproduction, and a diagnostic report only if it contains nothing
  sensitive. Settings → Diagnostics creates the report locally; nothing is
  uploaded.

Please allow a reasonable period for investigation and a fix before public
disclosure. There is no bug-bounty programme and no promised response time.

## Supported versions

Security fixes target the current 1.0.x line. Older builds receive no updates;
there is no automatic update service yet (see below).

## Scope

In scope:

- Universal Converter's Rust and TypeScript code.
- The IPC surface, Tauri capabilities and CSP.
- File handling, output planning, archive extraction, temporary files and the
  SQLite database.
- Bundled engines (FFmpeg, LibreOffice, 7-Zip, Tesseract, PDFium, qpdf) where
  the issue is reachable through the app or its bundled version.

Out of scope: vulnerabilities that require the user to replace bundled binaries
with malicious copies, Windows or WebView2 issues outside the app, and issues in
user-supplied ImageMagick builds.

## Existing controls

These are properties of the implementation, not aspirations. Tests named in
[ARCHITECTURE.md](ARCHITECTURE.md#security-invariants) exercise most of them.

- **No shell execution.** External tools are spawned with argv, `stdin` null,
  and no console window. Engine lookup uses a configured override, the bundled
  folder, then `env::split_paths` — never a shell PATH search.
- **Bounded subprocesses.** Every sidecar has a timeout and a cancellation token;
  timeout or cancel kills and reaps the child.
- **Sources are never overwritten.** Destination planning refuses any path that
  resolves to an input, even with the overwrite policy.
- **Format detection reads bytes**, not just extensions.
- **Bounded resource use.** Input size, image pixels, extraction size, entry
  count and free disk space are checked before work starts.
- **Archive extraction is staged and re-validated.** Absolute paths, drive
  letters, `..`, control characters, ADS colons, reserved names, links,
  case-insensitive duplicates and file/folder collisions are refused.
- **Outputs are validated.** PDFs are re-opened and page-counted; media is
  signature-checked and probed; documents are re-opened; archive trees are
  listed again. Success is never reported for an unreadable file.
- **Passwords stay in memory.** They are not written to SQLite, presets,
  history, logs, diagnostics or backups. Backup restore rejects secret-shaped
  keys.
- **Database restore is transactional.** A backup is validated before any data is
  changed; a failed restore leaves existing data untouched.
- **Local-only data.** No telemetry, analytics, crash uploader or network code.
  Logs and diagnostics stay local.
- **CSP** is `default-src 'self'` with `object-src 'none'`, `base-uri 'self'` and
  `frame-ancestors 'none'`; the webview has no filesystem access of its own.
- **Tauri capabilities** grant the main window only dialogs, reveal-in-folder,
  notifications and the app's own commands.

## Automated checks and their limits

`.github/workflows/security-audit.yml` runs weekly:

- RustSec `cargo audit` against `Cargo.lock`.
- `npm audit --audit-level=high` against `package-lock.json`.

These detect published advisories in the dependency graph at the versions in the
lockfiles. They do **not** detect logic flaws, unsafe IPC wiring, bundled-engine
vulnerabilities, or unreviewed unsafe code in transitive crates. A green audit is
not a security audit. Manual review is still required for changes that touch
subprocess arguments, file paths, archive extraction, SQL, or password handling.

Result on 2026-11-03 (version 1.0.0): `npm audit --audit-level=high` reported
0 vulnerabilities. `cargo audit` reported 0 vulnerabilities and 7 warnings:
unmaintained `proc-macro-error`, `ttf-parser`, `zbus_names`,
`zvariant`/`zvariant_derive`, the Linux/GTK-only `glib` 0.18.5 unsoundness
advisory, and `async-executor` 1.14.0 marked yanked. None of these were dismissed
as unreachable without checking the dependency chain; they are recorded here so
the next review does not mistake a clean vulnerability count for a complete
audit. The original 1.0.0 audit cleared 7 vulnerabilities in `zip` 2.6.1,
`quick-xml` 0.38.4 and `time` 0.3.45 by upgrading to `zip` 9.2.2,
`quick-xml` 0.42.0 and `time` 0.3.55.

## Known limitations and open risks

- **The 1.0.0 build is unsigned.** SmartScreen may warn and publisher identity is
  not established. Verify SHA-256 checksums from a trusted source.
- **No automatic updater.** Users must install security fixes manually until a
  signed update endpoint exists. Nothing is hosted or claimed.
- **Bundled engines are native code.** LibreOffice, FFmpeg, Tesseract, PDFium,
  qpdf and 7-Zip have their own security histories. They run as separate
  processes with timeouts and isolated profiles, but they are not sandboxed.
- **FFmpeg is a GPLv3 build.** This is a licensing consideration for
  redistribution, documented in `THIRD-PARTY-NOTICES.md`.
- **MD5 and SHA-1** checksums exist for compatibility only and are labelled as
  non-security in the UI. Use SHA-256 or SHA-512 for integrity decisions.
- **Logs may contain local paths and engine error text.** Redact before sharing.
- **User-supplied ImageMagick** is outside the app's control; the app probes it
  and reports its version but cannot verify its build.

## Handling a report

1. Reproduce on a supported Windows build with the same app version.
2. Classify: code, dependency, bundled engine, or documentation.
3. Fix the root cause, add a regression test that uses a real fixture, and keep
   secrets and user paths out of the test.
4. For dependency advisories, assess reachability before upgrading; a blanket
   upgrade is not automatically safer.
5. If bundled engines need replacement, re-run their full suites and update
   versions, licence texts and `THIRD-PARTY-NOTICES.md`.
6. Prepare a PATCH release, update `docs/RELEASE-NOTES.md`, and disclose after a
   fixed build is available. Do not claim a complete audit because scanners pass.
