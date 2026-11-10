# Known limitations

This is the honest state of version 1.0.1. Items move here only when there is
evidence, not because a feature is planned.

## Distribution

- Windows x64 only. No ARM64 or 32-bit build is produced.
- The current build is unsigned; SmartScreen may warn. See
  [BUILD.md](BUILD.md#code-signing).
- No live auto-update service. Updates are manual until an endpoint and signing
  keys exist.
- No support page is configured in the public 1.0.1 build. Settings → Diagnostics
  & support can copy a system/engine summary and export a diagnostic report
  locally; a build that sets `VITE_SUPPORT_URL` also shows an **Open support
  page** button. Nothing is uploaded automatically.
- Installer/portable are large (over 2 GB installed) because LibreOffice, FFmpeg,
  Tesseract, PDFium and 7-Zip are bundled for offline use.
- The engine payload is not stored in the source repository (individual binaries
  exceed normal hosting limits). CI therefore runs checks on hosted runners but
  needs a self-hosted Windows runner with `resources/` for the full engine suite
  and for release builds.
- Some direct dependencies have newer releases that were deliberately not taken
  before 1.0.0; see [DEPENDENCIES.md](DEPENDENCIES.md#deferred-updates-reviewed-2026-11-02).

## Engines and formats

- ImageMagick is **not bundled**. AVIF, HEIC and SVG input remain unavailable
  until the user supplies `magick.exe`; they are never advertised when missing.
- PDF → BMP/TIFF/GIF/ICO is not offered; only PNG/JPEG/WebP rendering is
  validated.
- LibreOffice routes are limited by document family: Writer files cannot become
  spreadsheets or presentations, and the UI does not advertise impossible
  cross-family routes.
- Tesseract ships with English and orientation data only. Other languages must be
  added to `tessdata`.
- FFmpeg is the bundled BtbN GPL build; codec availability follows that build.
  Hardware encoders appear only after a real test encode.
- 7-Zip password handling is limited to what the bundled CLI supports; the app
  never attempts to bypass a missing password.
- Hardware-accelerated video encoding needs an NVIDIA NVENC, Intel Quick Sync
  or AMD AMF encoder that passes a real one-frame test encode; the app then
  offers it and falls back to software when the test fails. GPU image filters
  and distributed conversion are not implemented.
- No third-party plugin manager or format marketplace.

## Automation and workflows

- Automation converts/OCRs new files in watched folders. It cannot run arbitrary
  workflow chains, and it never deletes originals.
- Workflows support 1–6 steps and two step types (Convert, OCR). PDF merge and
  other multi-input tools are not workflow steps.
- Watcher delivery uses `notify` plus a settle delay (1.5 s); files written
  slowly by another program are handled best-effort, with an hour-long dedupe
  window.
- Folder watching is per local/available drive; network shares are not a tested
  target.

## Platform and UX

- Explorer integration (right-click “Convert with Universal Converter” and an
  Open With entry) is opt-in in Settings and writes only per-user HKCU keys. No
  default file associations are forced. The keys were not exercised
  interactively in this build because that changes the machine.
- A tray icon provides Show, Open queue and Quit. Closing the main window exits
  the app; there is no minimize-to-tray option.
- Completion toasts are opt-in (`nativeNotifications`), sent only while the
  window is hidden, and require notification permission granted from Settings.
- App-level shortcuts (Ctrl+K palette, F1 shortcut list, Ctrl+, Settings,
  Ctrl+Shift+Q Queue) need the window focused. No OS-global hotkeys exist.
- Single window. No tabs or multiple simultaneous projects.
- Labels, focus order and colour contrast were verified in a browser. Screen
  reader output and Windows high-contrast mode were not tested with OS assistive
  technology.
- Light/dark themes exist; switching was not exercised through the native shell.

## Reliability and data

- A conversion is not resumed after a crash. Interrupted jobs are reported, and
  partial scratch files are purged; the user may retry manually.
- Settings → Backup & restore exports a versioned JSON bundle of app data
  (settings, presets, history, favorites, rules, workflows) and restores it in
  one transaction after validation. It does not back up user files, and a
  corrupted or foreign backup is refused without touching existing data.
- The app does not silently delete history, presets or user outputs.
- Windows 10 and Windows 11 have been exercised on the development machine only
  where the QA report says so; other Windows editions/locales are not verified.
