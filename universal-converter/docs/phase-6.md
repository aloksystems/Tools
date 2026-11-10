# PHASE 6 — PRODUCTION RELEASE, INSTALLER & FINAL POLISH

You are working on my Windows desktop application **Universal Converter**.

Phase 6 is the final production-readiness phase. Your goal is to transform the existing application into a stable, secure, professional Windows application that users can install and use without requiring a development environment.

## 1. FIRST: AUDIT THE ENTIRE PROJECT

Before making any changes:

1. Inspect the complete repository and current architecture.
2. Identify which features from Phases 1–5 are actually implemented.
3. Check all conversion engines, UI pages, Rust commands, database migrations, sidecar binaries, settings, and tests.
4. Identify missing functionality, broken integrations, placeholder features, and production risks.
5. Run the existing test suite and record the baseline results.

**Important:**
- Do not assume previous phases are complete.
- Do not rebuild the application from scratch.
- Do not remove or break existing functionality.
- Fix existing critical issues before packaging.
- Do not mark incomplete features as production-ready.

## 2. WINDOWS INSTALLER & PORTABLE RELEASE

Prepare professional Windows distribution packages.

Required outputs:

- Windows installer (`.exe` or `.msi`, depending on the selected Tauri-supported configuration).
- Portable ZIP release, if technically supported by the chosen packaging approach.
- Application icon and metadata.
- Proper application name: Universal Converter.
- Version number and release information.
- Start Menu shortcut.
- Desktop shortcut option.
- Proper installation and uninstallation.
- Application upgrade support.
- Clean installation and upgrade behavior.

Use the existing Tauri 2 architecture. Do not introduce another desktop framework.

## 3. ENGINE & DEPENDENCY BUNDLING

Make sure the application can access all required conversion engines after installation.

Audit and configure:

- Image processing engine.
- PDF processing engine.
- FFmpeg.
- FFprobe.
- LibreOffice.
- 7-Zip.
- Tesseract OCR.
- Any other external dependency actually used by implemented features.

Requirements:

1. Bundle essential dependencies where licensing and distribution allow.
2. Configure correct Tauri resource paths.
3. Never depend on the development machine's PATH.
4. Support explicit engine path overrides where appropriate.
5. Detect whether an engine is installed or available.
6. Show clear status for missing optional engines.
7. Provide a safe optional download/setup flow for engines that cannot be bundled.
8. Verify downloaded binaries using trusted sources and checksums or signatures.
9. Display engine versions and compatibility status.

The application should work offline after installation for all bundled features.

Do not bundle dependencies blindly. Review redistribution licenses and provide required notices.

## 4. FIRST-RUN EXPERIENCE

Create a polished first-run experience.

Include:

- Welcome screen.
- Application version.
- Engine availability check.
- Missing optional engine notifications.
- Storage and temporary folder information.
- Default output location configuration.
- Basic privacy information.
- Clear option to continue without configuring optional engines.

Do not force users to create accounts or connect to cloud services.

## 5. APPLICATION SETTINGS & STORAGE

Complete the settings and storage experience.

Implement or verify:

- Default output directory.
- Temporary files directory.
- Cache management.
- Preset management.
- Conversion history management.
- Theme settings.
- Startup preferences.
- Notifications preferences.
- Optional engine paths.
- Reset settings option.
- Clear cache option.
- Clear temporary files option.

Requirements:

- Use SQLite migrations safely.
- Never delete user output files when clearing cache.
- Never silently delete conversion history.
- Handle missing directories and permission errors gracefully.
- Preserve settings during application upgrades.

## 6. PRODUCTION SECURITY AUDIT

Perform a complete security review.

Check:

- File path validation.
- File type detection using file content where appropriate.
- Unsafe file handling.
- Archive extraction traversal protection.
- Symlink handling.
- Decompression bomb protection.
- Temporary file isolation.
- Subprocess execution security.
- Argument injection.
- Process timeout and cancellation.
- Resource exhaustion.
- Large file handling.
- Database integrity.
- External engine download verification.
- Tauri permissions and capabilities.
- Content Security Policy.

Rules:

- Never use shell-based command construction.
- Use safe argument arrays for subprocesses.
- Never execute converted files automatically.
- Never overwrite original files.
- Never expose sensitive local file paths unnecessarily.
- Never upload user files to external services.
- Do not introduce unnecessary telemetry.

Fix all critical and high-severity issues before release.

## 7. PERFORMANCE & STABILITY

Optimize the application for real-world usage.

Verify:

- Large file conversions.
- Multiple simultaneous jobs.
- Batch conversions.
- Memory usage.
- CPU usage.
- Cancellation responsiveness.
- UI responsiveness during conversions.
- Application startup time.
- History loading performance.
- Temporary file cleanup.
- Recovery from interrupted conversions.

The UI must never freeze during long-running operations.

Add sensible concurrency and resource limits.

Do not sacrifice output quality or conversion correctness for speed.

## 8. ERROR HANDLING & LOGGING

Implement production-grade error handling.

Requirements:

- Clear, user-friendly error messages.
- Detailed internal diagnostic logs.
- Conversion failure reasons.
- Engine missing or incompatible errors.
- Permission errors.
- Insufficient disk space errors.
- Invalid input errors.
- Corrupted file errors.
- Cancelled job handling.

Logging rules:

- Store logs locally.
- Add log rotation and size limits.
- Do not log file contents or sensitive information.
- Provide an option to export diagnostic logs.
- Never send logs automatically to an external service.

## 9. AUTO-UPDATE SYSTEM

Evaluate and implement a secure update mechanism if supported by the chosen Tauri 2 setup.

Requirements:

- Check for updates safely.
- Show current and available versions.
- Display release notes.
- Ask for user confirmation before installation.
- Verify update signatures.
- Handle interrupted or failed updates.
- Preserve user settings and history.

If update infrastructure requires external hosting or signing credentials, prepare the complete configuration and documentation without inventing credentials or claiming the system is live.

## 10. CODE SIGNING & RELEASE TRUST

Prepare the application for Windows distribution.

- Configure code-signing support.
- Document certificate requirements.
- Configure signing for installers and update artifacts.
- Verify packaged executable metadata.
- Avoid fake publisher information.
- Document SmartScreen considerations.

If no signing certificate is available, clearly document the unsigned-build limitation.

## 11. FINAL UI/UX POLISH

Review every screen of the application.

Check:

- Consistent design system.
- Typography and spacing.
- Icons and buttons.
- Empty states.
- Loading states.
- Error states.
- Success states.
- Conversion progress.
- Responsive layouts.
- Keyboard navigation.
- Accessibility.
- Dark and light themes, if implemented.

Remove:

- Debug elements.
- Development-only labels.
- Placeholder buttons.
- Fake functionality.
- Unnecessary UI.
- Broken navigation.
- Dead code.

Do not redesign the entire application unnecessarily. Improve the existing design system consistently.

## 12. TESTING & RELEASE VALIDATION

Run comprehensive tests.

### Functional testing
- Test every implemented conversion category.
- Test batch conversions.
- Test cancellation and retry.
- Test presets.
- Test conversion history.
- Test settings persistence.
- Test missing engine scenarios.
- Test invalid and corrupted files.

### Installation testing
- Fresh Windows installation.
- Application launch after installation.
- Conversion after installation.
- Application restart.
- Upgrade installation.
- Uninstallation.
- User data preservation.
- Portable build, if supported.

### Regression testing

Run all existing Rust and frontend tests.

Verify:
- `cargo test`
- `cargo check`
- `npm run build`
- `npm run lint`

Use the actual scripts configured in the repository. Do not assume these commands exist without checking.

Fix regressions before release.

## 13. DOCUMENTATION

Prepare professional documentation:

- README.md
- Installation guide.
- User guide.
- Supported formats list.
- Engine and dependency guide.
- Troubleshooting guide.
- Security and privacy notes.
- Build instructions.
- Release instructions.
- License and third-party notices.
- Known limitations.

Clearly distinguish fully supported formats from formats supported only by optional engines.

## 14. FINAL RELEASE STRUCTURE

Organize release artifacts cleanly.

Suggested structure:

release/
├── Universal-Converter-Setup.exe
├── Universal-Converter-Portable.zip
├── checksums.txt
└── RELEASE-NOTES.md

Build artifacts should be generated through the project's actual release configuration. Do not manually rename an unrelated executable and call it a release.

## 15. FINAL COMPLETION REPORT

When finished, provide a clear report containing:

1. Features successfully verified.
2. Features that remain incomplete.
3. Engines bundled.
4. Optional engines and their setup requirements.
5. Security issues found and fixed.
6. Tests executed and their actual results.
7. Installer build status.
8. Portable build status.
9. Update system status.
10. Code-signing status.
11. Exact paths of generated release artifacts.
12. Remaining known limitations.

For each feature, use one of these statuses:

- VERIFIED
- IMPLEMENTED BUT NOT VERIFIED
- PARTIALLY IMPLEMENTED
- NOT IMPLEMENTED

**FINAL RULES**

- Do not fake test results.
- Do not claim an installer exists unless it was actually generated.
- Do not claim a feature works without testing it.
- Do not remove existing working functionality.
- Do not compromise security for convenience.
- Do not leave placeholder implementations.
- Fix problems instead of hiding them.
- Prioritize a stable, reliable release over adding unnecessary features.

**The final objective is a genuinely production-ready Universal Converter Windows application that users can install, launch, and use confidently.**