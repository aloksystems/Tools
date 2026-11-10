# Archives — engine reference

Archive work is done by a bundled 7-Zip 26.05 (`7z.exe`). The engine never opens
a command shell and never uses 7-Zip's GUI or its file manager.

## Supported formats

| Operation | Formats |
| --- | --- |
| **Create** | ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ |
| **Extract / inspect** | ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, GZ, BZ2, XZ, WIM, CAB |
| **Repack** | Any readable input → any creatable output |

CAB and WIM are extraction-only inputs; there is no CAB/WIM writer in 7-Zip.
Standalone GZ/BZ2/XZ are offered for extraction only — creation compresses a TAR
so a user gets a real archive, not a compressed single file with an archive
extension. RAR, ISO, DMG and multi-volume sets are not advertised.

## Archive Studio

The page has three workspaces. Each keeps its own staged files and settings, so
switching modes does not discard a half-built job.

### Create

- Drop **files and/or folders**; folders are scanned recursively, with links and
  junctions refused so a folder cannot pull in content from outside itself.
- Container select (ZIP/7Z/TAR/TAR.GZ/TAR.BZ2/TAR.XZ), archive name and suffix,
  output folder, compression level.
- Any number of sources can go into one archive. With several sources the
  default name is `archive`; a typed name wins. A single source defaults to its
  own name.
- Folder structure is preserved by default (`-spf`-style relative paths from the
  common parent). Sources must share a drive for that to be meaningful; the
  engine reports a clear error otherwise.
- Presets save the container-bound settings, never the password.
- The new archive is test-read (`7z t`) and signature-checked before it is
  published.

| Compression | 7-Zip switch |
| --- | --- |
| Store | `-mx=0` |
| Fast | `-mx=1` |
| Normal | `-mx=5` |
| Maximum | `-mx=9` |

| Container | Methods offered |
| --- | --- |
| ZIP | Auto, Deflate, Deflate64, BZip2, LZMA, PPMd, Copy |
| 7Z | Auto, LZMA2, LZMA, PPMd, BZip2, Copy |
| TAR family | No method choice; pick TAR.GZ/BZ2/XZ for compression |

A method that cannot exist in the chosen container is refused, not silently
dropped. Solid mode is a 7Z-only switch.

### Extract

- Drop one or more archives. A single archive is inspected automatically: the
  page lists entries, file/folder counts, packed and declared uncompressed
  sizes, and flags encryption.
- The content browser builds a folder tree with tri-state checkboxes. Checking
  nothing extracts the whole archive; checking entries extracts exactly those.
  Links are shown but cannot be selected. A selection naming an entry that is
  not in the archive is refused.
- Destination folder and optional folder name. If the destination exists, the
  collision policy applies: skip, or choose `name (1)`, `name (2)`… **An
  existing folder is never merged into or overwritten.**
- Multiple archives each become their own full-extraction job; selected-entry
  extraction is a single-archive operation.
- Encrypted archives ask for a password. A wrong password is reported as
  `wrongPassword`; a missing one as `needsPassword`; encrypted 7z headers make
  the listing itself need the password. Passwords are never bypassed.

### Repack

An archive can be repacked into another container. This is one job per archive,
implemented as a staged extraction followed by a fresh creation. If the input
and output containers are the same, a new name is required so the source cannot
be replaced. A password on this form only unlocks the **input**; the output is
not silently re-encrypted — use Create for an encrypted destination.

## Extraction security

The declared 7-Zip listing is the security boundary. It is validated **before a
destination exists**, then extraction happens in a scratch folder and the
produced tree is validated again before it is moved into place.

Rejected at listing time:

- absolute paths (`/…`, `\…`) and drive-qualified paths (`C:…`);
- `.`/`..` segments, empty segments, trailing dots/spaces that Windows would
  rewrite, control characters, and `:` alternate-data-stream syntax;
- reserved Windows device names (`CON`, `NUL`, `COM1`, `LPT9`, …);
- symbolic links and hard links;
- case-insensitive duplicate entries and file/folder path conflicts;
- archives whose declared file count exceeds `maxExtractionFiles` (default
  100,000) or whose declared uncompressed size exceeds `maxExtractionMb`
  (default 20 GiB).

Rejected after extraction:

- a link that appeared during decompression;
- an extracted total larger than the declared listing budget;
- any path that no longer matches the listing.

Other properties:

- extraction is staged under the app temp root; cancel or failure deletes the
  staging folder and leaves no destination behind;
- free disk space is checked against the declared size before the job starts;
- no extracted file is executed, opened by association, or added to the
  `recent files` list;
- archive entries are read as UTF-8 (`-sccUTF-8`) so names are not mangled by
  the console code page;
- output files are committed from staging and never written directly next to
  the source.

## Password and encryption support

| Container | Password creation | Details |
| --- | --- | --- |
| ZIP | Yes | AES-256 (`-mem=AES256`) |
| 7Z | Yes | AES-256; header encryption on/off (`-mhe=on/off`) |
| TAR / TAR.GZ / TAR.BZ2 / TAR.XZ | No | The engine refuses a password with an explicit message |

`7z.exe` has no stdin password path, so the password is passed as `-p<secret>`
in argv. It is never written to settings, presets, history, event payloads or
logs; only the command line of that short-lived child process contains it. Wrong
passwords are distinguished from missing ones and from corrupt archives.

## 7-Zip integration

Lookup order (`ArchiveEngine::probe`):

1. `UC_7ZIP_PATH` (must point at `7z.exe`);
2. `resources/7zip/7z.exe` next to the executable or in the repository;
3. `Program Files\7-Zip\7z.exe`;
4. `PATH`, split by the OS, never through a shell.

The probe runs `7z i`, records the version, and the engine stays unavailable
with that reason when the binary is missing.

Commands used: `l -slt` (listing), `a` (create), `x` (extract), `t` (test).
Progress comes from `-bsp1` on stdout; `-bso0` keeps normal output quiet.
`archiveTimeoutSeconds` (default 600 s) bounds each process; cancel kills and
reaps the child.

TAR.GZ/BZ2/XZ creation is two-stage: a TAR is built, then compressed with
`-tgzip`/`-tbzip2`/`-txz`. Extraction of the same formats is also two-stage and
keeps the inner TAR out of the delivered folder. A plain single-file GZ/BZ2/XZ
yields exactly that one file.

## Setup and packaging

The bundled folder is `resources/7zip/` (7z.exe, 7z.dll, license and history).
`src-tauri/tauri.conf.json` maps `resources/7zip/*` into the packaged app.
`UC_7ZIP_PATH` overrides the bundle. No installer, registry entry or network
access is required.

## Known limitations

- RAR decompression is not exposed even though 7-Zip's unRAR code is present;
  the app only advertises formats it both lists and extracts in tests.
- No split/multi-volume archive creation or extraction UI.
- Symlinks and hardlinks are deliberately never extracted.
- Unix permissions and ownership are not restored; Windows ACLs are inherited
  from the destination.
- Archive passwords necessarily appear in the 7-Zip child's argv; the app keeps
  them out of every persisted surface, but a local process inspector could read
  the command line while the job runs.
- Repack does not preserve encryption, comments or extra metadata; it extracts
  and rebuilds the file tree.
