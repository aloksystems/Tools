# PHASE 5 — ADVANCED FEATURES & PRODUCTIVITY STUDIO
## Universal Converter | Windows Desktop Application

You are continuing development of an existing Universal Converter desktop application.

Previously planned development phases:

- Phase 1: Image Converter
- Phase 2: PDF Studio
- Phase 3: Audio & Video Studio
- Phase 4: Documents & Archives Studio

Your task is to implement Phase 5: Advanced File Processing, OCR, Metadata Management, Automation and Productivity Features.

IMPORTANT:
This is an existing application.

Do not rebuild it.
Do not replace its architecture.
Do not break previously implemented functionality.
Do not duplicate existing tools.

Extend the existing codebase using its established architecture and coding conventions.

# 1. FIRST — CODEBASE ANALYSIS

Before implementation:

1. Read docs/architecture.md.
2. Inspect all existing engines.
3. Inspect the format registry.
4. Inspect the conversion manager.
5. Inspect the job queue and concurrency system.
6. Inspect SQLite schema and migrations.
7. Inspect all existing frontend pages.
8. Inspect existing presets and settings.
9. Inspect temporary storage and cleanup.
10. Inspect existing dependency detection.
11. Review existing security and testing infrastructure.

Identify which proposed features already exist.

Prepare an implementation plan based on the actual repository.

Do not introduce duplicate functionality.

# 2. MODULE A — OCR STUDIO

Implement a functional OCR system.

Preferred engine: Tesseract OCR.

Features:

A. Image to Text.
B. Scanned PDF to Text.
C. Scanned PDF to searchable PDF.
D. Image to searchable PDF.
E. OCR batch processing.
F. Text extraction.
G. Language selection.
H. Page selection.
I. Output TXT.
J. Output searchable PDF where supported.

Support language packs where available.

Provide:
- OCR language selection.
- OCR quality options.
- Page range.
- Output destination.
- Progress reporting.
- Cancellation.
- OCR error reporting.

Detect missing OCR language packs and provide clear instructions.

Do not claim OCR accuracy is guaranteed.

Preserve original files.

# 3. MODULE B — ADVANCED IMAGE STUDIO

Extend existing image processing capabilities.

Implement:

A. Batch resize.
B. Batch crop.
C. Batch rotate.
D. Batch watermark.
E. Image format optimization.
F. Image metadata inspection.
G. Metadata removal.
H. Image quality adjustment.
I. Aspect ratio control.
J. Image dimension presets.
K. Image comparison.
L. Image format information.

Advanced capabilities where technically practical:

- Background removal using an optional local model.
- Image enhancement.
- Image upscaling using an optional local model.
- Color profile handling.
- Transparent background preservation.

Do not require cloud uploads.

Heavy AI models must be optional downloads.

Clearly communicate model size and system requirements.

Do not advertise background removal or AI enhancement unless the actual processing engine is implemented and tested.

# 4. MODULE C — ADVANCED PDF STUDIO

Extend the existing PDF engine.

Implement:

A. Add watermark.
B. Add page numbers.
C. Add headers and footers.
D. Password protection.
E. Remove encryption when the correct password is supplied and permitted.
F. PDF metadata editor.
G. Extract embedded images where supported.
H. Add annotations where supported.
I. PDF page comparison.
J. Advanced PDF optimization.
K. PDF information inspector.

Additional features where supported:

- Page margins.
- Page labels.
- Bookmarks.
- PDF/A export.
- Form inspection.

Preserve document content and page structure wherever possible.

Do not silently remove embedded fonts, metadata or other content.

# 5. MODULE D — METADATA STUDIO

Create a centralized metadata inspection and editing module.

Support metadata operations for formats where the relevant metadata specification and engine permit it.

Image metadata:
- EXIF.
- IPTC.
- XMP.
- Camera information.
- Image dimensions.
- Orientation.
- GPS metadata inspection.

Document metadata:
- Title.
- Author.
- Subject.
- Keywords.
- Creator.
- Creation date where editable.

Audio metadata:
- Artist.
- Album.
- Title.
- Genre.
- Track number.
- Year.

Video metadata:
- Duration.
- Codec.
- Resolution.
- Frame rate.
- Bitrate.
- Container.
- Embedded metadata.

Archive metadata:
- File listing.
- File sizes.
- Compression information.
- Archive properties.

Features:

- Read metadata.
- Edit supported fields.
- Remove supported metadata.
- Export metadata report.
- Compare metadata before and after processing.

Use format-specific engines instead of assuming all formats share the same metadata structure.

Never silently alter file content while editing metadata.

# 6. MODULE E — FILE UTILITIES

Create a dedicated File Utilities section.

Implement:

A. File information inspector.
B. SHA-256 hash generator.
C. SHA-512 hash generator.
D. MD5 hash generator for legacy compatibility and non-security checks.
E. SHA-1 hash generator for legacy compatibility.
F. Checksum verification.
G. File size calculator.
H. File comparison.
I. Duplicate file detection using hashes.
J. File signature inspection.

Support:

- Single file hashing.
- Batch hashing.
- Compare two files.
- Verify against supplied checksum.
- Export hash reports.

Use streaming file reads for large files.

Do not load entire files into memory merely to calculate hashes.

Clearly explain that MD5 and SHA-1 should not be used for modern security-sensitive integrity guarantees.

# 7. MODULE F — AUTOMATION STUDIO

Implement local folder automation.

Features:

A. Watch folders.
B. Automatic format conversion.
C. Automatic image resizing.
D. Automatic compression.
E. Automatic PDF generation.
F. Output folder configuration.
G. File naming rules.
H. Multiple automation rules.
I. Enable/disable automation.
J. Automation logs.
K. Error notifications.

Example workflow:

Input folder:
C:/Users/User/IncomingImages

Rule:
Automatically convert supported images to WEBP.

Output folder:
C:/Users/User/ConvertedImages

Requirements:

- Use a reliable Windows filesystem watcher.
- Avoid processing partially copied files.
- Detect duplicate events.
- Prevent output folders from triggering infinite loops.
- Support recursive and non-recursive monitoring.
- Persist rules in SQLite.
- Allow users to pause and resume watchers.
- Never delete original files automatically.
- Require explicit configuration before destructive operations.

Automation must work locally without a cloud service.

# 8. MODULE G — ADVANCED PRESET MANAGER

Improve the existing preset system.

Implement:

- Named presets.
- Presets by conversion category.
- Custom output format.
- Custom compression settings.
- Custom image dimensions.
- Audio and video settings.
- PDF settings.
- Document settings.
- Export presets.
- Import presets.
- Duplicate presets.
- Delete presets.
- Restore default presets.

Requirements:

- Validate imported preset files.
- Version preset schemas.
- Do not store passwords or secrets.
- Handle missing or unsupported options gracefully.
- Maintain backward compatibility.

# 9. MODULE H — ADVANCED BATCH WORKFLOWS

Implement a multi-step processing workflow.

Example:

Input images
    ↓
Resize images
    ↓
Convert to WEBP
    ↓
Remove metadata
    ↓
Save to output folder

Another example:

Input documents
    ↓
Convert to PDF
    ↓
Merge PDFs
    ↓
Compress PDF
    ↓
Save final output

Requirements:

- Reuse existing engines.
- Reuse existing conversion infrastructure.
- Define explicit workflow steps.
- Validate each step's input and output.
- Support failure handling.
- Support cancellation.
- Report step-level progress.
- Preserve original files.
- Clean temporary files safely.

Do not create a second independent conversion architecture.

# 10. ARCHITECTURE REQUIREMENTS

Preserve:

- ConversionEngine.
- ConversionManager.
- Format registry.
- JobRequest.
- EngineContext.
- CancellationToken.
- ProgressSink.
- Existing worker pool.
- Queue events.
- SQLite database.
- Error model.
- Output planning.
- Existing IPC command conventions.

Add specialized modules only where necessary.

Use typed configuration structures.

Use SQLite migrations for new persistent features.

Do not break existing database installations.

Long-running operations must execute outside the frontend UI thread.

# 11. FRONTEND REQUIREMENTS

Create a unified Advanced Tools section.

Recommended navigation:

- OCR Studio.
- Image Studio.
- PDF Studio.
- Metadata Studio.
- File Utilities.
- Automation Studio.
- Presets.
- Batch Workflows.

Maintain the existing application's visual identity.

Requirements:

- Consistent navigation.
- Searchable tools.
- Clear input and output controls.
- Appropriate previews.
- Advanced settings panels.
- Progress indicators.
- Error messages.
- Success states.
- Empty states.
- Accessible controls.

Do not add every feature to one crowded screen.

Group related tools logically.

# 12. SECURITY REQUIREMENTS

Implement:

- Safe file handling.
- Input validation.
- Output path validation.
- Isolated temporary directories.
- Resource limits.
- Safe OCR processing.
- Safe filesystem watchers.
- No automatic deletion of original files.
- No automatic execution of files.
- Safe preset imports.
- No secrets in logs.
- Process timeouts.
- Cancellation.
- Dependency validation.

Automation must not create recursive conversion loops.

Metadata removal must be verified by reading the output metadata again.

# 13. TESTING REQUIREMENTS

Use actual files and real conversion engines.

OCR:
- Image to text.
- Scanned PDF to text.
- Searchable PDF generation.
- Missing language pack.
- Multiple page OCR.
- OCR cancellation.

Image:
- Batch resize.
- Watermark.
- Metadata removal.
- Format optimization.
- Transparency preservation.
- Background removal if implemented.

PDF:
- Watermark.
- Page numbering.
- Password protection.
- Metadata editing.
- PDF optimization.
- Output readability.

Metadata:
- Read metadata.
- Edit metadata.
- Remove metadata.
- Verify output metadata.

File utilities:
- SHA-256 known test vector.
- SHA-512 known test vector.
- Checksum verification.
- Duplicate detection.
- Large file hashing.

Automation:
- Watch folder.
- New file detection.
- Duplicate event prevention.
- Output loop prevention.
- Pause/resume.
- Restart persistence.

Presets:
- Save.
- Load.
- Export.
- Import.
- Invalid preset handling.

Workflows:
- Multi-step successful execution.
- Step failure.
- Cancellation.
- Temporary file cleanup.

# 14. REGRESSION TESTING

All previous phases must remain functional.

Run:

cargo test
cargo check --all-targets
npm run build
npm run lint

Do not delete or weaken existing tests.

Fix regressions before reporting completion.

# 15. DOCUMENTATION

Update:

- docs/architecture.md.
- README.md.
- OCR documentation.
- Metadata support matrix.
- Automation documentation.
- Preset schema documentation.
- Workflow documentation.
- Security documentation.
- Dependency licensing and notices.
- Known limitations.

Clearly distinguish implemented features from optional or planned features.

# 16. COMPLETION REPORT

Provide:

1. OCR features implemented.
2. Advanced image features implemented.
3. Advanced PDF features implemented.
4. Metadata support matrix.
5. File utility features implemented.
6. Automation features implemented.
7. Preset enhancements.
8. Workflow capabilities.
9. New dependencies.
10. Files created or modified.
11. Automated test results.
12. Build and lint results.
13. Manual testing instructions.
14. Security tests.
15. Remaining limitations.
16. Confirmation that Phases 1–4 remain functional.

FINAL REQUIREMENT:

Do not mark Phase 5 complete because the interface renders.

Every advertised feature must have a real working implementation.

Verify actual output files and metadata.

Verify automation with real filesystem events.

Verify multi-step workflows with real conversion engines.

Preserve all existing functionality.

Prioritize correctness, reliability, privacy and maintainability over feature quantity.