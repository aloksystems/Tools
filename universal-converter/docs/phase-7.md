# PHASE 7 — QUALITY ASSURANCE & WINDOWS COMPATIBILITY TESTING

You are working on my Windows desktop application **Universal Converter**, built using Tauri 2, React, TypeScript and Rust.

Your objective is to perform a comprehensive quality assurance and compatibility testing phase.

This is not a feature-development phase. Focus on identifying, reproducing, fixing and verifying bugs across the existing application.

## 1. COMPLETE PROJECT AUDIT

Before changing anything:

1. Inspect the entire repository.
2. Review the current architecture and implemented features.
3. Review all conversion engines and supported formats.
4. Review the job queue, worker system and cancellation logic.
5. Review SQLite database operations and migrations.
6. Review temporary file and cache management.
7. Review Windows installer and portable builds.
8. Review all existing automated tests.

Identify:
- Known bugs.
- Potential failure points.
- Missing test coverage.
- Platform-specific problems.
- Performance bottlenecks.
- Inconsistent behavior between conversion engines.

Do not assume every feature is implemented or working.

## 2. WINDOWS COMPATIBILITY TESTING

Test compatibility with:

- Windows 10 (64-bit).
- Windows 11 (64-bit).
- Different Windows user accounts.
- Standard user permissions.
- Administrator permissions.
- Different installation directories.
- Paths containing spaces.
- Paths containing non-English characters.
- Different drive locations.
- External USB drives, where available.

Verify:
- Application installation.
- Application startup.
- Engine discovery.
- File access.
- Conversion operations.
- Output generation.
- Application upgrades.
- Uninstallation.
- Settings and history persistence.

If a real Windows environment is unavailable, clearly distinguish automated checks from actual Windows testing. Never claim an untested platform is verified.

## 3. CONVERSION ENGINE TESTING

Test every implemented conversion engine independently.

### Image
- JPEG, PNG, WebP, BMP, TIFF, GIF, ICO.
- AVIF, HEIC and SVG where supported.
- Quality and compression.
- Resize, crop and rotation.
- Transparency handling.
- Metadata removal.
- Animated image handling where supported.

### PDF
- Image to PDF.
- PDF to images.
- Merge and split.
- Rotate and reorder.
- Compression.
- Password-protected PDF handling.
- Metadata operations.

### Audio
- MP3, WAV, FLAC, AAC, M4A, OGG, OPUS and other implemented formats.
- Bitrate and sample rate.
- Channel configuration.
- Audio trimming.
- Metadata preservation.

### Video
- MP4, MKV, MOV, AVI, WEBM and other implemented formats.
- Codec compatibility.
- Resolution changes.
- Frame rate changes.
- Video compression.
- Audio extraction.
- Trimming.
- Thumbnail generation.

### Documents and Archives
- DOCX, DOC, ODT, RTF, TXT.
- XLSX, XLS, CSV, ODS.
- PPTX, PPT, ODP.
- ZIP, 7Z, TAR, GZ and other implemented formats.
- Archive creation and extraction.
- Password handling where supported.
- Safe extraction.

Only test formats that the current application actually supports. Record unsupported formats separately.

## 4. EDGE CASE & FAILURE TESTING

Test unusual and invalid scenarios:

- Empty files.
- Corrupted files.
- Incorrect file extensions.
- Unsupported formats.
- Extremely large files.
- Very small files.
- Password-protected files.
- Files with unusual characters in their names.
- Duplicate filenames.
- Read-only files.
- Files without write permissions.
- Missing source files.
- Missing output directories.
- Insufficient disk space.
- Interrupted conversions.
- Missing external engines.
- Engine crashes.
- Unexpected process termination.

The application must fail safely and provide useful error messages.

## 5. BATCH & JOB QUEUE TESTING

Thoroughly test:

- Single conversion.
- Multiple simultaneous conversions.
- Large batch conversions.
- Mixed-format batch jobs.
- Job cancellation.
- Job retry.
- Job failure.
- Job completion.
- Queue pause and resume, if implemented.
- Application closing during active jobs.
- Restart and recovery behavior.

Verify:
- Correct progress reporting.
- No duplicate output files.
- No accidental source overwrites.
- No stuck jobs.
- No corrupted queue state.
- Proper cleanup of temporary files.

## 6. MEMORY & PERFORMANCE TESTING

Measure performance under realistic workloads.

Test:
- Large images.
- Large PDFs.
- Long audio files.
- Long videos.
- Large archives.
- Multiple simultaneous jobs.
- Extended application usage.

Monitor:
- CPU usage.
- Memory consumption.
- Disk usage.
- Temporary storage growth.
- UI responsiveness.
- Startup time.
- Conversion time.

Find and fix:
- Memory leaks.
- Unnecessary file copies.
- Unbounded queues.
- Excessive parallel processing.
- Temporary file accumulation.
- UI blocking.
- Resource exhaustion.

Use streaming processing where appropriate.

## 7. DATABASE & DATA INTEGRITY TESTING

Test:
- SQLite database initialization.
- Database migrations.
- Existing database upgrades.
- Application restarts.
- History persistence.
- Preset persistence.
- Settings persistence.
- Interrupted database writes.
- Invalid database states.
- Database backup and restore, if implemented.

Never silently destroy user data.

## 8. SECURITY & FILE SAFETY TESTING

Perform security-focused tests.

Verify:
- Path traversal protection.
- Archive extraction safety.
- Symlink handling.
- Temporary directory isolation.
- Subprocess argument safety.
- Process timeouts.
- Cancellation cleanup.
- Malicious or malformed input handling.
- Resource exhaustion protection.
- File permission handling.

Ensure:
- Original files are never modified.
- Existing output files are not silently overwritten.
- Converted files are not automatically executed.
- User files never leave the device without explicit user consent.

Fix critical and high-severity vulnerabilities.

## 9. AUTOMATED TESTING

Expand the existing test suite.

Add:
- Rust unit tests.
- Rust integration tests.
- Frontend component tests.
- Conversion engine tests.
- Database tests.
- Job queue tests.
- Security tests.
- End-to-end tests where practical.

Use deterministic test fixtures.

Tests must verify actual output files, not merely successful function returns.

For conversions, validate:
- Output existence.
- File signatures.
- Correct output format.
- Expected dimensions, duration or page count.
- Output readability.
- Basic quality or integrity requirements.

Do not rely entirely on mocked engines.

## 10. REGRESSION TESTING

After fixing bugs, rerun all relevant tests.

Verify that existing functionality remains intact.

Use the actual project scripts after inspecting package.json and Cargo configuration.

Check:
- Rust tests.
- Rust compilation.
- Frontend build.
- Frontend lint.
- Installer build.
- Packaged application startup.

Do not introduce unnecessary architectural changes.

## 11. TEST REPORT & BUG TRACKING

Create a professional QA report.

Suggested structure:

docs/QA-REPORT.md

Include:

- Test environment.
- Windows versions tested.
- Hardware specifications where available.
- Features tested.
- Conversion formats tested.
- Test cases and results.
- Bugs discovered.
- Bugs fixed.
- Remaining bugs.
- Performance observations.
- Security findings.
- Platform compatibility status.
- Known limitations.

Use these statuses:

- PASS
- FAIL
- BLOCKED
- NOT TESTED
- NOT APPLICABLE

For every failed test, include:
1. Steps to reproduce.
2. Expected behavior.
3. Actual behavior.
4. Root cause, if identified.
5. Fix applied, if any.
6. Retest result.

## 12. FINAL COMPLETION REPORT

At the end, provide:

1. Total tests executed.
2. Tests passed.
3. Tests failed.
4. Tests blocked.
5. Bugs discovered.
6. Bugs fixed.
7. Remaining critical issues.
8. Windows compatibility results.
9. Conversion engine testing results.
10. Performance findings.
11. Security testing results.
12. Regression testing results.
13. Updated QA report location.

**FINAL RULES**

- Never fabricate test results.
- Never mark a test as passed without evidence.
- Never claim Windows 10 or Windows 11 compatibility without appropriate testing.
- Never use mocked results as proof of real conversion functionality.
- Never remove existing functionality to make tests pass.
- Fix root causes instead of hiding errors.
- Preserve all user data.
- Do not add unnecessary features during QA.

The final objective is to establish that Universal Converter is stable, reliable, secure and ready for real-world Windows users.