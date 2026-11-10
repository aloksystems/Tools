# Development

How to set up, build, test and extend Universal Converter without breaking its
offline and safety guarantees. Architecture details live in
[ARCHITECTURE.md](ARCHITECTURE.md); build and signing details live in
[BUILD.md](BUILD.md).

## Prerequisites

- Windows 10 or 11, 64-bit.
- Node.js 20 or newer and npm (the lockfile is committed; use `npm ci`).
- Rust stable with the `x86_64-pc-windows-msvc` target.
- Visual Studio Build Tools with the C++ workload and Windows SDK.
- WebView2 Runtime (installed on current Windows 10/11; the installer bootstraps
  it when missing).
- The engine payload in `resources/`: PDFium, qpdf, FFmpeg/ffprobe, LibreOffice,
  7-Zip and Tesseract with `tessdata/eng.traineddata`.

`resources/` is roughly 2 GB and is not stored in the repository. A fresh clone
must obtain the payload before running the engine tests or building an installer.
The application still compiles without it; engines simply probe as unavailable.

## Setup and commands

```bash
npm ci
npm run tauri dev          # Rust core + Vite on http://localhost:1420
npm run dev                # UI only, conversions disabled by design
```

| Command | What it does |
| --- | --- |
| `npm run lint` | oxlint over the frontend |
| `npm run build` | `tsc -b` then the Vite production build |
| `npm run check:versions` | Verifies `package.json`, `Cargo.toml` and `tauri.conf.json` agree |
| `npm run notices` | Regenerates `resources/licenses/RUST-CRATES.md` from Cargo metadata |
| `npm run package:release` | Assembles `release/` from a real `tauri build` output |
| `npm run release:build` | `tauri build` followed by packaging |
| `cd src-tauri && cargo check --all-targets` | Rust type/borrow check |
| `cd src-tauri && cargo clippy --all-targets` | Rust lints (CI runs with `-D warnings`) |
| `cd src-tauri && cargo fmt --check` | Formatting check |
| `cd src-tauri && cargo test` | Full suite, including real engine work |

The full suite launches LibreOffice, FFmpeg, 7-Zip, PDFium, qpdf and Tesseract.
On a warm build it takes several minutes; the first LibreOffice job is slower.
Tests write fixtures and outputs under the system temp directory, never into
`resources/` or the database of an installed copy.

## Repository layout

```
src/                     React UI (pages, features, components, stores, hooks)
src-tauri/src/
  core/                  registry, format detection, job model, planner, settings
  engines/               one module per backend, plus sidecar spawn/timeout helpers
  queue/                 worker pool, cancellation, progress events
  database/              SQLite schema, queries, backup/restore
  automation/            folder watcher and rules
  workflow/              multi-step runs over the shared queue
  tools/                 metadata and file utilities
  utils/                 paths, limits, system info
  commands.rs            IPC surface used by the UI
scripts/                 version check, notices, release packaging
resources/               bundled engines and licence texts (not in git)
docs/                    user, build, architecture and phase documentation
```

## Tests

- **No mocked engines.** Tests build real files and re-open every output. A test
  that cannot find its engine fails; it does not silently pass.
- **Do not skip, weaken or delete a test** to make a build green. Fix the cause.
- **Add a fixture when adding a format.** Validate the produced file by reading it
  back (page count, container/stream, archive listing, metadata), not only by
  checking that a file exists.
- **Security tests are fixtures, not descriptions.** Traversal, symlink, duplicate
  and expansion-bomb archives are real files.
- **Keep secrets out of fixtures and logs.** Passwords travel only in memory.
- Targeted runs are fine while iterating, for example:

```bash
cd src-tauri
cargo test engines::ocr::tests:: -- --nocapture
cargo test core::manager::tests::
cargo test database::tests::
```

Run the full suite before a release.

## Continuous integration

Workflows live in `.github/workflows/`:

| Workflow | Trigger | Scope |
| --- | --- | --- |
| `ci.yml` | push to `main`, pull request, manual | Frontend lint/build, version check, Rust fmt/clippy/test compilation on hosted Windows runners; full engine tests on a self-hosted runner when requested |
| `release-build.yml` | manual only | Full tests, NSIS build, portable package, checksums; uploads artifacts, publishes nothing |
| `security-audit.yml` | weekly schedule, manual | RustSec advisory check and `npm audit --audit-level=high` |

The hosted jobs cannot run engine integration tests because the payload is not in
the repository. Register a runner with the labels `self-hosted`, `windows`, `x64`
and `engine-payload`, with `resources/` populated, to run them. This is a real
requirement, not a hidden skip: `release-build.yml` refuses to start without the
payload and runs the full suite before building.

Actions are referenced by supported major tags; no secret is printed and no
workflow publishes a release automatically.

## Adding an engine or a format

Follow [ARCHITECTURE.md](ARCHITECTURE.md#adding-an-engine):

1. Implement `ConversionEngine` (`id`, `probe`, `convert`) and keep it free of
   Tauri and SQLite imports.
2. Register it in the engine list used by the manager.
3. Add `FormatCapability` rows and routes to the registry; order encodes
   preference.
4. Add a settings type and UI panel only when the engine has real options.
5. Add a probe message that names the missing dependency and the setup step.
6. Add real fixture tests and a validation step that re-reads the output.
7. If the engine is a sidecar, locate it through `engines::sidecar` and pass argv
   only — never a shell command string.

Optional tools must probe unavailable when absent. Never advertise a route that
the engine cannot perform.

## Coding rules

- Keep the app offline-first. No telemetry, no automatic uploads and no network
  code in engines.
- Never overwrite a source file. Output planning refuses a destination that
  resolves to an input, even with the overwrite policy.
- Spawn external tools with argv, bounded timeouts and cancellation; capture
  stderr for the error message.
- Passwords and secret-shaped settings must not reach SQLite, presets, history,
  logs or diagnostics. `SecretString` is not serialisable on purpose.
- Mark a job successful only after the output has been validated. A partial file
  is not a result.
- Keep archive extraction staged and validated before publishing.
- Keep temporary work inside the app temp directory or a hidden sibling, and
  clean it up on success, failure, cancellation and exit.
- Do not add a dependency for something the standard library or an existing
  crate already does.

## Debugging

- Logs: `%APPDATA%\UniversalConverter\logs\universal-converter.log` (rotating,
  5 × 10 MB).
- Settings → Diagnostics exports a local report and log copies. Nothing is
  uploaded.
- Settings → Engines shows live probe results, versions and explicit paths.
- Environment overrides for development: `UC_FFMPEG_PATH`, `UC_FFPROBE_PATH`,
  `UC_LIBREOFFICE_PATH`, `UC_7ZIP_PATH`, `UC_TESSERACT_PATH`,
  `UC_TESSDATA_PREFIX`, `UC_PDFIUM_PATH`, `UC_QPDF_PATH`. A configured path that
  is wrong does not fall back to another build; the probe reports the failure.
- OCR failures usually mean `resources/tesseract/tessdata/eng.traineddata` is
  missing. The resource mapping must preserve the `tessdata/` directory; a flat
  copy breaks Tesseract.

## Versioning and releases

Version changes are mechanical but must be consistent. See
[RELEASE-PROCESS.md](RELEASE-PROCESS.md) for the checklist and
[DEPENDENCIES.md](DEPENDENCIES.md) for the update policy.
