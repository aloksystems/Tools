# Installation guide

## Requirements

- Windows 10 or Windows 11, 64-bit.
- Microsoft Edge WebView2 Runtime. It is present on current Windows 10/11
  installations; if the app shows a blank WebView, install the Evergreen
  WebView2 Runtime from Microsoft.
- About 2.6 GB free disk space for a full installation (the bundled conversion
  engines are the bulk of it).
- No administrator rights are required for the default per-user installation.

## Installer

1. Download the installer from
   <https://github.com/aloksystems/universal-converter/releases/tag/v1.0.1>.
2. Verify the download against `checksums.txt` from the same release (see below).
3. Run `Universal-Converter-Setup-1.0.1.exe`.
4. The installer is per-user and installs under
   `%LOCALAPPDATA%\Universal Converter`. No UAC prompt is expected.
5. Start **Universal Converter** from the Start Menu shortcut.

The build is currently **unsigned**. Windows SmartScreen can show “Windows
protected your PC” / “unknown publisher”. Choose **More info → Run anyway** only
if the checksum matches. Signing requirements are described in
[BUILD.md](BUILD.md#code-signing).

### Verify the checksum

```powershell
Get-FileHash .\Universal-Converter-Setup-1.0.1.exe -Algorithm SHA256
Get-Content .\checksums.txt
```

The printed hash must match the first value in `checksums.txt`.

## Portable build

1. Unzip `Universal-Converter-Portable-1.0.1.zip` to any folder.
2. Keep the `resources` folder next to `Universal Converter.exe`. The engine
   locator looks beside the executable; moving only the `.exe` removes every
   external engine.
3. Run `Universal Converter.exe`.

Portable does **not** mean data-free: settings, history and presets still live in
`%APPDATA%\UniversalConverter` so that upgrades and the installer share the same
data. To make a completely self-contained test, run the portable app under a
separate Windows user account.

## First run

The welcome screen shows the version, engine health, storage location, default
output folder and privacy summary. Missing optional engines are listed but never
block startup. Acknowledging the screen stores `welcomeCompleted` in the local
database.

Configure tool paths, default output behaviour, logs and diagnostics later under
**Settings**.

## Upgrade

Run the newer installer over the existing installation. The installer replaces
program files but leaves `%APPDATA%\UniversalConverter` (database, settings,
history, presets, workflows, automation rules) untouched. If the database schema
changes, it is migrated automatically on start.

Before a major upgrade, use Settings → Diagnostics → **Export report** only for
troubleshooting; it is not a backup of settings or presets.

## Uninstall

Use **Settings → Apps → Installed apps → Universal Converter → Uninstall** or the
Start Menu uninstall entry. This removes the program files and shortcuts.

It does not delete user data. To remove everything, delete
`%APPDATA%\UniversalConverter` manually **after** confirming you no longer need
the history or presets. Files you converted are never touched by installation or
uninstallation.

## Engine paths

All engines used by the shipped features are bundled. If you need a different
build, open **Settings → Engines → Use a different copy of a tool** and select:
FFmpeg, FFprobe, Tesseract, the OCR language folder, LibreOffice `soffice.com`,
7-Zip `7z.exe`, qpdf or PDFium. A configured path overrides the bundled copy and
PATH; an invalid path marks the engine missing instead of silently switching.

ImageMagick is the only engine not bundled. Drop `magick.exe` and its DLLs into
`resources/imagemagick/` (installer: `%LOCALAPPDATA%\Universal
Converter\resources\imagemagick`) to enable AVIF, HEIC and SVG input.

## Manual updates

This build has no update server configured. Check for a newer release through
the channel you received this build from and install it over the current version.
Settings and history are preserved.
