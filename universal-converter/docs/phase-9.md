# PHASE 9 — LONG-TERM MAINTENANCE, AUTOMATION & ECOSYSTEM

You are working on my Windows desktop application **Universal Converter**, built using Tauri 2, React, TypeScript and Rust.

Your objective is to prepare the application and its development infrastructure for long-term maintenance, reliable updates, automated releases and future expansion.

This is a maintenance and engineering phase, not an excuse to add unnecessary features.

## 1. FIRST: COMPLETE PROJECT AUDIT

Before making changes:

1. Inspect the complete repository.
2. Review the architecture and technical documentation.
3. Review all implemented conversion engines.
4. Review dependency versions and licenses.
5. Review database migrations.
6. Review installer and update configuration.
7. Review GitHub repository and existing workflows.
8. Review logging, error handling and crash recovery.
9. Review the results of Phase 7 QA.
10. Review Windows integrations implemented in Phase 8.

Identify technical debt, outdated dependencies, maintenance risks and missing automation.

Do not assume previous phases are complete.

## 2. AUTOMATED BUILD PIPELINE

Set up reliable CI/CD using GitHub Actions.

Automate:

- Rust compilation.
- Frontend dependency installation.
- Frontend build.
- Linting.
- Rust tests.
- Frontend tests.
- Integration tests where feasible.
- Release build generation.
- Artifact uploading.

Requirements:

- Use supported and pinned action versions.
- Cache dependencies safely.
- Avoid exposing secrets in logs.
- Fail the pipeline when required tests fail.
- Separate development checks from production releases.
- Do not publish releases automatically from ordinary commits.

Create maintainable workflow files under:

`.github/workflows/`

## 3. AUTOMATED RELEASE MANAGEMENT

Create a consistent release process.

Implement or document:

- Semantic versioning.
- Version consistency across application metadata.
- Release notes.
- Changelog generation.
- Git tags.
- Installer generation.
- Portable package generation where supported.
- Checksums.
- Update metadata.
- Release artifact validation.

Suggested versioning:

- MAJOR: Breaking changes.
- MINOR: New features.
- PATCH: Bug fixes and security fixes.

Never generate a production release from an unverified build.

## 4. DEPENDENCY MANAGEMENT

Create a systematic dependency maintenance process.

Review:

- Rust crates.
- npm packages.
- Tauri dependencies.
- FFmpeg.
- PDF libraries.
- LibreOffice.
- 7-Zip.
- Tesseract.
- Other bundled or optional engines.

Requirements:

- Identify outdated dependencies.
- Check security advisories.
- Review license compatibility.
- Detect abandoned dependencies.
- Avoid unnecessary dependency additions.
- Pin or constrain versions where appropriate.
- Test updates before accepting them.

Do not automatically upgrade every dependency without compatibility testing.

Create a dependency inventory document.

## 5. ENGINE VERSION & COMPATIBILITY MANAGEMENT

Build a maintainable engine compatibility system.

For every external engine, document:

- Engine name.
- Version.
- Supported platforms.
- Supported formats.
- Required or optional status.
- Bundling status.
- License.
- Compatibility limitations.

Implement engine health checks where appropriate.

When an engine is unavailable or incompatible:

- Show a clear message.
- Identify the affected features.
- Provide setup instructions.
- Avoid crashing the application.

Do not silently switch to an incompatible engine.

## 6. CRASH RECOVERY & JOB RECOVERY

Improve reliability after unexpected shutdowns.

Handle:

- Application crash.
- Windows shutdown.
- Forced application termination.
- Interrupted conversion.
- External engine crash.
- Unexpected system restart.

Requirements:

- Detect interrupted jobs on startup.
- Mark unfinished jobs accurately.
- Clean up abandoned temporary files safely.
- Preserve completed outputs.
- Preserve user history.
- Offer retry where appropriate.
- Never assume an incomplete output is valid.

Do not automatically restart expensive conversions without user consent unless the user explicitly enabled such behavior.

## 7. BACKUP & RESTORE

Implement reliable local backup and restore for application data.

Include, where applicable:

- Settings.
- Saved presets.
- Conversion history.
- Favorite tools.
- User-defined workflows.

Requirements:

- Versioned backup format.
- Backup validation.
- Restore preview.
- Confirmation before replacing existing data.
- Safe database migration after restore.
- Corrupted backup handling.

Do not include original user files or sensitive temporary files unless explicitly requested.

## 8. LOGGING & DIAGNOSTICS

Improve diagnostic capabilities.

Implement or verify:

- Rotating application logs.
- Engine execution logs.
- Conversion failure diagnostics.
- Crash information.
- Application version.
- Engine version information.
- Exportable diagnostic report.

Requirements:

- Logs remain local.
- No automatic external uploads.
- Avoid logging sensitive file contents.
- Avoid exposing unnecessary personal paths.
- Limit log storage size.

## 9. SECURITY MAINTENANCE

Create a repeatable security maintenance process.

Check:

- Dependency vulnerabilities.
- Unsafe Rust code.
- Tauri permissions.
- Subprocess execution.
- External binary integrity.
- Update signatures.
- File handling.
- Archive extraction.
- Database integrity.
- Temporary directory handling.

Add automated dependency security checks where appropriate.

Document how security issues should be reported and handled.

Never claim a complete security audit merely because automated scanners pass.

## 10. UPDATE SYSTEM MAINTENANCE

Maintain the update system implemented in Phase 6.

Verify:

- Update metadata generation.
- Signature verification.
- Version comparison.
- Release channel configuration.
- Interrupted update behavior.
- Failed update recovery.
- User confirmation.
- Settings and history preservation.

If update hosting or signing infrastructure is unavailable, document exactly what remains necessary.

Do not invent signing credentials or publish fake update endpoints.

## 11. USER FEEDBACK & BUG REPORTING

Prepare a simple, privacy-conscious feedback workflow.

Users should be able to:

- View application version.
- Export diagnostic logs.
- Copy basic system and engine information.
- Find the official support or issue-reporting page.
- Report a problem manually.

Requirements:

- No automatic upload of user files.
- No automatic upload of private logs.
- No unnecessary telemetry.
- Ask for consent before sharing diagnostic information.

Use a configurable official support URL rather than inventing one.

## 12. DEVELOPER EXPERIENCE & CODE MAINTAINABILITY

Improve the internal project structure without unnecessary rewrites.

Review:

- Module boundaries.
- Conversion engine interfaces.
- Shared types.
- Error handling.
- Database access.
- Logging.
- Configuration.
- Tests.
- Documentation.

Requirements:

- Remove genuinely unused code.
- Avoid duplicate implementations.
- Keep engine integrations modular.
- Document important architectural decisions.
- Add comments where they explain non-obvious behavior.
- Avoid overengineering.

Create or update:

- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/RELEASE-PROCESS.md`
- `docs/DEPENDENCIES.md`
- `docs/SECURITY.md`

## 13. FUTURE EXTENSIBILITY

Prepare a clear architecture for future conversion formats and tools.

A new conversion engine should be addable without rewriting the entire application.

Document:

- How to register a new engine.
- How to add supported formats.
- How to add conversion routes.
- How to add custom job parameters.
- How to add UI tools.
- How to add engine tests.
- How to handle optional dependencies.

Do not implement a third-party plugin marketplace in this phase.

Keep the architecture extensible but secure.

## 14. FINAL REGRESSION TESTING

Run all relevant tests after maintenance changes.

Verify:

- Existing image conversion.
- PDF operations.
- Audio and video operations.
- Document conversions.
- Archive operations.
- OCR.
- Advanced utilities.
- Batch processing.
- Job cancellation.
- Presets.
- History.
- Settings.
- Windows integration.
- Installer.
- Update system.

Use the actual commands configured in the repository.

Test both development and packaged builds where possible.

Do not mark untested functionality as verified.

## 15. FINAL DOCUMENTATION

Update the documentation with:

- Current architecture.
- Supported formats.
- Dependency inventory.
- Build instructions.
- CI/CD instructions.
- Release procedure.
- Update procedure.
- Backup and restore guide.
- Troubleshooting.
- Security reporting process.
- Known limitations.

Remove outdated documentation that contradicts the actual implementation.

## 16. FINAL COMPLETION REPORT

Provide:

1. CI/CD implementation status.
2. Automated test pipeline status.
3. Release automation status.
4. Dependency audit results.
5. Security maintenance results.
6. Crash recovery status.
7. Backup and restore status.
8. Update system status.
9. Documentation updates.
10. Remaining technical debt.
11. Remaining limitations.
12. Exact files changed.

Use these statuses:

- VERIFIED
- IMPLEMENTED BUT NOT VERIFIED
- PARTIALLY IMPLEMENTED
- NOT IMPLEMENTED

## FINAL RULES

- Preserve existing functionality.
- Do not rewrite the application unnecessarily.
- Do not introduce unnecessary dependencies.
- Never expose secrets.
- Never fabricate CI/CD or release results.
- Never automatically upload private user data.
- Do not claim an update system is live without real infrastructure.
- Fix root causes instead of hiding errors.
- Keep Universal Converter offline-first.
- Prioritize long-term stability and maintainability.

The final objective is to make Universal Converter a maintainable, secure and professionally managed desktop application that can continue evolving reliably for years.