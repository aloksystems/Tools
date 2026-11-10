# PHASE 4 — DOCUMENTS & ARCHIVES STUDIO
## Universal Converter | Windows Desktop Application

You are continuing development of an existing Universal Converter desktop application.

Previous development phases:

- Phase 1: Image Converter.
- Phase 2: PDF Studio.
- Phase 3: Audio & Video Studio.

Your task is to implement Phase 4: a fully functional Document Conversion and Archive Management system.

IMPORTANT:
Do not rebuild the application.
Do not replace the existing architecture.
Do not break any previously implemented functionality.

Extend the existing codebase and follow its established engineering conventions.

---

# 1. FIRST: ANALYZE THE EXISTING CODEBASE

Before writing code:

1. Read docs/architecture.md.
2. Inspect existing document and archive engine stubs.
3. Inspect ConversionEngine and EngineContext.
4. Inspect engine registration and EngineId.
5. Inspect core/registry.rs.
6. Inspect FormatId and format detection.
7. Inspect conversion manager and job queue.
8. Inspect existing settings panels.
9. Inspect database and history implementation.
10. Inspect Sidecar utilities.
11. Inspect all existing tests.

Determine which features are already implemented and which are missing.

Prepare a concise implementation plan.

Do not duplicate existing functionality.

---

# 2. DOCUMENT ENGINE — LIBREOFFICE

Use LibreOffice in headless mode as the primary document conversion engine.

Requirements:

- Support bundled LibreOffice where practical.
- Support UC_LIBREOFFICE_PATH override.
- Detect installation and version.
- Handle missing dependencies gracefully.
- Isolate conversion profiles for concurrent processes.
- Use dedicated temporary directories.
- Never depend silently on developer-machine installations.

Use argv-only process execution.

Never invoke a command shell.

---

# 3. DOCUMENT FORMAT SUPPORT

Implement genuine conversions wherever supported by LibreOffice.

## Word Documents

Input:
- DOC
- DOCX
- ODT
- RTF
- TXT

Output:
- DOCX
- DOC where supported
- ODT
- PDF
- RTF
- TXT
- HTML

## Spreadsheets

Input:
- XLS
- XLSX
- ODS
- CSV

Output:
- XLSX
- XLS where supported
- ODS
- PDF
- CSV
- HTML

Preserve spreadsheet data, sheets and formulas where possible.

Clearly document limitations for unsupported formatting and formula compatibility.

## Presentations

Input:
- PPT
- PPTX
- ODP

Output:
- PPTX
- ODP
- PDF

Preserve slide order, layout, images and text as accurately as possible.

## Additional Formats

Where practical, support:

- HTML to PDF.
- HTML to TXT.
- TXT to PDF.
- TXT to RTF.
- RTF to PDF.

Do not advertise a conversion route unless the selected engine can actually perform it.

---

# 4. DOCUMENT CONVERSION FEATURES

Implement:

A. Batch document conversion.
B. Multiple document selection.
C. Output format selection.
D. Output folder selection.
E. Custom output filenames.
F. Preserve original files.
G. Collision handling.
H. Conversion progress.
I. Conversion cancellation.
J. Conversion history.
K. Retry failed jobs.
L. Conversion presets.

Advanced options:

- PDF export settings.
- Page range where supported.
- Image quality for PDF exports.
- Spreadsheet sheet selection where supported.
- Document export options.
- Password-protected document handling where supported.

Do not silently discard content.

---

# 5. ARCHIVE ENGINE — 7-ZIP

Integrate 7-Zip as the primary archive processing engine.

Requirements:

- Support bundled 7-Zip.
- Support UC_7ZIP_PATH override.
- Detect executable and version.
- Support Windows installation paths.
- Display actionable dependency errors.
- Use argv-only execution.
- Capture process errors safely.

Never use shell command construction.

---

# 6. ARCHIVE FORMAT SUPPORT

Implement support for:

- ZIP
- 7Z
- TAR
- GZ
- BZ2
- XZ
- WIM where supported
- CAB where supported

Support archive creation, extraction and conversion wherever technically possible.

Important:
Not every archive format is directly convertible to every other format.

For example, TAR.GZ is a TAR archive compressed using GZIP.

Implement format-aware workflows instead of treating every extension as an independent archive format.

---

# 7. ARCHIVE CREATION

Implement:

A. Create ZIP archive.
B. Create 7Z archive.
C. Create TAR archive.
D. Create TAR.GZ.
E. Create TAR.BZ2.
F. Create TAR.XZ.

Settings:

- Archive filename.
- Output directory.
- Compression level.
- Compression method where supported.
- Password protection where supported.
- Encryption options where supported.
- Preserve folder structure.
- Include multiple files and directories.

Compression levels:

- Store / No compression.
- Fast.
- Normal.
- Maximum.

Explain when an archive format does not support a selected setting.

---

# 8. ARCHIVE EXTRACTION

Implement:

A. Extract complete archive.
B. Extract selected files.
C. Extract selected folders.
D. Extract multiple archives.
E. Choose destination folder.
F. Preserve directory structure.
G. Preview archive contents.
H. Show archive size and estimated extracted size where available.

Implement safe extraction.

CRITICAL SECURITY REQUIREMENTS:

- Prevent Zip Slip and archive path traversal.
- Reject paths escaping the destination directory.
- Reject unsafe absolute paths.
- Handle symbolic links safely.
- Prevent unexpected overwrite.
- Protect against excessive decompression expansion.
- Detect duplicate archive entries.
- Handle malformed archives safely.
- Never automatically execute extracted files.
- Use safe temporary extraction directories.
- Clean up temporary files after failure.

Validate all extracted paths before writing files.

---

# 9. PASSWORD AND ENCRYPTION SUPPORT

Implement password-protected archive creation and extraction where supported.

Requirements:

- Prompt for password when required.
- Never save passwords in conversion history.
- Never include passwords in application logs.
- Never expose passwords in presets.
- Avoid passing secrets through unsafe process arguments where possible.
- Explain unsupported encryption methods.
- Handle incorrect passwords with clear errors.

Do not attempt to bypass unknown passwords.

---

# 10. DOCUMENT AND ARCHIVE FRONTEND

Build two professional workspaces consistent with the existing design system.

## Document Studio

Include:

- Document dropzone.
- Multi-file upload.
- Detected document format.
- Output format selector.
- Document-specific settings.
- PDF export options.
- Output location.
- Batch conversion.
- Progress indicators.
- Success and failure states.
- Reveal output in Explorer.

## Archive Studio

Include:

- Archive creation mode.
- Archive extraction mode.
- Drag-and-drop files.
- Archive content browser.
- File and folder selection.
- Compression settings.
- Password input.
- Output directory selection.
- Extraction progress.
- Error reporting.
- Reveal extracted files.

Use the existing frontend components, stores, events and conversion workflow.

Do not redesign unrelated screens.

---

# 11. ENGINE ARCHITECTURE

Implement DocumentEngine and ArchiveEngine through the existing ConversionEngine architecture.

Preserve:

- ConversionManager.
- Engine registry.
- EngineContext.
- CancellationToken.
- ProgressSink.
- Existing queue.
- Worker pool.
- Events.
- SQLite history.
- Output planning.
- Error model.

Do not create separate conversion queues.

Where operations require multiple input files, archive contents, custom extraction destinations or operation-specific settings, extend the existing job model carefully.

Do not break existing job requests.

Use typed engine settings.

Ensure document and archive operations return actual output files, not placeholder results.

---

# 12. RESOURCE MANAGEMENT

Implement:

- Bounded subprocess execution.
- Configurable timeouts.
- Safe cancellation.
- Isolated temporary directories.
- Disk-space checks.
- Output size validation.
- Memory-aware scheduling where appropriate.
- Safe handling of large documents and archives.

LibreOffice operations may require separate isolated user profiles to prevent conflicts between concurrent processes.

Archive extraction must enforce configured limits on total extracted size and file count.

---

# 13. SECURITY REQUIREMENTS

Treat all input documents and archives as untrusted.

Implement:

- Input signature validation.
- Safe path handling.
- Archive traversal protection.
- Symlink restrictions.
- Output path validation.
- No shell invocation.
- No automatic execution of extracted content.
- Password redaction.
- Process timeouts.
- Process termination and cleanup.
- Disk-space validation.
- Original file preservation.

Do not weaken security checks for convenience.

---

# 14. TESTING REQUIREMENTS

Use real test files and validate actual outputs.

## Document Tests

- DOCX to PDF.
- DOCX to ODT.
- ODT to DOCX.
- XLSX to PDF.
- XLSX to CSV.
- PPTX to PDF.
- RTF to PDF.
- TXT to PDF.
- HTML to PDF.
- Batch document conversion.
- Corrupt document handling.
- Password-protected document handling where supported.

Verify generated files can actually be opened and their content is preserved within expected compatibility limits.

## Archive Tests

- ZIP creation.
- ZIP extraction.
- 7Z creation.
- 7Z extraction.
- TAR creation.
- TAR extraction.
- TAR.GZ creation and extraction.
- TAR.XZ creation and extraction.
- Password-protected archive creation and extraction.
- Batch extraction.
- Selected-file extraction.
- Invalid archive handling.
- Corrupt archive handling.
- Duplicate filenames.
- Path traversal attack fixtures.
- Symlink attack fixtures.
- Excessive decompression size.
- Cancellation during extraction.

Test archive security using malicious fixtures.

Do not use mocked successful results as proof of real functionality.

---

# 15. REGRESSION TESTING

Previous phases must continue working.

Run:

cargo test
cargo check --all-targets
npm run build
npm run lint

Do not remove existing tests or weaken assertions.

Fix all regressions before reporting completion.

---

# 16. DOCUMENTATION

Update:

- docs/architecture.md
- README.md
- Document engine documentation.
- Archive engine documentation.
- Supported format matrix.
- LibreOffice setup instructions.
- 7-Zip setup instructions.
- Security documentation.
- Known limitations.
- Dependency licensing and notices.

Clearly distinguish available features from planned features.

---

# 17. COMPLETION REPORT

When finished, provide:

1. Document conversion features implemented.
2. Archive creation features implemented.
3. Archive extraction features implemented.
4. Supported format combinations.
5. LibreOffice integration details.
6. 7-Zip integration details.
7. Security protections implemented.
8. Files created or modified.
9. Automated test results.
10. Build and lint results.
11. Manual testing instructions.
12. Remaining limitations.
13. Confirmation that Phases 1, 2 and 3 remain functional.

FINAL REQUIREMENT:

Do not mark Phase 4 complete merely because the pages render or the engines are detected.

Real documents must convert successfully.

Real archives must be created and extracted successfully.

Extracted paths must pass security validation.

Generated files must be verified.

All previous phases must pass regression testing.

Prioritize data integrity, security and reliability over the number of supported formats.