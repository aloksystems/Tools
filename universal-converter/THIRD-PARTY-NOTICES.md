# Third-party notices

Universal Converter is offline software that bundles and calls the tools below.
This file is a summary; the complete licence texts ship inside the application's
`resources/` folder and are installed with it.

## Bundled engines

| Component | Version | Licence | Licence text |
| --- | --- | --- | --- |
| FFmpeg / ffprobe | n9.0.2-42-gd7643a0fe3-20261101 (BtbN GPL build) | GPLv3 (configured with `--enable-gpl --enable-version3`) | `resources/ffmpeg/LICENSE.txt` |
| LibreOffice | 25.8.7.3 | MPL-2.0 and LGPL-3.0 components | `resources/libreoffice/LICENSE.html`, `resources/libreoffice/license.txt` |
| 7-Zip | 26.05 | LGPL-2.1-or-later; `7z.dll` also contains unRAR-restricted and BSD-2/3-clause code | `resources/7zip/License.txt` |
| Tesseract OCR | 5.x portable build | Apache-2.0 | `resources/tesseract/LICENSE` |
| PDFium | 158.0.8125 | BSD-3-Clause-style Chromium licence | `resources/pdfium/LICENSE` |
| qpdf | 12.4.2 | Apache-2.0 | `resources/qpdf/LICENSE.html` |

The FFmpeg GPL build is distributed unchanged. Universal Converter calls it as a
separate process; the application's own Rust and JavaScript code is not derived
from FFmpeg. Redistributors must keep the GPL terms in mind when combining this
package with other software.

## Rust crates

The statically linked Rust dependencies include MIT, Apache-2.0, BSD, ISC,
Unicode-3.0 and Zlib licensed code. Their complete licence texts are collected
in [`resources/licenses/RUST-CRATES.md`](resources/licenses/RUST-CRATES.md),
generated with `npm run notices` from Cargo metadata for the Windows x64 build.

## Fonts

LibreOffice's bundled fonts carry their own licences; the font files and licence
information are part of the LibreOffice distribution under
`resources/libreoffice/Fonts/` and `resources/libreoffice/share/`.

## No telemetry

No third-party analytics, crash reporting or advertising SDK is bundled. The
application does not contact any server unless the user explicitly opens a
support link or installs a future update-enabled build.

If you believe a notice is missing or incorrect, please report it through the
support channel documented in `docs/SECURITY-PRIVACY.md`.
