# User guide

Universal Converter runs entirely on this PC. Files are read and written locally;
there is no account, cloud step or telemetry.

## The basic flow

1. Open a studio from the sidebar (Image, PDF, OCR, Documents, Audio, Video,
   Archives) or use **Home** for recent files.
2. Add files with the picker or by dropping them on the page. Folders are
   accepted where the studio supports batch input.
3. Choose the output format. Only routes whose engine is available are offered.
4. Adjust settings; presets can save and reload a configuration.
5. Start the job. Progress, stage and cancel/retry live in **Queue**.
6. Open the result from the queue, history or the completion message in the page.

Original files are never overwritten. The default destination is a `Converted`
folder beside the source; Settings can change this to the same folder or one
fixed folder, and the collision policy controls renaming, replacing a previous
output, or skipping.

## Studios

### Image

Convert between JPEG, PNG, WebP, BMP, TIFF, GIF and ICO without an external tool.
Resize (fit or exact), crop to fill, rotate and flip, set JPEG/WebP quality,
strip metadata, flatten transparency. AVIF/HEIC/SVG appear only when ImageMagick
is installed.

### PDF

- Images → PDF, with page size, orientation, margins, placement and order.
- PDF → PNG/JPEG/WebP with DPI, quality and page ranges.
- Merge, split/extract, rotate and reorder with the page thumbnail Studio.
- Compress with qpdf. A compression that cannot make the file smaller fails
  honestly and leaves the original untouched.
- Read/edit metadata and set or remove passwords (AES-256).
- Encrypted PDFs require the password in the panel; it is never stored.

### OCR

Images and PDFs to plain text or a searchable PDF. Choose an installed Tesseract
language. For PDFs, each page is rendered and OCR'd individually; the output is
validated before the job succeeds.

### Documents

Word-processor, spreadsheet and presentation files convert through the bundled
headless LibreOffice. Writer → PDF/DOCX/DOC/ODT/RTF/TXT/HTML; Calc →
XLSX/XLS/ODS/CSV/PDF/HTML; Impress → PPTX/ODP/PDF. A Writer document cannot become
a spreadsheet or slide deck; those routes are not shown.

### Audio and video

Audio: MP3, WAV, FLAC, AAC, M4A, OGG, Opus, WMA, AIFF, ALAC, with bitrate, sample
rate, channels, volume, loudness, trim and metadata.

Video: MP4, MKV, MOV, AVI, WEBM, WMV, FLV, MPEG, 3GP and GIF, with quality/CRF,
resolution, frame rate, codecs, audio extraction/removal, trim, poster frame and
GIF preview. Hardware encoders are shown only after a real test encode succeeds.

### Archives

Create ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2 and TAR.XZ with compression level, method and
optional AES-256 encryption. Inspect an archive before extracting; extract
everything or selected entries. Extraction rejects absolute paths, traversal,
links and duplicate names, and never overwrites an existing folder.

## Advanced Tools

The **Advanced Tools** page is a searchable hub for:

- **Metadata Studio** — read, edit, compare and remove EXIF/GPS, PDF info, media
  tags and document properties. Removal is verified by re-reading the output.
- **File Utilities** — hashes (MD5/SHA-1/SHA-256/SHA-512), checksum verification,
  duplicate finder, size reports, file/metadata/image comparison and signature
  inspection. MD5 and SHA-1 are checksum tools, not security guarantees.
- **Automation Studio** — watch a folder and convert or OCR new files
  automatically. Rules are stored in SQLite, activity is logged, loops are
  blocked, and originals are never deleted.
- **Workflows** — save a 1–6 step pipeline using existing engines, run it over a
  batch, cancel it, and see intermediate step failures. Intermediates live in the
  app temp folder and are cleaned after the run.
- **Presets** — create, duplicate, import, export and restore starter presets.
  Imported bundles are validated and scrubbed of password/token/secret keys.

## Queue and history

The queue shows active, queued and finished jobs with progress. Actions include
cancel, retry, reveal output, remove finished jobs and clear finished jobs.
History is stored in SQLite and can be filtered; deleting history never deletes
files.

## Settings

- Throughput: parallel jobs and maximum input size.
- Output: destination mode, fixed folder, collision policy.
- Appearance: dark, light or follow Windows.
- Temporary files: purge now, delete on exit, storage path.
- Engines: live health, versions, re-scan and explicit tool paths.
- Backup & restore: export settings, presets, workflows, automation rules,
  favorites and history to one JSON file; inspect a backup before restoring it.
- Diagnostics: version, OS, logs, exportable report, a copyable system/engine
  summary, the configured support page (if any), cache and history cleanup,
  reset settings, welcome screen.

The welcome screen can be shown again from Diagnostics.

## Backup and restore

**Settings → Backup & restore → Export backup** writes a
`universal-converter.backup` JSON file to the folder you choose. It contains
application data only — never your converted files, source files or engine
binaries.

To restore, choose **Choose backup…**. The app validates the file and shows the
format version, creation date and how many presets, workflows, automation rules,
favorites and history entries it contains. **Restore now** replaces the current
application data with the backup in a single database transaction. This cannot
be undone, so export the current state first if it matters. Restore is refused
while jobs are running or queued.

Backups from a different format version, of an unexpected file, or with invalid
or secret-bearing entries are rejected without touching existing data. A backup
never restores an unfinished job as successful: those entries are restored as
interrupted failures.

If the app was closed or crashed during a conversion, the next launch marks the
unfinished job as interrupted, keeps it in the queue for review or retry, and
does not restart it automatically. Any partial output is left in place and
labelled unusable rather than offered as a finished file.

## Local data

Settings, history, presets, workflows and automation rules are stored in
`%APPDATA%\UniversalConverter\database\converter.db`. Temporary files live under
`%APPDATA%\UniversalConverter\temp` and are swept on exit (configurable) and on
demand. Rotating logs live under `%APPDATA%\UniversalConverter\logs` (max 5 ×
10 MB).
