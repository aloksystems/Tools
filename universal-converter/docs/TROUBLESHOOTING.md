# Troubleshooting

All diagnostics stay on this PC. Settings → **Diagnostics & support** shows the
version, operating system, log location and engine health, and can export a
report plus log copies to a folder you choose. The report never contains file
contents.

## The app does not start

- Check the WebView2 Runtime. A blank window on a fresh Windows install usually
  means WebView2 is missing or broken; install the Evergreen runtime.
- Make sure the portable `resources` folder is beside `Universal Converter.exe`.
- Check `%APPDATA%\UniversalConverter\logs\universal-converter.log`.
- A per-user install does not need administrator rights. If the installation
  folder is read-only or blocked by policy, reinstall for the current user.

## An engine is missing

Settings → Engines shows the exact reason and the missing file name.

| Engine | What to check |
| --- | --- |
| FFmpeg / FFprobe | `resources/ffmpeg/ffmpeg.exe` and `ffprobe.exe`; or choose both in Settings → Engines. |
| LibreOffice | `resources/libreoffice/program/soffice.com`; a normal LibreOffice install is also detected. |
| 7-Zip | `resources/7zip/7z.exe`; a system 7-Zip installation is also detected. |
| PDFium | `resources/pdfium/pdfium.dll`. |
| qpdf | `resources/qpdf/qpdf.exe`. |
| Tesseract | `resources/tesseract/tesseract.exe` and a `tessdata` folder with at least one language. |
| ImageMagick | Optional; only needed for AVIF/HEIC/SVG input. |

Press **Re-scan** after changing files. If you entered a wrong explicit path, the
engine deliberately stays missing instead of falling back to another build; clear
the field to use the bundled copy again.

## OCR says no languages are installed

The app lists languages by asking Tesseract (`--list-langs`). Install
`*.traineddata` files into `resources/tesseract/tessdata` or point **Settings →
Engines → OCR languages** at a folder that contains them, then re-scan. The
release bundles English (`eng`) and orientation data (`osd`).

## A conversion fails

The error panel shows the engine's message. Common causes:

- **Unsupported or corrupt file** — the format is detected from the bytes, not
  the extension. Renaming a file does not convert it.
- **Wrong password** — encrypted PDFs and archives need the password in the job
  panel. A wrong password is reported, never bypassed.
- **Input too large** — raise the limit in Settings → Throughput only if the
  machine has enough memory/disk.
- **Disk full or permission denied** — choose another output folder. The original
  file and the existing output are left untouched.
- **Engine timeout** — LibreOffice, 7-Zip and OCR have per-job ceilings in
  Settings; a very large or hung document can exceed them. The child process is
  killed and the partial output removed.

## A job seems stuck

Open Queue: cancel the job, then retry. LibreOffice and FFmpeg jobs poll a
cancellation token; a sidecar that does not exit is killed at the timeout. If the
app itself was terminated, restart it: unfinished jobs are reported from history
and abandoned scratch folders can be purged in Settings.

## Output went somewhere unexpected

Settings → Output controls the default (beside the source, in a `Converted`
folder, or one fixed folder). A per-batch folder chosen in a studio overrides the
default for that batch. The output path is always shown in Queue and History.

## SmartScreen / antivirus warning

The current build is unsigned, so SmartScreen may warn about an unknown
publisher. Verify the SHA-256 checksum in `checksums.txt`. Some antivirus
products flag bundled FFmpeg or portable LibreOffice; restore them from quarantine
and keep the `resources` layout intact. Signing is described in
[BUILD.md](BUILD.md#code-signing).

## "Unknown publisher" during installation

Same cause: unsigned build. The installer is per-user. If organizational policy
blocks unsigned executables, ask IT to allow the verified hash or use a signed
build.

## I need to start over

- Settings → Diagnostics → **Reset settings** restores every preference but keeps
  presets, workflows, history and files.
- **Clear history** removes history rows only.
- **Export report** creates a diagnostic folder; delete it when support is done.
- To remove everything, close the app and delete
  `%APPDATA%\UniversalConverter`. This deletes settings, history, presets,
  workflows and automation rules. It never deletes converted files.

## Reporting a problem

Open Settings → **Diagnostics & support**:

- **Copy summary** copies the app version, Windows version, architecture and
  detected engine versions to the clipboard. It contains no file paths, file
  names or converted content, and nothing is sent anywhere.
- **Export report** writes a diagnostic report and log copies into a folder you
  choose. Review it before sharing; unlike the summary, the report includes
  system paths. It is never uploaded automatically.
- If this build was compiled with an official support page, **Open support
  page** opens it in your default browser. Otherwise Settings states that no
  support page is configured in this build.

Note the exact steps, input format, output format and error text, then send the
summary or report through the channel you received this build from. No public
support endpoint is configured in this build, and nothing is uploaded
automatically. Remove paths from the report if you consider them sensitive.
