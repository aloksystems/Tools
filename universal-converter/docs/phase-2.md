# PHASE 2 — PDF STUDIO IMPLEMENTATION
## Universal Converter | Windows Desktop Application

You are continuing development of an existing Universal Converter desktop application.

Phase 1 has been completed and verified.

Your task is to implement Phase 2: a fully functional PDF processing and conversion module.

IMPORTANT: Do not rebuild the application. Extend the existing architecture and preserve all working Phase 1 functionality.

# 1. FIRST: ANALYZE THE EXISTING CODEBASE

Before writing any code:

1. Read `docs/architecture.md` completely.
2. Inspect the existing PDF engine stub.
3. Inspect `ConversionEngine` and `EngineContext`.
4. Inspect `core/registry.rs` and existing PDF routes.
5. Inspect the format detection system.
6. Inspect the conversion manager and job queue.
7. Inspect existing PDF frontend pages and settings panels.
8. Inspect SQLite history and event handling.
9. Review existing tests and conventions.

Understand how the existing application works.

Do not duplicate functionality that already exists.

Create a short implementation plan based on the actual codebase.

# 2. PDF ENGINE IMPLEMENTATION

Implement the PDF engine using suitable, actively maintained libraries.

Preferred technologies:

- PDFium for rendering and page previews.
- qpdf for PDF structural operations, encryption and page transformations.
- lopdf for suitable native Rust PDF manipulation.
- Tesseract for optional future OCR integration.

Choose the most reliable implementation for each operation.

Do not add unnecessary dependencies.

# 3. REQUIRED PDF FEATURES

Implement the following features as real working operations.

## A. Images to PDF

Support:

- JPG to PDF
- JPEG to PDF
- PNG to PDF
- WEBP to PDF
- BMP to PDF
- TIFF to PDF
- Multiple images to a single PDF
- Preserve aspect ratio
- Page size selection
- Portrait and landscape
- Custom margins
- Image positioning
- Page ordering

## B. PDF to Images

Support:

- PDF to PNG
- PDF to JPG
- PDF to WEBP where supported

Options:

- DPI selection
- Image quality
- Page range
- All pages
- Selected pages
- Output naming conventions

## C. Merge PDF

- Multiple input PDFs.
- Drag-and-drop ordering.
- Page selection where practical.
- Output filename.
- Preserve source files.

## D. Split PDF

- Extract all pages individually.
- Split by page ranges.
- Split every N pages.
- Extract selected pages.
- Custom output directory.

## E. Rotate PDF

- Rotate 90, 180 and 270 degrees.
- Apply to all pages.
- Apply to selected pages.
- Preserve original page content.

## F. Reorder and Extract Pages

- Visual page thumbnails.
- Drag-and-drop page ordering.
- Remove selected pages.
- Extract selected pages.
- Export reordered PDF.

## G. Compress PDF

Provide configurable compression levels:

- Low compression.
- Balanced compression.
- High compression.

Preserve readability and avoid silently degrading image quality.

Report actual input and output file sizes and percentage saved.

Do not claim compression succeeded if the resulting file is larger.

## H. PDF Metadata

- Read metadata.
- Edit title.
- Author.
- Subject.
- Keywords.
- Creator where supported.

## I. Password Handling

- Support opening PDFs when the user supplies the correct password.
- Support removing encryption when legally and technically permitted.
- Support setting passwords on output PDFs.
- Never bypass encryption or claim to recover unknown passwords.

# 4. ARCHITECTURE REQUIREMENTS

Use the existing ConversionEngine interface.

Preserve:

- ConversionManager.
- Format registry.
- Job queue.
- Worker pool.
- CancellationToken.
- ProgressSink.
- Job events.
- SQLite history.
- Output planning.
- Existing error handling.

Do not introduce a separate PDF job queue.

Keep PDF operations integrated into the existing conversion workflow.

Where an operation requires multiple input files or custom page operations, extend the existing job request and engine context carefully, maintaining backward compatibility with Phase 1.

Do not create fake conversion output.

Every successful job must produce a valid, readable output file.

# 5. SECURITY REQUIREMENTS

Implement:

- Validate PDF signatures.
- Handle malformed and corrupt PDFs safely.
- Respect file-size limits.
- Apply timeouts to external processes.
- Support cooperative cancellation.
- Use argv-only subprocess execution.
- Never invoke a command shell.
- Never overwrite source files.
- Check output disk space.
- Use isolated temporary directories.
- Clean temporary files safely.
- Validate generated PDF outputs.
- Avoid exposing passwords in logs, history or presets.

Do not trust file extensions alone.

# 6. FRONTEND IMPLEMENTATION

Build a polished PDF Studio experience consistent with the existing application.

Required interface:

- PDF dashboard.
- PDF operation selector.
- File dropzone.
- Multi-file upload.
- PDF page preview where applicable.
- Page selection.
- Page reordering.
- Conversion settings.
- Output location.
- Conversion progress.
- Success and failure states.
- Reveal output in Explorer.

The interface must use the existing shared components and stores.

Do not redesign unrelated application screens.

# 7. ENGINE AVAILABILITY

Implement truthful engine detection.

If PDFium or qpdf is missing:

- Display which dependency is missing.
- Explain which features are unavailable.
- Provide an actionable installation or configuration message.
- Never pretend an operation is available.

Use bundled binaries where configured and support the existing UC_*_PATH override convention.

Do not silently depend on software installed on the developer's machine.

# 8. TESTING REQUIREMENTS

Add automated tests for:

- Images to PDF.
- PDF to PNG/JPG.
- Merge PDF.
- Split PDF.
- Rotate PDF.
- Reorder pages.
- Extract pages.
- Compression.
- Metadata.
- Encrypted PDFs.
- Invalid PDFs.
- Cancellation.
- Timeout.
- Source-file preservation.
- Output signature and readability.
- Disk-space failure.

Use small real PDF fixtures and verify actual outputs.

Do not rely exclusively on mocked engine responses.

# 9. REGRESSION REQUIREMENTS

Phase 1 functionality must remain intact.

Run:

- cargo test
- cargo check --all-targets
- npm run build
- npm run lint

Investigate and fix regressions.

Do not delete, weaken or skip existing tests merely to achieve a passing build.

# 10. DOCUMENTATION

Update:

- docs/architecture.md
- README.md
- PDF engine documentation.
- Dependency installation instructions.
- Supported format and operation matrix.
- Known limitations.

Clearly distinguish implemented features from unavailable or planned features.

# 11. COMPLETION REPORT

When finished, provide:

1. Features implemented.
2. Libraries and binaries integrated.
3. Files created or modified.
4. Automated test results.
5. Build and lint results.
6. Manual testing instructions.
7. Remaining limitations.
8. Engine packaging status.
9. Confirmation that Phase 1 remains functional.

IMPORTANT:

Do not report Phase 2 as complete merely because the frontend renders or the engine reports itself available.

Phase 2 is complete only when real PDF files can be converted and manipulated successfully, the generated outputs are validated, and regression tests pass.

Work incrementally, preserve the existing architecture, and prioritize correctness over the number of features.