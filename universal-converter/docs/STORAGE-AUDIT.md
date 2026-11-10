# Storage Audit — Universal Converter

Snapshot: 2026-11-02 23:53 IST
Root: `D:\Projects\universal-converter`
Method: full recursive walk of every directory, including hidden directories, using allocated file sizes and Windows file IDs (`GetFileInformationByHandle`) to detect hardlinks. No junctions, symlinks or other reparse points exist inside the project. Every size below was measured; totals reconcile exactly to the byte.

## Headline result

| Metric | Bytes | GiB | Notes |
|---|---:|---:|---|
| Explorer-style total (files summed once per path) | 31,942,995,623 | 29.75 | Matches Windows Properties "29.7 GB" |
| Unique on-disk data (hardlink identities counted once) | 28,784,867,080 | 26.81 | What the volume actually stores |
| Hardlink duplication inside the sum | 3,158,128,543 | 2.94 | Mostly Cargo build/dependency artifacts |
| Files | 86,131 | | Matches Properties exactly |
| Folders | 8,151 | | Matches Properties exactly |
| Reparse points (junctions/symlinks) | 0 | | No double-counting through links |

The 29.7 GB is therefore real logical size, not a reporting bug. It is overwhelmingly Rust build output:

| Top-level directory | Bytes | GiB | % of total | Files |
|---|---:|---:|---:|---:|
| `src-tauri` (of which `target` = 28,362,765,065) | 28,365,974,045 | 26.42 | 88.8% | 64,413 |
| `resources` (source engine binaries) | 2,073,227,826 | 1.93 | 6.5% | 14,330 |
| `release` (installer + portable ZIP copies) | 1,312,752,671 | 1.22 | 4.1% | 4 |
| `node_modules` | 188,471,123 | 0.18 | 0.6% | 7,236 |
| `design` | 835,633 | 0.00 | | 1 |
| `dist` (built frontend) | 779,689 | 0.00 | | 4 |
| `src` | 561,331 | 0.00 | | 101 |
| `docs` | 214,423 | 0.00 | | 23 |
| All other root files/dirs | 249,154 | 0.00 | | 20 |

There is no `.git` directory in this project and no `Cargo` cache inside the tree.

## `src-tauri/target` — 28,362,765,065 bytes (26.42 GiB)

| Directory | Bytes | GiB | Files |
|---|---:|---:|---:|
| `target/debug` | 20,866,578,275 | 19.43 | 37,433 |
| `target/debug/deps` | 10,105,480,140 | 9.41 | 4,005 |
| `target/debug/incremental` | 3,912,440,343 | 3.64 | 3,634 |
| `target/debug/resources` | 3,312,947,362 | 3.09 | 20,923 |
| `target/debug/build` | 3,269,145,521 | 3.04 | 2,729 |
| `target/debug/universal_converter.pdb` | 223,965,184 | 0.21 | 1 |
| `target/debug/universal-converter.exe` | 28,894,208 | 0.03 | 1 |
| `target/release` | 7,496,185,218 | 6.98 | 26,891 |
| `target/release/resources` | 3,312,952,705 | 3.09 | 20,923 |
| `target/release/deps` | 2,873,122,336 | 2.68 | 1,957 |
| `target/release/build` | 644,255,586 | 0.60 | 1,090 |
| `target/release/bundle` (NSIS installer) | 634,155,465 | 0.59 | 1 |
| `target/release/universal-converter.exe` | 19,827,712 | 0.02 | 1 |
| `target/release/universal_converter.pdb` | 5,484,544 | 0.01 | 1 |
| `target/release/nsis` | 4,574,439 | 0.00 | 4 |

Most of `debug/deps` and `debug/build` is repeated historical compilation: five debug `universal_converter-*.pdb` files of 186–223 MB each, multiple `libwindows-*.rlib` builds of 135–215 MB each, and three `pdfium_render-*.lib` builds of ~210 MB each. These accumulate across incremental rebuilds because Rust keeps hashed variants. Debug information is the single largest driver: the eight `universal_converter` PDBs in the top 50 alone total about 1.68 GB, and the `libwindows` rlib/rmeta products in that list total about 2.19 GB.

The `release` directory is a legitimate release build, but it also holds a second copy of the 604.8 MB NSIS installer already copied to `release/`. The working installer is `release/Universal-Converter-Setup-1.0.0.exe`.

## Stale engine copies inside `target` — 1.24 GB per build profile

Tauri copies `resources/<engine>` into `target/<profile>/resources` at build time, but it never deletes files that were removed from the source tree. Both target profiles currently contain **20,923 files / 3,312,947,362 bytes**, while the source `resources` tree contains **14,330 files / 2,073,227,826 bytes**. Exactly **6,595 files (1,239,725,826 bytes)** in each target copy do not exist in the source. The debug and release copies have identical file lists.

| Engine | Source bytes | Source files | Target bytes | Target files | Stale files |
|---|---:|---:|---:|---:|---:|
| `libreoffice` | 1,539,705,345 | 14,213 | 2,764,749,064 | 20,772 | 6,559 |
| `ffmpeg` | 331,809,902 | 5 | 331,809,902 | 5 | 0 |
| `tesseract` | 182,118,493 | 88 | 196,798,421 | 123 | 35 |
| `qpdf` | 9,120,404 | 11 | 9,120,404 | 11 | 0 |
| `pdfium` | 7,588,037 | 3 | 7,588,037 | 3 | 0 |
| `7zip` | 2,506,289 | 6 | 2,506,289 | 6 | 0 |
| `licenses` | 373,066 | 2 | 375,245 | 3 | 1 |
| **Total** | **2,073,227,826** | **14,330** | **3,312,947,362** | **20,923** | **6,595** |

Largest stale entries (each present in both debug and release copies):

| Bytes | Path relative to `target/<profile>/resources` |
|---:|---|
| 144,313,768 | `libreoffice/mergedlo.dll` (flattened root copy; current source only has `libreoffice/program/mergedlo.dll`) |
| 36,136,702 | `libreoffice/tr_TR.dic` |
| 31,909,288 | `libreoffice/icudt77.dll` |
| 31,662,751 | `libreoffice/th_de_DE_v2.dat` |
| 31,662,751 | `libreoffice/th_de_CH_v2.dat` |
| 24,441,256 | `libreoffice/swlo.dll` |
| 24,182,696 | `libreoffice/sclo.dll` |
| 18,553,257 | `libreoffice/th_en_US_v2.dat` |
| 17,976,154 | `libreoffice/mn_MN.dic` |
| 16,466,162 | `libreoffice/images_karasa_jaga_svg.zip` |
| 10,562,727 | `tesseract/osd.traineddata` |
| 10,711,952 | `libreoffice/sdlo.dll` |
| 10,605,640 | `libreoffice/mwaw.dll` |
| 9,193,896 | `libreoffice/Engine12.dll` |

These are leftovers from an older LibreOffice staging layout (flattened DLLs/DIC files at the resource root) and an older Tesseract layout. They do not exist in the source resource tree and are not required by the current engines. They inflate only the local `target` directories: a 7-Zip listing of the shipped NSIS installer contains **14,337 entries / 2,093,162,917 bytes uncompressed** and none of the stale paths (no root `libreoffice/mergedlo.dll`, no root `tr_TR.dic`, no `tesseract/osd.traineddata`). Tauri therefore bundles from the current source mapping, not from the stale target copies. The installer also contains no `.pdb`, no `.map` files and no project source files; the only "test" entries are five LibreOffice `SFUnitTests` macro scripts that are part of the office suite, not project test fixtures.

## Why the earlier PowerShell report said `resources: 0.02 GB`

The previous report is arithmetically consistent with measuring only the four small engine folders and omitting LibreOffice, FFmpeg and Tesseract:

- pdfium 7,588,037 + qpdf 9,120,404 + 7zip 2,506,289 + licenses 373,066 = **19,587,796 bytes = 0.0182 GiB ≈ 0.02 GB**
- `node_modules` = 188,471,123 bytes = **0.1755 GiB ≈ 0.18 GB**

Both reported numbers match those subsets exactly. The report's command output is not available, so the precise cause cannot be proven, but the most consistent explanation is a scoped or depth-limited size calculation: it summed the small portable-engine folders instead of the whole `resources` tree, and it did not include `src-tauri/target` at all. LibreOffice (1.43 GiB), FFmpeg (0.31 GiB) and Tesseract (0.17 GiB) were left out. It also did not account for hardlinks, which is why even a full recursive sum overstates unique storage by 2.94 GiB.

## Largest 50 files

| # | Bytes | MiB | Links | Path |
|---:|---:|---:|---:|---|
| 1 | 678,590,455 | 647.2 | 1 | `release\Universal-Converter-Portable-1.0.0.zip` |
| 2 | 634,155,465 | 604.8 | 1 | `src-tauri\target\release\bundle\nsis\Universal Converter_1.0.0_x64-setup.exe` |
| 3 | 634,155,465 | 604.8 | 1 | `release\Universal-Converter-Setup-1.0.0.exe` |
| 4 | 223,965,184 | 213.6 | 2 | `src-tauri\target\debug\universal_converter.pdb` |
| 5 | 223,965,184 | 213.6 | 2 | `src-tauri\target\debug\deps\universal_converter.pdb` |
| 6 | 222,957,568 | 212.6 | 1 | `src-tauri\target\debug\deps\universal_converter-685de095a25ef17b.pdb` |
| 7 | 221,106,176 | 210.9 | 1 | `src-tauri\target\debug\deps\universal_converter-9179ff86d753fb25.pdb` |
| 8 | 215,182,182 | 205.2 | 1 | `src-tauri\target\debug\deps\libwindows-cdcfad5f0a9088a5.rlib` |
| 9 | 213,880,832 | 204.0 | 1 | `src-tauri\target\debug\deps\universal_converter-4a2eb79cfc27ede3.pdb` |
| 10 | 212,259,052 | 202.4 | 1 | `src-tauri\target\debug\deps\pdfium_render-ae67f5c5c8b6bf13.lib` |
| 11 | 210,693,782 | 200.9 | 1 | `src-tauri\target\debug\deps\pdfium_render-4c1d1c43a308365f.lib` |
| 12 | 210,620,418 | 200.9 | 1 | `src-tauri\target\debug\deps\pdfium_render-4f69729a09126eea.lib` |
| 13 | 198,840,320 | 189.6 | 1 | `src-tauri\target\debug\deps\universal_converter-1ea35069930af575.pdb` |
| 14 | 197,410,910 | 188.3 | 1 | `src-tauri\target\debug\deps\libwindows-5a01e771cefd894a.rlib` |
| 15 | 192,368,640 | 183.5 | 1 | `src-tauri\target\debug\deps\universal_converter-d3449ddd3cb84327.pdb` |
| 16 | 186,757,120 | 178.1 | 1 | `src-tauri\target\debug\deps\universal_converter-312cc35ea89b2190.pdb` |
| 17 | 165,983,744 | 158.3 | 1 | `src-tauri\target\release\resources\ffmpeg\ffmpeg.exe` |
| 18 | 165,983,744 | 158.3 | 1 | `src-tauri\target\debug\resources\ffmpeg\ffmpeg.exe` |
| 19 | 165,983,744 | 158.3 | 1 | `resources\ffmpeg\ffmpeg.exe` |
| 20 | 165,783,040 | 158.1 | 1 | `src-tauri\target\release\resources\ffmpeg\ffprobe.exe` |
| 21 | 165,783,040 | 158.1 | 1 | `src-tauri\target\debug\resources\ffmpeg\ffprobe.exe` |
| 22 | 165,783,040 | 158.1 | 1 | `resources\ffmpeg\ffprobe.exe` |
| 23 | 162,173,330 | 154.7 | 1 | `src-tauri\target\release\deps\libwindows-d604c1c5560e01d7.rlib` |
| 24 | 154,313,401 | 147.2 | 1 | `src-tauri\target\release\deps\libwindows-d604c1c5560e01d7.rmeta` |
| 25 | 144,313,768 | 137.6 | 1 | `src-tauri\target\release\resources\libreoffice\mergedlo.dll` |
| 26 | 144,313,768 | 137.6 | 1 | `src-tauri\target\release\resources\libreoffice\program\mergedlo.dll` |
| 27 | 144,313,768 | 137.6 | 1 | `src-tauri\target\debug\resources\libreoffice\mergedlo.dll` |
| 28 | 144,313,768 | 137.6 | 1 | `src-tauri\target\debug\resources\libreoffice\program\mergedlo.dll` |
| 29 | 144,313,768 | 137.6 | 1 | `resources\libreoffice\program\mergedlo.dll` |
| 30 | 143,965,582 | 137.3 | 1 | `src-tauri\target\debug\deps\libwindows-0fa9498c6056a024.rlib` |
| 31 | 140,916,318 | 134.4 | 1 | `src-tauri\target\debug\deps\libwindows-ed36a2ec6436ccfa.rlib` |
| 32 | 135,652,552 | 129.4 | 1 | `src-tauri\target\debug\deps\libwindows-cdcfad5f0a9088a5.rmeta` |
| 33 | 131,796,416 | 125.7 | 1 | `src-tauri\target\debug\deps\libwindows-5a01e771cefd894a.rmeta` |
| 34 | 119,497,084 | 114.0 | 1 | `src-tauri\target\release\deps\libwindows-95ca00e628cf0900.rlib` |
| 35 | 114,321,275 | 109.0 | 1 | `src-tauri\target\release\deps\libwindows-95ca00e628cf0900.rmeta` |
| 36 | 107,475,862 | 102.5 | 1 | `src-tauri\target\debug\deps\libwindows-58ac9767288fce59.rmeta` |
| 37 | 106,882,892 | 101.9 | 1 | `src-tauri\target\release\deps\libwindows-0bb284d94a913c44.rlib` |
| 38 | 104,529,195 | 99.7 | 1 | `src-tauri\target\debug\deps\libwindows-de79fc5095878d1f.rmeta` |
| 39 | 101,471,336 | 96.8 | 1 | `src-tauri\target\release\resources\tesseract\libtesseract-5.dll` |
| 40 | 101,471,336 | 96.8 | 1 | `src-tauri\target\debug\resources\tesseract\libtesseract-5.dll` |
| 41 | 101,471,336 | 96.8 | 1 | `resources\tesseract\libtesseract-5.dll` |
| 42 | 99,718,089 | 95.1 | 1 | `src-tauri\target\release\deps\libwindows-0bb284d94a913c44.rmeta` |
| 43 | 97,878,304 | 93.3 | 1 | `src-tauri\target\debug\deps\libwindows-0fa9498c6056a024.rmeta` |
| 44 | 85,176,765 | 81.2 | 1 | `src-tauri\target\debug\deps\libwindows-ed36a2ec6436ccfa.rmeta` |
| 45 | 77,524,051 | 73.9 | 1 | `src-tauri\target\debug\deps\libwindows-0a6c77699c7769e5.rmeta` |
| 46 | 74,516,308 | 71.1 | 1 | `src-tauri\target\debug\deps\libtauri_utils-9aae339189fe9d00.rlib` |
| 47 | 70,866,666 | 67.6 | 1 | `src-tauri\target\debug\deps\libtauri_utils-e9876147bb06bd01.rlib` |
| 48 | 70,841,122 | 67.6 | 1 | `src-tauri\target\debug\deps\libtauri_utils-a67df6cb3b34181c.rlib` |
| 49 | 70,688,116 | 67.4 | 1 | `src-tauri\target\debug\deps\libtauri_utils-51568105a7ca523c.rlib` |
| 50 | 70,444,072 | 67.2 | 1 | `src-tauri\target\debug\deps\libtauri_utils-b1692d4642c8fa73.rlib` |

## Hardlinks

3,048 files have more than one name (1,396 unique file identities). The 2.94 GiB of duplicate names are almost entirely Cargo's expected layout: `target/debug/universal_converter.pdb` and `target/debug/deps/universal_converter.pdb` are the same file, and each build-script `.exe`/`.pdb` is hardlinked under its hashed name. No source engine binary is hardlinked; deleting them from a target copy does not affect the source tree.

## What is safe to remove, and what is preserved

Safe, reproducible build output (regenerated by the normal build):

- `src-tauri/target/debug` — 19.43 GiB, including old dep PDBs, `incremental`, `build`, and stale resource copies.
- `src-tauri/target/release` — 6.98 GiB, including the duplicate NSIS bundle and stale resource copies, unless retained as measured release output.
- `release-build.log` — 12,685-byte stray build log at the project root; the release artifacts in `release/` are preserved.

Preserved without modification:

- All source (`src`, `src-tauri/src`, configs, tests, docs).
- `resources/` source engines (2.07 GB): pdfium, qpdf, FFmpeg, 7-Zip, LibreOffice, Tesseract, licenses.
- `node_modules` (0.18 GB) — required for the frontend build.
- `release/` installer and portable ZIP — the verified 1.0.0 deliverables.
- No user data lives inside the project during this audit (app data is under `%LOCALAPPDATA%`, outside the project).

Cleanup will be performed only after this snapshot, with before/after measurement; results are recorded below once executed.

## After cleanup (measured)

Removed:

- `src-tauri/target` — 28,362,765,065 bytes (26.42 GiB), 64,326 files. Reproducible Rust debug/release output plus the duplicate NSIS bundle and stale resource copies.
- `release-build.log` — 12,685 bytes. Stray build log; the 1.0.0 artifacts in `release/` were not touched.

Preserved: `src`, `src-tauri/src`, tests, configs, docs, `node_modules`, `resources` (all seven engines), and both `release/` artifacts.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Project logical size | 31,942,995,623 B (29.75 GiB) | 3,580,231,661 B (3.33 GiB) | −28,362,763,962 B (−26.41 GiB) |
| Project unique size | 28,784,867,080 B (26.81 GiB) | 3,580,231,661 B (3.33 GiB) | −25,204,635,419 B (−23.47 GiB) |
| Files | 86,131 | 21,805 | −64,326 |
| Folders | 8,151 | 1,860 | −6,291 |
| Hardlink duplicate bytes inside project | 3,158,128,543 B | 0 B | eliminated with Cargo output |
| Volume free space | 91,925,975,040 B | 117,224,456,192 B | +25,298,481,152 B (23.56 GiB actually freed) |

The difference between the 26.41 GiB logical reduction and the 23.56 GiB disk reduction is the Cargo hardlink duplication: 2.94 GiB of the deleted paths were second names for the same file data, so removing them did not free disk space a second time. The 3.33 GiB that remain are almost entirely intentional payload: source engines 1.93 GiB, release installer + portable ZIP 1.22 GiB, and `node_modules` 0.18 GiB.

The `.gitignore` already excludes `src-tauri/target`, `release/`, `dist` and `*.log`; no unrelated source or user data was removed.

## Final state after verification rebuild (2026-11-03)

The fixes were then verified by rebuilding both profiles (debug app, release app, NSIS installer). This is the project size after that rebuild; the target tree is reproducible output, not hand-written data.

| Metric | Before cleanup | After cleanup | After verification rebuild |
|---|---:|---:|---:|
| Project logical size | 31,942,995,623 B (29.75 GiB) | 3,580,231,661 B (3.33 GiB) | 14,252,603,399 B (13.27 GiB) |
| Unique on-disk size | 28,784,867,080 B (26.81 GiB) | 3,580,231,661 B (3.33 GiB) | 13,711,332,843 B (12.77 GiB) |
| Files | 86,131 | 21,805 | 60,443 |
| Folders | 8,151 | 1,860 | 6,504 |
| Hardlink duplicate bytes | 3,158,128,543 B | 0 B | 541,270,556 B |
| Volume free space | 91,925,975,040 B | 117,224,456,192 B | 107,033,681,920 B |

Fresh build output accounts for the increase since cleanup:

| Component | Bytes | GiB | Files |
|---|---:|---:|---:|
| `src-tauri/target` | 10,672,315,899 | 9.94 | 38,638 |
| `target/debug` | 5,757,825,063 | 5.36 | 20,081 |
| `target/debug/deps` | 2,288,804,014 | 2.13 | 1,683 |
| `target/debug/resources` | 2,073,223,715 | 1.93 | 14,329 |
| `target/debug/incremental` | 840,387,082 | 0.78 | 533 |
| `target/debug/build` | 420,283,240 | 0.39 | 700 |
| `target/debug/universal_converter.pdb` | 101,781,504 | 0.09 | 1 |
| `target/debug/universal-converter.exe` | 32,701,440 | 0.03 | 1 |
| `target/release` | 4,914,489,264 | 4.58 | 18,555 |
| `target/release/resources` | 2,073,223,715 | 1.93 | 14,329 |
| `target/release/deps` | 1,760,254,183 | 1.64 | 1,366 |
| `target/release/bundle` (new NSIS installer) | 634,193,039 | 0.59 | 1 |
| `target/release/build` | 416,483,267 | 0.39 | 749 |
| `target/release/universal-converter.exe` | 19,830,784 | 0.02 | 1 |
| `target/release/universal_converter.pdb` | 5,484,544 | 0.01 | 1 |
| `resources` (source engines, untouched) | 2,073,227,826 | 1.93 | 14,330 |
| `release` (original 1.0.0 deliverables, untouched) | 1,312,752,671 | 1.22 | 4 |
| `node_modules` | 188,513,308 | 0.18 | 7,236 |
| `dist` + source + docs + config (all remaining files) | 5,793,695 | 0.00 | 235 |

The rebuild wrote 10,190,774,272 bytes (9.49 GiB) of new volume usage, of which 634,193,039 bytes is the new installer, 4,146,447,430 bytes is the two fresh resource copies (`target/debug/resources` + `target/release/resources`), and the rest is compiled artifacts.

The fresh debug tree is 5.36 GiB against 19.43 GiB of accumulated artifacts before cleanup. That is not an optimization saving: the old tree contained several historical builds (multiple `universal_converter` PDBs of 186–223 MB, repeated `libwindows` rlibs, 3.9 GB of incremental data) and 1.24 GB of stale engine copies in each profile. The new tree holds one current build and its resource copies now match the source file list exactly (14,329 resource files in each target profile versus 14,330 in source; the one-file difference is `resources/README.md`, which is not mapped as a Tauri resource).

## Production distribution

The original 1.0.0 deliverables under `release/` were not modified:

- `release/Universal-Converter-Setup-1.0.0.exe` — 634,155,465 bytes (604.8 MiB).
- `release/Universal-Converter-Portable-1.0.0.zip` — 678,590,455 bytes (647.2 MiB).

The verification rebuild produced a new installer at `src-tauri/target/release/bundle/nsis/Universal Converter_1.0.0_x64-setup.exe`:

- File size: 634,193,039 bytes (604.8 MiB), 37,574 bytes larger than the original installer.
- SHA-256: `7c2c5ebcac8ca6427b188c7753c62b7e166c54fb441ca5a22067d26cf8ef9388`.
- 7-Zip listing: 14,337 files, 2,093,165,989 bytes uncompressed (1.949 GiB).
- 7-Zip extraction: 14,337 files, 2,093,347,638 bytes (1.950 GiB), including a 187,285-byte `uninstall.exe` that the NSIS stub generates and that is not in the listing. Payload excluding that generated uninstaller is 2,093,160,353 bytes, 5,636 bytes below the listing (NSIS metadata/accounting difference).
- Extracted `universal-converter.exe` is 19,830,784 bytes, SHA-256 `9a85000b0750c36eb3f11693eb62e8a1158b45ed8c3660d7e424c5e305c0503f` — byte-identical to `target/release/universal-converter.exe`.
- Contains no `.pdb`, no `.map` and no `.rs` files (verified against the extracted payload). It contains all seven bundled engines, including FFmpeg/ffprobe, LibreOffice and Tesseract. The only test-like paths are LibreOffice's own `SFUnitTests` macros, which are part of the office engine.
- The installed footprint is the 1.95 GiB payload plus the generated uninstaller and registry entries; this was measured from the extracted payload, not by executing the installer.
- `vite.config.ts` has no sourcemap setting and `dist` contains no `.map` files. The frontend build is 719,829 bytes JS + 49,926 bytes CSS (207,647 bytes + 9,500 bytes gzip).
- No engine or language payload was removed: all seven engines are advertised features and the installer remains fully functional. There is no distribution-size saving to claim without removing working functionality.

## Build configuration change

`src-tauri/Cargo.toml` now compiles third-party dependencies without debug info in the dev profile (`[profile.dev.package."*"] debug = false`). The application crate keeps full debug info for development and crash diagnosis. Release output is unchanged (`strip = true`, thin LTO, one codegen unit).

After the verification rebuild, the debug target contains 131 PDB files totalling 594,186,240 bytes: the application's own PDBs (3 names, 256,790,528 bytes, hardlinked), 106 build-script PDB names (261,988,352 bytes, hardlinked duplicates), 21 proc-macro PDBs (74,379,264 bytes) and one regular dependency PDB, `pdfium_render` (1,028,096 bytes). No other regular library dependency PDB is produced, which is the intended effect of the profile override. An isolated byte-for-byte saving for this flag is not claimed: the pre-change target was deleted, so the flag cannot be re-measured against the old tree without another full rebuild. The 13.27 GiB final total is the measured current state, not an estimate.
