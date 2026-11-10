# Architecture

How Universal Converter is put together, why each seam is where it is, and what to
touch to add a format or an engine. Everything here describes the code as it
exists in this repository, not as it is planned.

- [Shape of the system](#shape-of-the-system)
- [One conversion, start to finish](#one-conversion-start-to-finish)
- [Backend modules](#backend-modules)
- [Frontend modules](#frontend-modules)
- [The engine seam](#the-engine-seam)
- [Format registry](#format-registry)
- [Queue and concurrency](#queue-and-concurrency)
- [Events and progress](#events-and-progress)
- [Storage and SQLite](#storage-and-sqlite)
- [Security invariants](#security-invariants)
- [Error model](#error-model)
- [Honest degradation](#honest-degradation)
- [Adding an engine](#adding-an-engine)
- [Adding a format or a route](#adding-a-format-or-a-route)
- [Verification](#verification)
- [Build and packaging](#build-and-packaging)

## Shape of the system

Four layers, and each one only knows about the layer directly below it.

```
React UI  (src/)
   │  invoke(name, args)  ·  conversion://job events
   ▼
IPC commands  (src-tauri/src/commands.rs)      32 commands, the whole surface
   │
   ▼
Planner  (core/manager.rs)  ──  Registry  (core/registry.rs)
   │                              Detection (core/format.rs)
   ▼                              Output plan (utils/paths.rs)
Queue  (queue/pool.rs)  ──events──▶  JobEmitter (queue/events.rs)
   │
   ▼
Engines  (engines/*.rs)  — one `ConversionEngine` per backend
   │
   ▼
SQLite (database/)  ·  external tools via argv (engines/sidecar.rs)
```

There is no network code. The webview has no filesystem access — file paths only
travel through the commands below, and the Rust side does the reading.

**The contract.** Every type that crosses the boundary is a Rust struct with
`#[serde(rename_all = "camelCase")]` mirrored by an interface in
[src/types/converter.ts](../src/types/converter.ts). Rename the Rust field and the
TypeScript type breaks first; that is the intended failure mode.

## One conversion, start to finish

1. **Drop or browse.** [Dropzone.tsx](../src/components/conversion/Dropzone.tsx)
   hands paths to [useFilesDrop.ts](../src/hooks/useFilesDrop.ts), which calls
   `probe_files`.
2. **Probe** ([manager.rs:99](../src-tauri/src/core/manager.rs#L99)). Size, magic
   bytes, image dimensions. The extension is never trusted — a `.jpg` that is
   really a PNG is reported as PNG, plus an `extensionMismatch` warning string.
3. **Offer outputs.** `list_capabilities(input)` returns every registry route for
   that format with `available` set from the live engine probe.
   [useOutputChoices.ts](../src/hooks/useOutputChoices.ts) then keeps only outputs
   reachable from *every* staged file, so a batch never offers a format that would
   fail half its members. The audio and video pages additionally read
   `media_capabilities`: `filterChoices` hides a route whose container has no
   encoder in this FFmpeg build, and `blocker` explains a missing or broken
   FFmpeg before a job can be queued.
4. **Submit.** [ConverterPage.tsx](../src/components/conversion/ConverterPage.tsx)
   builds one `JobRequest` per file by default. A page with page-level work passes
   `buildRequests` instead: the PDF page expands PDF → images, per-page split and
   every-N split into one request per output, and merges multiple PDFs into one
   request with `extraInputs`. All of them still go through `submit_jobs`.
5. **Plan** ([manager.rs:151](../src-tauri/src/core/manager.rs#L151)). Re-detect
   from bytes → size limit → registry lookup for **every** input → pick the first
   route whose engine probes available → compute the output path (the planner
   refuses a path equal to any source) → check free disk space. Anything that
   fails here comes back as a per-file error in the response and is shown on the
   page; nothing enters the queue half-planned.
6. **Queue.** The job is appended to the in-memory list, a
   `CancellationToken` is registered, an `Added` event fires, and the job id goes
   down an mpsc channel.
7. **Execute.** A worker takes a permit from the right gate, re-checks the job was
   not cancelled while it waited, marks it `Processing`, and calls
   `engine.convert()` with an [EngineContext](../src-tauri/src/engines/mod.rs#L88).
8. **Finish.** [pool.rs:464](../src-tauri/src/queue/pool.rs#L464) writes the final
   status, one history row, and a `QueueStats` event. The UI's
   [useJobEvents.ts](../src/hooks/useJobEvents.ts) folds that into the zustand
   store and the Queue page repaints.

## Documents and archives through the same queue

Phase 4 extends the existing job model rather than adding a second workflow.
`JobRequest.operation` selects one of three planner paths
([manager.rs:186](../src-tauri/src/core/manager.rs#L186)):

- **`Convert`** — unchanged for images, PDF, audio and video. For Office routes
  the planner picks `EngineId::Document`, the registry guarantees the input and
  output belong to the same LibreOffice family, and one request carries exactly
  one document. The Documents page submits one request per file, so batch
  conversion is still ordinary queue batching.
- **`CreateArchive`** — `inputs` are files and folders, `output_format` must be
  creatable. The planner runs `archive::scan_sources` (size, file count, links),
  chooses the archive name (one source keeps its name; several default to
  `archive`), plans the destination and checks free space. The engine repeats
  the scan at execution time, builds TAR.GZ/BZ2/XZ in two stages, test-reads the
  result with `7z t`, checks its signature and publishes it.
- **`ExtractArchive`** — exactly one archive per job. Before a destination
  exists, the planner calls `archive::inspect` and `validate_listing`; a
  traversal, link, duplicate, bomb or missing password is refused at submit
  time. The engine inspects again, extracts into a `ScratchDir`, validates the
  produced tree, and only then commits it. An existing destination is skipped
  or uniquified, never merged.

Archive → archive repacking is a normal `Convert` with both sides on the archive
registry routes: the engine stages an extraction, then creates the new
container from the staged tree. The optional password unlocks the input; the
output is never silently re-encrypted.

The extra IPC surface is small and read-only: `inspect_archive` (listing with
optional password), `archive_capabilities` (create vs extract lists, version,
reason) and `document_sheets` (sheet names for the CSV picker). Everything that
changes state still goes through `submit_jobs`, cancel and retry.

On the front end, [DocumentsPage.tsx](../src/pages/DocumentsPage.tsx) stays a thin
`ConverterPage` wrapper plus `DocumentSettingsPanel`.
[ArchivesPage.tsx](../src/pages/ArchivesPage.tsx) renders `ArchiveStudio` with
Create/Extract/Repack tabs; each tab owns a workspace key so switching modes
does not lose staged files. `ArchiveExtractForm` inspects a single dropped
archive automatically, and `ArchiveContentBrowser` turns the listing into a
folder tree with tri-state checkboxes.

## Backend modules

| Path | Responsibility | Key types |
| --- | --- | --- |
| [core/format.rs](../src-tauri/src/core/format.rs) | `FormatId` enum, extension/label/category maps, magic-byte detection (ISOBMFF brands, EBML doctype, ZIP-based Office sniffing, text fallback) | `FormatId`, `FormatCategory`, `detect_from_head`, `detect_from_path`, `extension_matches` |
| [core/registry.rs](../src-tauri/src/core/registry.rs) | The static route table: input × output → engine, in preference order | `FormatCapability`, `candidates`, `capabilities_for` |
| [core/job.rs](../src-tauri/src/core/job.rs) | Job record, user request, file probe | `ConversionJob`, `JobRequest`, `FileProbe`, `JobStatus` |
| [core/manager.rs](../src-tauri/src/core/manager.rs) | Validates and routes a request; caches engine probes | `ConversionManager`, `PlanOutcome` |
| [core/settings.rs](../src-tauri/src/core/settings.rs) | Persisted preferences | `AppSettings`, `OutputDirectoryMode`, `CollisionPolicy`, `ThemeChoice` |
| [engines/mod.rs](../src-tauri/src/engines/mod.rs) | The backend seam and cooperative cancellation | `ConversionEngine`, `EngineContext`, `ProgressSink`, `EngineInfo`, `CancellationToken` |
| [engines/sidecar.rs](../src-tauri/src/engines/sidecar.rs) | Binary lookup, argv-only spawning, bounded waits | `locate`, `run_capturing`, `Sidecar`, `probe_pending` |
| [engines/image.rs](../src-tauri/src/engines/image.rs) | In-process raster work (Rust `image`) and ImageMagick for AVIF/HEIC/SVG | `ImageEngine`, `ImageMagickEngine`, `ImageOptions` |
| [engines/pdf.rs](../src-tauri/src/engines/pdf.rs) | PDF operations: lopdf for images → PDF, extract, rotate, metadata and validation; PDFium for rendering; qpdf (argv only) for merge, reorder, compress and password changes. `capabilities()` reports per-operation availability | `PdfEngine`, `PdfJobSettings`, `PdfOperation`, `PdfCapability`, `PdfDocumentInfo` |
| [engines/pdfium.rs](../src-tauri/src/engines/pdfium.rs) | One process-wide PDFium binding; page count, full-page rendering above a DPI, and small thumbnail renders for the Studio | `instance`, `render_page`, `preview_page` |
| [engines/media.rs](../src-tauri/src/engines/media.rs) | Media engine: format/codec tables, stream choice, trim validation, hidden-part output and ffprobe validation; dispatches to audio, video or GIF | `MediaEngine`, `CodecCandidate`, `resolve_*_codec`, `TempOutput` |
| [engines/media/audio.rs](../src-tauri/src/engines/media/audio.rs) | Audio → audio and video → audio argument builder: encoder, bitrate, sample rate, channels, volume/loudnorm, metadata | `convert`, `filters`, `is_lossless` |
| [engines/media/video.rs](../src-tauri/src/engines/media/video.rs) | Video → video: codec/quality presets, CRF or bitrate, scale, frame rate, chosen audio track, hardware fallback | `convert`, `quality_args`, `audio_args` |
| [engines/media/gif.rs](../src-tauri/src/engines/media/gif.rs) | Video → palette GIF with fps, width/height box and the 30-second cap | `convert`, `gif_filter` |
| [engines/media/settings.rs](../src-tauri/src/engines/media/settings.rs) | The shared camelCase settings bag and quality-preset mapping, including legacy preset names | `MediaSettings`, `QualityPreset` |
| [engines/ffmpeg.rs](../src-tauri/src/engines/ffmpeg.rs) | FFmpeg/ffprobe transport: binary lookup, version and encoder tables, structured inspection, progress parsing, hardware test encodes, previews, output validation | `tools`, `inspect`, `encoders`, `hardware_encoders`, `run`, `validate_output` |
| [engines/document.rs](../src-tauri/src/engines/document.rs) | LibreOffice headless conversion: family/filter table, sheet enumeration, PDF export settings, isolated profile per run, package/signature validation | `DocumentEngine`, `filter_spec`, `list_sheets`, `validate_output` |
| [engines/archive.rs](../src-tauri/src/engines/archive.rs) | 7-Zip creation, listing, extraction and repacking; entry validation, staging, budget checks, AES/header encryption | `ArchiveEngine`, `ArchiveListing`, `ArchiveEntry`, `ArchiveCapabilities` |
| [queue/pool.rs](../src-tauri/src/queue/pool.rs) | Worker pool, gates, submit/cancel/retry, history writes | `ConversionQueue`, `Shared`, `Gate`, `QueueStats`, `SubmitOutcome` |
| [queue/events.rs](../src-tauri/src/queue/events.rs) | The outbound event channel, throttled progress | `JobEmitter`, `TauriEmitter`, `EventSink`, `JobEvent` |
| [database/mod.rs](../src-tauri/src/database/mod.rs) | Schema execution and every query, including pending-job recovery | `Database`, `HistoryEntry`, `Preset`, `FavoriteEntry` |
| [database/backup.rs](../src-tauri/src/database/backup.rs) | Versioned JSON backup format, validation before mutation, single-transaction restore | `BackupBundle`, `BackupPreview`, `read_backup`, `restore_bundle` |
| [automation/](../src-tauri/src/automation) | Folder watcher, rule validation, debounce, automation log | `AutomationService`, `AutomationRule`, `AutomationStatus` |
| [workflow/](../src-tauri/src/workflow) | Multi-step runs (1–6 Convert/OCR steps) over the shared queue, temp cleanup | `WorkflowDefinition`, `WorkflowRun`, `WorkflowRequest` |
| [tools/](../src-tauri/src/tools) | Metadata read/edit/remove, hashes, duplicate/size reports, file comparison | `MetadataDocument`, `FileHashes`, `DuplicateReport`, `SizeReport` |
| [shell.rs](../src-tauri/src/shell.rs) | Second-instance hand-off, CLI file opening, HKCU context-menu entries | `OpenedFiles`, `files_from_args`, `set_integration` |
| [diagnostics.rs](../src-tauri/src/diagnostics.rs) | Local diagnostic report assembly | `DiagnosticsExport` |
| [utils/paths.rs](../src-tauri/src/utils/paths.rs) | Storage layout and output planning | `ensure_storage_layout`, `plan_output`, `uniquify`, `paths_are_same` |
| [utils/limits.rs](../src-tauri/src/utils/limits.rs) | Size, pixel and free-space ceilings | `check_input_size`, `check_output_space`, `MAX_IMAGE_PIXELS` |
| [utils/system.rs](../src-tauri/src/utils/system.rs) | Memory/CPU reading behind the concurrency suggestion | `SystemResources` |
| [error.rs](../src-tauri/src/error.rs) | The two error types and their wire forms | `ConversionError`, `AppError`, `CmdResult` |
| [commands.rs](../src-tauri/src/commands.rs) | The 82 IPC entry points, `AppState`, startup cleanup and job recovery | `AppState`, `FormatRoute`, `install` |

## Frontend modules

| Path | Responsibility |
| --- | --- |
| [App.tsx](../src/App.tsx) | HashRouter shell, sidebar, hydrate-once, the single `useJobEvents` subscription |
| [pages/](../src/pages) | Seventeen routes. Seven format pages share `ConverterPage`; Quick Convert and Home reuse the same drop/probe/submit path, and Tools groups Metadata, Utilities and Presets |
| [components/conversion/ConverterPage.tsx](../src/components/conversion/ConverterPage.tsx) | The shared workflow: stage files → pick output → tune settings → submit. Optional `filterChoices`/`forcedOutput`/`blocker`/`buildRequests`/`Studio` hooks let one page describe page-level work without a second workflow |
| [features/pdf/](../src/features/pdf) | PDF settings, operation gating from `pdf_capabilities`, request expansion (`requests.ts`), lazy page Studio (`PdfStudio.tsx`) |
| [features/media/](../src/features/media) | `capabilities.ts` (format/codec filtering and blockers), `useMediaInfo` (one cached ffprobe read shared by panel and Studio), `MediaInspector` (streams, poster frame, real GIF preview), and request building for audio/video/batch |
| [features/documents/](../src/features/documents) | `settings.ts` (page range, image quality, lossless, notes, sheet, per-file names), `DocumentSettingsPanel.tsx` — PDF-only controls, async sheet picker, custom output names |
| [features/archives/](../src/features/archives) | `settings.ts` (level, method, preserve paths, passwords, header encryption), `ArchiveCreateForm`, `ArchiveExtractForm`, `ArchiveRepackForm`, `ArchiveContentBrowser` (tree + tri-state selection), `useArchiveCapabilities` |
| [components/conversion/JobTable.tsx](../src/components/conversion/JobTable.tsx) | Status badges, progress bars, cancel/retry/reveal |
| [components/conversion/PresetBar.tsx](../src/components/conversion/PresetBar.tsx) | Save/load named presets; `omitKeys` keeps secrets out of SQLite |
| [features/&lt;area&gt;/](../src/features) | One `settings.ts` (type + defaults) and one `…SettingsPanel.tsx` per area |
| [stores/](../src/stores) | `appStore` (settings, engines, cached routes), `queueStore` (jobs folded from events), `workspaceStore` (per-page staged files and settings) |
| [hooks/](../src/hooks) | `useFilesDrop`, `useJobEvents`, `useOutputChoices`, `useThemeEffect` |
| [utils/api.ts](../src/utils/api.ts) | The only place `invoke` is called; one function per command |
| [utils/format.ts](../src/utils/format.ts) | `NAV_ITEMS` (the single source for route, label and accepted formats), size/format labels |

## The engine seam

One trait, five methods
([engines/mod.rs:106](../src-tauri/src/engines/mod.rs#L106)):

```rust
pub trait ConversionEngine: Send + Sync {
    fn id(&self) -> EngineId;
    fn probe(&self) -> EngineInfo;                                  // can it run here, right now?
    fn convert(&self, ctx: &EngineContext) -> Result<u64, ConversionError>; // returns output bytes
    fn is_memory_heavy(&self) -> bool { false }                     // queue policy hook
    fn is_heavy_job(&self, job: &ConversionJob) -> bool { self.is_memory_heavy() }
}
```

`is_heavy_job` lets one engine split its jobs: the media engine answers `true`
for real video and GIF encodes but `false` for audio extraction, so a ringtone
does not wait behind a 4K transcode.

`EngineContext` carries the job, a scratch `temp_dir`, a `&dyn ProgressSink` and a
`&CancellationToken`. Engines therefore know nothing about Tauri, SQLite or the
queue — they report progress through the sink and check the token between units of
work. That is what makes the whole pipeline testable headless (see
[Verification](#verification)).

`probe()` returning `available: false` is the *only* way an engine is excluded. The
UI will not offer its formats, `plan()` will refuse the job with the engine's own
reason string, and Settings lists it with that same reason.

## Format registry

`REGISTRY` is a `LazyLock<Vec<FormatCapability>>` built once from
[core/registry.rs:94](../src-tauri/src/core/registry.rs#L94). Two rules matter:

- **Order encodes preference.** `plan()` takes the first candidate whose engine
  probes available, so raster-in/raster-out lands on the in-process Rust engine
  and only AVIF/HEIC/SVG fall through to ImageMagick.
- **Same-format routes exist on purpose.** PNG→PNG is how a batch resize or
  recompress is expressed.

Routes are grouped: raster × raster, raster ↔ extended raster, raster → PDF
(each image becomes a page), PDF → {PNG, JPEG, WebP} (page rendering only), PDF →
PDF (merge/split/rotate/reorder/compress/metadata/password), Writer × Writer
(`docx`, `doc`, `odt`, `rtf`, `txt`, `html`) plus any of those → PDF, Calc × Calc
(`xlsx`, `xls`, `ods`, `csv`, `html`) plus PDF, Impress × {PPTX, ODP} plus PDF,
audio × audio, video × video, video→audio, audio→video, video→GIF, and every
readable archive container → {ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ}. Document
routes stay inside one LibreOffice family on purpose: a Writer file cannot become
a workbook or a slide deck, so no such route is advertised. PDF → BMP/TIFF/GIF/ICO
is deliberately absent: the PDF engine refuses targets the image encoder cannot
write, so advertising them would be a broken promise. A test asserts that no
`(input, output, engine)` triple appears twice.

## Queue and concurrency

Eight OS threads start with the queue
([pool.rs:143](../src-tauri/src/queue/pool.rs#L143)); they all block on one mpsc
channel, so **dispatch is serial and execution is parallel**. Real parallelism is
bounded by two counting semaphores (`Gate`, a `Mutex<usize>` + `Condvar`):

- `standard` — capacity `concurrent_jobs`
- `heavy` — capacity `concurrent_jobs.div_ceil(2)`

An engine that returns `is_memory_heavy() == true` takes from the smaller gate, so a
run of 4K transcodes cannot starve everything else. The queue asks
`is_heavy_job(job)` rather than the engine-wide flag, which lets FFmpeg audio
extraction stay on the standard gate while video encodes and GIFs wait for a
heavy slot. Changing the setting calls `apply_settings`, which re-limits both
gates and wakes blocked workers.

Blocking is deliberate: a job that cannot start waits for a permit rather than being
dropped. Changing the setting calls `apply_settings`, which re-limits both gates and
wakes blocked workers. The in-memory list is capped at `MAX_JOBS_KEPT = 500`;
newest jobs are inserted at the front, so truncation drops the oldest — finished
work the user has already seen, not work about to run.
Cancel sets the token and removes it: a still-queued job is settled as `Cancelled`
on the spot, a running one keeps its status until the engine notices. Retry resets
the same job — same id, same planned destination — under a fresh token.

## Events and progress

The queue never touches `AppHandle`. It holds an `Arc<dyn JobEmitter>`
([events.rs:37](../src-tauri/src/queue/events.rs#L37)); production wraps the Tauri
app in `TauriEmitter`, tests wrap a `Vec<JobEvent>` recorder. One event name,
`conversion://job`, four variants: `Added`, `Status`, `Progress`, `QueueStats`.

`EventSink` throttles `Progress` to one per 120 ms per job
([events.rs:110](../src-tauri/src/queue/events.rs#L110)) — a per-frame callback from
a decoder would otherwise flood the webview. Status changes are never throttled.
Engines that cannot measure progress report a stage at 0 and let the row show the
stage text.

On the front end, `useJobEvents` loads `list_jobs` + `queue_stats` once, then folds
events into `queueStore`. No polling.

## Storage and SQLite

`%APPDATA%\UniversalConverter\`, created at startup by
`ensure_storage_layout()` ([paths.rs:35](../src-tauri/src/utils/paths.rs#L35)):

| Folder | Written by |
| --- | --- |
| `database/converter.db` | `Database::open` — WAL mode, foreign keys on |
| `temp/` | Handed to engines as `EngineContext.temp_dir`. Documents create an isolated LibreOffice profile and output folder there; archives stage extraction there before publishing. Image, PDF and media work in memory or in a hidden sibling of the destination. `purge_temp_files` and the on-exit sweep clean it |
| `logs/` | `tauri_plugin_log`, `universal-converter.log` plus stdout |
| `cache/` | Created for the blueprint's layout; **unused in this build** |
| `presets/` | Created for exported preset files; **unused in this build** — presets live in the `presets` table |

Ten tables ([schema.sql](../src-tauri/src/database/schema.sql)):
`conversion_history` (one row per attempt, success or not), `app_settings`
(JSON per key, so a new setting needs no migration), `recent_files`, `presets`,
`engine_versions` (so a silent FFmpeg upgrade is visible), `automation_rules`,
`automation_log`, `workflows`, `favorite_files` and `pending_jobs`. The database
connection is a `Mutex<Connection>` behind `Arc<Database>`; every command and
worker goes through `Database::lock()`.

### Crash recovery and backup

A job is written to `pending_jobs` at submission and cleared when it settles.
Startup drains that table, marks each leftover job `Failed` with
`error_kind = "interrupted"`, writes it to history and keeps it in the queue for
review or retry. It never restarts the conversion automatically and never treats
a partial output as valid. The temporary root is purged at startup before the
queue is constructed, so abandoned scratch files do not accumulate.

Backups are versioned JSON (`universal-converter.backup`, version 1) covering
settings, presets, workflows, automation rules, favorites and history. Export
scrubs secret-shaped keys. `inspect_backup` validates metadata, file size, JSON
shape, limits, presets, workflows and automation rules before showing a preview;
`restore_backup` refuses while jobs are active or queued and performs one SQLite
transaction, so a failure leaves existing data untouched. Original files and
engine binaries are never included.

## Security invariants

Each of these is a property of the code, not an intention.

| Invariant | Where it lives | Asserted by |
| --- | --- | --- |
| **A source file is never written.** Any destination that resolves onto the input is refused, even when the collision policy is `Overwrite` | `plan_output` + `paths_are_same` ([paths.rs:142](../src-tauri/src/utils/paths.rs#L142)) | `same_format_same_folder_refuses_to_clobber_source`, `overwrite_policy_still_refuses_to_clobber_source` |
| **Format comes from bytes, not names** | `detect_from_head` / `detect_from_path` | 7 signature tests in `core/format.rs`, incl. `png_beats_extension` |
| **No shell, ever.** Arguments go to the OS as argv; there is no `cmd /C` anywhere, stdin is `null`, `CREATE_NO_WINDOW` is set | `sidecar::configure`, `Sidecar::start` | `cancel_before_wait_reports_cancelled_not_crash`, `spawn_of_missing_binary_errors_without_panicking` |
| **Engine lookup never calls a shell PATH search** | `sidecar::locate`: override variable, then bundled folder, then `env::split_paths` | `locate_returns_none_for_absent_binary`, `bundled_lookup_does_not_confuse_a_directory_for_a_binary` |
| **Bounded subprocesses.** `try_wait` polling with a deadline; timeout or cancel kills and reaps the child | `Sidecar::wait` | `cancel_before_wait_…` |
| **Input size ceiling** | `limits::check_input_size` against `AppSettings.max_input_mb` | `rejects_oversized_input` |
| **Pixel ceiling** — 120 MP, before decoding | `limits::MAX_IMAGE_PIXELS`, checked in both image paths | image-engine tests |
| **Restricted image delegates.** The `image` crate is built `default-features = false` with only jpeg, png, webp, bmp, tiff, gif, ico — no SVG, no AVIF decoder, no bundled libraries to exploit. ImageMagick runs under `-limit area 256MP -limit memory 1GiB -limit disk 2GiB` | `Cargo.toml`, `ImageMagickEngine::build_args` ([image.rs:414](../src-tauri/src/engines/image.rs#L414)) | `imagemagick_args_end_with_output_path` checks the `-limit` pairs reach the argv; the crate feature list is reviewed, not tested |
| **Free-space check before starting** | `limits::check_output_space` | `free_space_lookup_survives_unknown_drive` |
| **Every PDF output is re-read.** A job succeeds only after the written file has a PDF signature and the expected page count; rendered images are signature-checked too | `check_written_pdf` / `validate_output` ([pdf.rs](../src-tauri/src/engines/pdf.rs)) | every PDF operation test reads its output back |
| **Every media output is probed.** The file must exist, be non-empty, have a byte signature matching the claimed format, and ffprobe must recognise the intended container with the expected stream class | `ffmpeg::validate_output` + `container_matches` ([media.rs](../src-tauri/src/engines/media.rs)) | `converts_a_real_wav_to_mp3_and_validates_the_output`, `transcodes_a_real_mp4_to_webm_with_the_chosen_codec`, `builds_a_palette_gif_from_a_real_video` |
| **Media scratch never becomes a visible file.** Each job writes a hidden `.uc-<uuid>.part` sibling and renames only after validation; cancel, timeout and error delete it | `TempOutput` ([media.rs](../src-tauri/src/engines/media.rs)) | `a_cancelled_job_returns_cancelled_and_writes_nothing`, `corrupt_media_is_refused_without_writing_anything` |
| **Bad media input is refused, not guessed.** A corrupt file fails at ffprobe; an out-of-range trim or nonexistent audio-stream index fails before FFmpeg is started | `inspect`, `validate_trim`, `choose_audio_stream` | `corrupt_media_is_refused_without_writing_anything`, `a_wrong_audio_stream_index_or_trim_is_refused_before_encoding` |
| **Media jobs are bounded.** Audio 60 min, video 6 h, GIF 10 min; a timeout or cancel kills and reaps the child process, and progress comes from `-progress pipe:1` rather than a timer | `AUDIO_TIMEOUT`/`VIDEO_TIMEOUT`/`GIF_TIMEOUT`, `ffmpeg::run`, `Sidecar::wait` | `a_process_that_runs_too_long_is_killed_and_reported_as_a_timeout`, `a_cancelled_job_returns_cancelled_and_writes_nothing` |
| **Encrypted PDFs are never bypassed.** An encrypted input requires the supplied password; a still-encrypted load without it becomes `NeedsPassword`, setting a password writes 256-bit AES, removal requires the current password | `open_pdf`, `update_password` | `rasterising_an_encrypted_pdf_asks_for_its_password`, `a_password_can_be_added_verified_and_removed` |
| **Compression never claims a win it did not get.** If qpdf's output is not smaller, it is deleted and the job fails with both sizes; the original is untouched | `compress_pdf` | `compression_shrinks_a_bloated_pdf_and_keeps_its_pages`, `compression_refuses_to_pretend_when_it_would_grow_the_file` |
| **Passwords never reach logs or error text.** qpdf gets them in argv; only its stderr is quoted, and that names files and reasons | `run_qpdf`, `password_argument` | reviewed, not automated |
| **Temp isolation + cleanup** | per-app `temp/`, stale sweep while jobs run, full sweep on exit when the setting is on | `stale_purge_skips_files_a_running_job_may_own` |
| **No secrets in presets.** `omitPresetKeys` strips archive and PDF passwords before they reach SQLite; applying a preset keeps the current batch's password in memory | [PresetBar.tsx](../src/components/conversion/PresetBar.tsx), [PdfPage.tsx](../src/pages/PdfPage.tsx) | reviewed, not automated |
| **Archive members can never escape the destination.** Every entry path is normalised; absolute paths, drive letters, `..`, control characters, ADS colons, reserved Windows names and names Windows would rewrite are refused before a destination exists | `normalize_entry_path`, `validate_listing` ([archive.rs](../src-tauri/src/engines/archive.rs)) | `traversal_absolute_duplicate_and_link_fixtures_are_refused`, `a_traversal_archive_is_refused_before_anything_is_written` |
| **Archive links and duplicate names are refused.** Symlinks/hardlinks, case-insensitive duplicate entries and file/folder collisions fail the whole extraction | `entry_from_fields`, `validate_listing` | `traversal_absolute_duplicate_and_link_fixtures_are_refused`, `a_duplicate_listing_entry_is_refused` |
| **Expansion bombs and entry floods are bounded from the declared listing.** Defaults are 20 GiB uncompressed and 100,000 files; the extracted tree is checked again before publishing | `AppSettings.max_extraction_mb`, `max_extraction_files`, `validate_extracted_tree` | `an_expansion_bomb_is_refused_from_the_declared_size`, `limits_are_checked_from_the_declared_listing` |
| **Extraction is staged and never overwrites.** The tree is written into a `ScratchDir`, re-validated, then moved into place; an existing destination is refused and cancellation leaves nothing behind | `extract_to_staging`, `validate_extracted_tree` | `cancelling_extraction_leaves_no_destination_behind`, `zip_created_by_the_engine_round_trips_through_extraction` |
| **Document runs are isolated and their outputs re-opened.** Each job gets a unique LibreOffice profile and scratch output folder; PDF page count, OOXML/ODF package mimetype, RTF header and non-empty text are validated before success | `DocumentEngine::convert` ([document.rs](../src-tauri/src/engines/document.rs)) | `real_documents_export_to_odf_packages`, `a_real_docx_becomes_pdf_with_the_requested_page_range`, `html_text_and_rtf_routes_produce_real_outputs` |
| **Document and archive passwords never reach settings or presets.** Password-shaped keys are scrubbed by the manager, omitted by the preset bar, and travel only on the in-memory job request | `manager.rs`, `PresetBar` `omitKeys` | `archive_creation_plans_every_source_and_scrubs_passwords_from_settings` |
| **CSP** | `default-src 'self'` in [tauri.conf.json](../src-tauri/tauri.conf.json) | — |

**Archive path traversal is enforced on both sides of the boundary.** The listing is
validated before extraction starts, extraction happens in a scratch folder, and
the produced tree is checked again before it is moved to the destination. The
tests named above use real malicious ZIP fixtures (`traversal.zip`, `absolute.zip`,
`symlink.zip`, `duplicate.zip`, `bomb.zip`, `malformed.zip`), not mocked
listings.

## Error model

`ConversionError` (thiserror) is what engines and the planner return; its
`kind()` string is what the UI switches on: `unsupported`, `needsPassword`,
`wrongPassword`, `engineUnavailable`, `unreadable`, `corrupt`, `invalidOutput`,
`cancelled`, `tooLarge`, `pixelLimit`, `diskSpace`, `timeout`, `image`,
`database`, `other`.
`AppError` is the same thing on the wire — `{ kind, message }`, camelCase — and
converts back and forth with `From`. Every message names the file and says what to
do next ("Install it, or set `UC_FFMPEG_PATH` to its full path, then restart the
app"), because the Queue row is often the only place a user sees it.

`Cancelled` is a result, not an error: `finish()` maps it to `JobStatus::Cancelled`
with no error text.

## Honest degradation

Documents and archives are implemented, so their degradation is about the local
tool rather than a phase. `DocumentEngine::probe()` locates `soffice.com` through
`UC_LIBREOFFICE_PATH`, `resources/libreoffice/program/`, the normal install
folders, then `PATH`, and reports its version. `ArchiveEngine::probe()` does the
same for `7z.exe`. When a tool is missing, the engine stays `available: false`
with a reason naming the binary and the override variable, `plan()` refuses the
job with that sentence, the output selector hides its formats, and the page
shows the same message. `convert()` never writes a placeholder.

`archive_capabilities` additionally separates what this 7-Zip build can create
from what it can read, so CAB/WIM stay extract-only and the create form never
offers them. `document_sheets` reads sheet names from XLSX/XLS/ODS (and CSV's
single sheet) so the CSV picker only lists sheets that exist. No route reports
success without output validation.

Audio and video have the same shape of degradation, about the local FFmpeg build
rather than a phase. `media_capabilities` runs `ffmpeg -encoders`
and reports each output format and each codec with `available` and, when it is
not, the encoder names the app looked for. A format missing its encoder is hidden
from the output selector; if both binaries are missing, the page shows a blocker
naming `ffmpeg.exe`/`ffprobe.exe` and the `UC_*_PATH` overrides. Hardware
encoders are additionally gated by a real one-frame encode, so a driver that
advertises NVENC but cannot open a session is not offered.

The PDF engine's degradation is finer-grained. The native lopdf path is always
compiled in; PDFium and qpdf are separate. `pdf_capabilities` reports all nine
operations with `available` and `missingDependency`, so the panel disables
merge/reorder/compress/password when qpdf is absent and PDF → images plus
thumbnails when PDFium is absent, naming the tool and the `UC_*_PATH` override.
No operation reports success without passing output validation.

## Adding an engine

1. **Pick a phase and a label.** Add a variant to `EngineId`
   ([engines/mod.rs](../src-tauri/src/engines/mod.rs)) with its `label()`.
2. **Write `engines/<name>.rs`** implementing `ConversionEngine`. Use
   `sidecar::locate("UC_<TOOL>_PATH", "<binary>", "<bundled-dir>")` in `probe`,
   `sidecar::run_capturing` for the version string, and
   `sidecar::Sidecar::start(...).wait(ctx.cancel, timeout)` for the work itself —
   that call is what makes cancel and timeout real.
3. **Register it** in `all_engines()`
   ([engines/mod.rs:121](../src-tauri/src/engines/mod.rs#L121)) so
   `ConversionManager` can reach it. Startup then records its probe result in
   `engine_versions` automatically — nothing else to wire.
4. **Add routes** to `build_registry()` in `core/registry.rs`, ordered by where you
   want it to lose to an existing engine.
5. **Add the formats** to `FormatId` (`extension`, `label`, `category`,
   `known_extensions`) and their magic bytes to `detect_from_head`.
6. **Mirror the settings type** in `src/features/<area>/settings.ts` and render it
   in the panel. Rust deserialises settings with `engines::parse_settings`, which
   falls back to engine defaults on anything unrecognised, so a UI typo degrades
   rather than failing the job.
7. **Test the probe path and one real conversion.** A missing tool must return a
   reason, not `Ok`; a present tool must produce a file that the engine re-opens
   and validates.

The queue, events, planner, database and all six pages need no changes — that is
what the seam is for.

## Adding a format or a route

`FormatId` variant → its four match arms in
[core/format.rs](../src-tauri/src/core/format.rs) → magic bytes in
`detect_from_head` → one `push(...)` call in `build_registry()` → the id in
`NAV_ITEMS` accepts list if it should be droppable on a page → the same literal in
`src/types/converter.ts`. The `no_duplicate_routes` test catches the common
copy-paste mistake.

## Verification

```bash
cd src-tauri && cargo test      # 262 tests, incl. real conversions and PDF/media/document/archive fixtures
cd src-tauri && cargo check --all-targets
npm run build                   # tsc -b && vite build
npm run lint                    # oxlint
```

The queue test ([pool.rs:608](../src-tauri/src/queue/pool.rs#L608)) builds a real
`ConversionQueue` over a real SQLite file in `%TEMP%\uc-queue-<name>` and a
`Recorder` emitter, writes a 6×6 PNG with the real encoder, submits it, and asserts
the whole chain: `Added` first, then `Processing`, a `Progress` event, `Completed`;
the JPEG exists with non-zero bytes and a detected signature; the source is still a
PNG; one completed history row. No window, no webview, no mock engine.

The PDF suite uses real fixtures written by lopdf, not mocked engine responses:
a multi-page text PDF, a padded PDF that qpdf can genuinely shrink, and a real
encrypted PDF. Tests read outputs back to prove page order and content, render a
page through the bundled PDFium and assert text pixels, run the bundled qpdf,
verify a set password opens and a removed password does not, and check that a
compression candidate that would grow is deleted and refused.

The media suite builds a real 16-bit PCM WAV byte by byte, then asks the bundled
FFmpeg for a 320×240 H.264/AAC MP4 and a tagged MP3. It converts WAV → MP3/FLAC,
MP3 → WAV, MP4 → WebM/MKV/MP4/GIF, extracts audio, and after every job re-opens
the output with `ffprobe` to assert the container, codec, sample rate, channels,
height, frame rate, metadata title and audio-track codec. Bitrate tests compare
real file sizes; trim tests assert the output is shorter; the corrupt-input test
proves no output or `.part` file survives. FFmpeg transport tests cover missing
binaries, real timeouts with the child killed, and signature validation of empty
or unreadable outputs.

The document suite drives the bundled headless LibreOffice over real
DOCX/XLSX/PPTX/TXT fixtures: DOCX → PDF (page range), XLSX → PDF, PPTX → PDF,
XLSX → CSV (second sheet, first sheet asserted absent), TXT → DOCX → RTF,
DOCX/XLSX/PPTX → ODT/ODS/ODP, and scratch HTML → PDF/TXT, TXT → RTF → PDF. Every
output is re-opened: `lopdf` counts PDF pages, `zip` checks the ODT/ODS/ODP
package and its `mimetype`, and text/RTF assertions prove content survived. The
encrypted-CFB test proves detection asks for a password before LibreOffice is
spawned.

The archive suite runs the bundled 7-Zip for real: creation and extraction of
ZIP/7Z/TAR/TAR.GZ/TAR.BZ2/TAR.XZ with signature checks, folder-tree preservation,
selected-entry extraction, AES-256 ZIP plus encrypted 7z headers, and a TAR.GZ
job that must not leak the inner TAR. Security tests use real malicious fixtures
— traversal, absolute paths, symlinks, duplicate entries, a compression bomb and
a malformed archive — and the cancellation test asserts the destination folder
never appears.

Startup does one thing worth calling out
([main.rs:34](../src-tauri/src/main.rs#L34)): `commands::install` manages
`AppState` **by value**, and setup immediately checks `try_state::<AppState>()`,
because Tauri keys its state map on the exact `TypeId`. Wrapping the managed value
in an extra `Arc` compiles fine and then fails every single command at runtime with
"state not managed" — so the check makes that boot-time visible instead of hiding it
behind a click.

## Build and packaging

- Dev: `npm run tauri dev` (vite on 1420, then `cargo run`).
- Release: `npm run tauri build` → `src-tauri/target/release/`, installer in
  `src-tauri/target/release/bundle/nsis/`; `npm run package:release` stages the
  installer and portable ZIP into `release/`. Frontend `dist/` is baked into the
  binary; `dist/` on disk is only used by the browser preview.
- Capabilities: [capabilities/default.json](../src-tauri/capabilities/default.json)
  grants the `main` window `core:default`, `dialog:default`,
  `opener:allow-reveal-item-in-dir` and `notification:default` — dialogs, reveal
  in Explorer and native completion notifications, nothing more.
- Engine binaries are looked up as `resources/<tool>/` next to the executable, so
  dropping them into the repository's `resources/` works during development.
  `bundle.resources` in [tauri.conf.json](../src-tauri/tauri.conf.json) maps each
  engine **directory** (not a glob) into `resources/<tool>/`, which preserves
  nested layouts such as `tesseract/tessdata/`. A glob mapping would flatten
  those files and silently break OCR. `UC_*_PATH` overrides still win for a local
  install. PDFium, qpdf, FFmpeg/ffprobe, LibreOffice, 7-Zip and Tesseract are
  bundled; ImageMagick remains a drop-in.
- Release: NSIS per-user installer (bzip2 compression) plus a portable ZIP built
  by `scripts/package-release.mjs`; SHA-256 checksums and the release notes are
  written alongside. The build is unsigned and has no updater.
