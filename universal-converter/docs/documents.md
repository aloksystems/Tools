# Documents — engine reference

Office documents are converted by a bundled, headless LibreOffice 25.8.7.3.
The app never asks the user to install LibreOffice and never opens a window.

## Supported routes

A document stays inside its LibreOffice family. A Writer file cannot become a
workbook or a slide deck, so those routes are not advertised.

| Input family | Inputs | Outputs |
| --- | --- | --- |
| Writer | DOCX, DOC, ODT, RTF, TXT, HTML | **DOCX, DOC, ODT, RTF, TXT, HTML, PDF** |
| Calc | XLSX, XLS, ODS, CSV | **XLSX, XLS, ODS, CSV, HTML, PDF** |
| Impress | PPTX, PPT, ODP | **PPTX, ODP, PDF** |

Legacy inputs (`.doc`, `.xls`, `.ppt`) are opened by the same components as their
modern counterparts. PDF → Office is not offered: importing and rebuilding a PDF
is not the same as converting it, and pretending otherwise would lose layout.
Presentations do not export to the legacy `.ppt` binary format; PPTX is the
write target.

### Sheet selection

CSV is a projection of **one** sheet. The Documents panel asks the engine for
the workbook's sheet names (`document_sheets`) and offers them in a picker; the
1-based index is passed to LibreOffice's calc CSV filter. Every other Calc output
keeps all sheets, so no sheet is silently dropped. If a workbook cannot be read
for its names, the panel keeps the first-sheet default and says so.

### PDF export settings

These settings only apply when the output format is PDF:

| Setting | Meaning |
| --- | --- |
| Page range | LibreOffice syntax (`1-3,5`); empty means every page. Characters are validated before they reach argv. |
| Image quality | JPEG quality 1–100 for lossy PDF images. |
| Lossless | Keep images lossless (larger file, no JPEG artefacts). |
| Export notes | Include speaker notes / comments where the component supports it. |

The same values become the `FilterData` JSON passed to
`writer_pdf_Export`, `calc_pdf_Export` or `impress_pdf_Export`.

### Batch behaviour

The Documents page submits **one job per file**, so cancel, retry, progress and
history work exactly like every other conversion. Each file can carry its own
output name. Batch-only names are removed before settings reach a preset row.
Output format and output folder are shared by the batch.

## LibreOffice integration

Lookup order (`DocumentEngine::probe`):

1. `UC_LIBREOFFICE_PATH`, which must point at `soffice.com` (Windows console
   launcher) or `soffice.exe`.
2. `resources/libreoffice/program/soffice.com` next to the executable or in the
   repository during development.
3. The normal Windows install folders (`Program Files\LibreOffice\program`,
   `%LOCALAPPDATA%\Programs\LibreOffice\program`).
4. `PATH`, split by the OS, never through a shell.

The probe records the real version (`--version`) and the engine stays unavailable
with that reason if the binary is missing or broken.

Every conversion:

- creates its own scratch folder under the app temp root;
- creates a unique profile there and passes
  `-env:UserInstallation=file:///<percent-encoded path>` so the user's own
  LibreOffice profile is never touched and two jobs cannot collide on a lock;
- runs `--headless --norestore --invisible --nodefault --nolockcheck --nologo
  --nofirststartwizard --convert-to <filter> --outdir <scratch> <input>`;
- passes arguments as argv, with no command shell;
- waits with the `documentTimeoutSeconds` deadline (default 300 s), kills and
  reaps the process on timeout or cancel;
- refuses to publish when the output is missing, empty or not the requested
  format.

### Output validation

A zero exit code is not proof. The engine re-reads the produced file:

| Requested | Check |
| --- | --- |
| PDF | Real PDF signature, `lopdf` opens it, at least one page |
| DOCX / XLSX / PPTX | Valid ZIP with `word/document.xml`, `xl/workbook.xml` or `ppt/presentation.xml` |
| ODT / ODS / ODP | Valid ZIP whose `mimetype` entry names the right OpenDocument type |
| DOC / XLS / PPT | Byte signature matches the format |
| HTML | Non-binary head containing `<html` or `<!doctype` |
| TXT / CSV / RTF | Non-empty and readable as text |

The finished file is committed from the scratch folder to the planned
destination. The planner refuses any destination equal to a source, and the
commit never overwrites a source even under the `Overwrite` collision policy.

### Failures

- A missing tool is `engineUnavailable` with the lookup paths and the override
  variable.
- A corrupt input is `corrupt`/`unreadable`, not an empty document.
- A LibreOffice timeout is `timeout`; cancel is `cancelled`.
- If LibreOffice exits 0 but writes no usable file, the job is `invalidOutput`
  and nothing is published.
- Encrypted Office files are detected by their CFB `EncryptionInfo` stream.
  Without a password the job is `needsPassword`; with one it is
  `passwordUnsupported`, because headless LibreOffice exposes no non-interactive
  password argument. Plain Office files (unencrypted) have no password path in
  this engine.

## Setup and packaging

The bundled folder is `resources/libreoffice/` (program, share, fonts and the
license files from the 25.8.7 Windows x64 package).
`src-tauri/tauri.conf.json` maps `resources/libreoffice/**/*` into the packaged
app. `UC_LIBREOFFICE_PATH` overrides the bundle for a local or test install.

No network access, registry write or system installation is involved. Re-scan
**Settings → Engines** after pointing the override at a different build.

## Known limitations

- Output fidelity is LibreOffice's; complex Word/Excel/PowerPoint layout (fonts
  not installed on this machine, exotic fields, animations) can differ from the
  original. The app does not claim pixel-perfect round trips.
- PDF import/rebuild is out of scope.
- Password-protected Office documents are refused with an explicit message
  rather than bypassed.
- CSV keeps one sheet by design; use XLSX/ODS to keep the whole workbook.
- The converter never invokes macros or automation. Converted Office files can
  still contain macros if the export filter preserved them; treat converted
  documents as untrusted content, exactly like the input.
