# Release process

A release is a tested build with consistent metadata, checksums and honest notes.
Nothing here publishes automatically, and no step may be skipped because a
previous build "looked fine".

## Versioning

Semantic versioning:

- **MAJOR** — breaking changes to data format, IPC or behaviour users depend on.
- **MINOR** — new features, formats or tools.
- **PATCH** — bug fixes and security fixes.

The version must be identical in exactly three files:

- `package.json`
- `src-tauri/Cargo.toml` (`[package] version`)
- `src-tauri/tauri.conf.json`

Check before tagging:

```bash
npm run check:versions
npm run check:versions -- 1.0.1   # when releasing 1.0.1
```

The release workflow also enforces this and refuses a mismatched input.

## Pre-release checklist

1. `git status` is clean except intended changes; no secrets, logs, installers or
   `resources/` payloads are staged.
2. `npm ci` from the lockfile (not `npm install`) succeeds.
3. `npm run lint` passes.
4. `npm run build` passes.
5. `cd src-tauri && cargo fmt --check` passes.
6. `cd src-tauri && cargo clippy --all-targets -- -D warnings` passes.
7. `cd src-tauri && cargo test` passes in full, with the engine payload present.
8. Manual smoke test of the changed area in `npm run tauri dev`, or an explicit
   note that it was not tested.
9. `docs/RELEASE-NOTES.md` describes this version accurately, including known
   limitations and anything not verified.
10. `THIRD-PARTY-NOTICES.md` and `resources/licenses/RUST-CRATES.md` are current
    (`npm run notices` after dependency changes).
11. `npm run check:versions` passes.

## Build

On a Windows machine or self-hosted runner with `resources/` populated:

```bash
npm ci
npm run check:versions
cd src-tauri && cargo test && cd ..
npm run tauri build
npm run package:release
```

`npm run tauri build` produces the per-user NSIS installer under
`src-tauri/target/release/bundle/nsis/`. `package:release` never invents an
installer: it fails if the build output is missing, copies the real installer,
stages the executable with the complete engine payload, creates the portable ZIP
with the bundled 7-Zip, copies the release notes and writes SHA-256 checksums.

## Expected artifacts

```
release/
  Universal-Converter-Setup-1.0.1.exe
  Universal-Converter-Portable-1.0.1.zip
  checksums.txt
  RELEASE-NOTES.md
```

Verify before publishing:

- The installer filename version matches the metadata.
- The portable ZIP opens and contains `Universal Converter.exe`, `resources/`
  with every engine, and `THIRD-PARTY-NOTICES.md`.
- `checksums.txt` lists both artifacts and their hashes match
  `Get-FileHash <file> -Algorithm SHA256`.
- The installed app launches, shows engine status, converts one image and opens
  Settings.
- The portable app launches from a folder whose path contains a space.
- The uninstaller removes the app without deleting `%APPDATA%\UniversalConverter`
  (user data survives by design; the user can remove it from Settings).

## Manual workflow

`.github/workflows/release-build.yml` is `workflow_dispatch` only. It takes the
exact version, verifies the payload and metadata, runs the full test suite,
builds and uploads `release/` as a workflow artifact. It does **not** create a
GitHub release, tag, signature or update manifest.

## Signing

The 1.0.1 build is unsigned. SmartScreen may warn and publisher identity is not
established. Signing requires a real Windows code-signing certificate; the
options and verification commands are documented in [BUILD.md](BUILD.md#code-signing).
Never commit a certificate, PFX, password or signing key. After signing, verify
the installer and executable with `Get-AuthenticodeSignature`; both must report
`Valid` before publishing.

## Update metadata

There is no live update service and no Tauri updater plugin. Do not publish a
`latest.json`, invent an endpoint or claim automatic updates. The steps required
to add signed updates are listed in [BUILD.md](BUILD.md#auto-update-preparation-not-enabled)
and remain unimplemented until hosting and signing keys exist and an interrupted,
failed and successful update have all been tested.

## Tagging and publishing

1. Verify the artifacts as described above.
2. Create the tag and release from the same commit that produced the binaries:

   ```bash
   git tag -a v1.0.1 -m "Universal Converter 1.0.1"
   git push origin v1.0.1
   ```

3. Attach `Universal-Converter-Setup-1.0.1.exe`,
   `Universal-Converter-Portable-1.0.1.zip`, `checksums.txt` and
   `RELEASE-NOTES.md`, and repeat the unsigned-build warning in the notes.
4. Confirm every asset reports `state: uploaded`, the byte size matches the
   local file, and GitHub's computed `digest` matches `checksums.txt`.

Fixes were published this way for 1.0.1 on 2026-11-03:
<https://github.com/aloksystems/universal-converter/releases/tag/v1.0.1>.
The API upload used `POST /repos/:owner/:repo/releases` and then
`POST https://uploads.github.com/repos/:owner/:repo/releases/:id/assets?name=…`
with `Content-Type: application/octet-stream`, streaming each file rather than
buffering it. Ordinary commits and pull requests never publish a release.

## Rollback

If a release is faulty:

1. Remove the affected artifacts from the release page and mark the release as
   withdrawn; do not silently replace binaries under the same version.
2. Publish a PATCH release with the fix and a note describing the problem.
3. Users update manually (no updater). Their settings, history, presets, workflows
   and favorites remain in `%APPDATA%\UniversalConverter` unless the uninstaller
   or the user removes them.
4. If the database schema changed, restore compatibility in the next build rather
   than asking users to delete data. Backups use a versioned format and are
   validated before restore.

## Release notes

`docs/RELEASE-NOTES.md` is the source copied into `release/`. Keep it factual:
features that work, known limitations, security posture (unsigned, no updater),
and anything that was not tested. A changelog entry belongs here; the project
does not generate a changelog automatically from commits.
