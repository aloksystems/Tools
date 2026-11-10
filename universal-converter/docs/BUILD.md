# Build, release and signing

## Requirements

- Windows 10/11 64-bit with WebView2.
- Node.js 20+ and npm.
- Rust (stable) with the `x86_64-pc-windows-msvc` toolchain and Visual Studio
  Build Tools (C++ workload, Windows SDK).
- The engine payloads already in `resources/`: PDFium, qpdf, FFmpeg/ffprobe,
  LibreOffice, 7-Zip and Tesseract.

## Development

```bash
npm install
npm run tauri dev
```

`npm run dev` alone runs the React UI without the Rust core; conversions are
disabled and the app says so.

## Checks

```bash
npm run build        # tsc -b && vite build
npm run lint         # oxlint
cd src-tauri && cargo check --all-targets
cd src-tauri && cargo test
```

The test suite includes real engine work; it needs the bundled resources and can
take several minutes.

CI runs the same checks in `.github/workflows/ci.yml`. Hosted runners perform the
frontend build, formatting, clippy and test compilation; the full engine suite
needs a self-hosted Windows runner with `resources/` populated (labels
`self-hosted`, `windows`, `x64`, `engine-payload`). Setup details are in
[DEVELOPMENT.md](DEVELOPMENT.md#continuous-integration). The release procedure is
in [RELEASE-PROCESS.md](RELEASE-PROCESS.md).

## Versioning

Semantic versioning: MAJOR for breaking changes, MINOR for features, PATCH for
fixes. A release version must match in all three places:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

`Cargo.lock` updates automatically during the build. The release script uses the
`package.json` version for artifact names.

## Packaging

```bash
npm run release:build
```

This runs `npm run build` (via Tauri's `beforeBuildCommand`), compiles a release
binary, creates the NSIS installer, then runs
[`scripts/package-release.mjs`](../scripts/package-release.mjs), which:

1. Copies the real NSIS installer to `release/Universal-Converter-Setup-<version>.exe`.
2. Creates a portable staging folder from the real release executable plus the
   `resources` tree, verifies required engine files, and zips it with the bundled
   7-Zip to `release/Universal-Converter-Portable-<version>.zip`.
3. Writes SHA-256 hashes to `release/checksums.txt`.
4. Copies `docs/RELEASE-NOTES.md` to the release folder.

It never renames an unrelated executable into an installer. The NSIS package is
per-user (`currentUser` install mode) and does not require administrator rights.
The installer is large because LibreOffice is bundled; allow enough disk space
for `src-tauri/target` during the build.

### Portable notes

Portable users must keep `resources/` beside the executable. Data (settings,
history, presets) still lives in `%APPDATA%\UniversalConverter`; the portable
build is about installation, not data isolation.

## Licence notices

```bash
npm run notices
```

Regenerates `resources/licenses/RUST-CRATES.md` from Cargo metadata for the
Windows x64 target. The curated engine summary is
[`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md). Re-run this after any
dependency change and before a release.

## Code signing

The current 1.0.1 build is **unsigned**. Windows SmartScreen may warn; users can
verify SHA-256 checksums. Unsigned builds cannot establish publisher identity.

To sign, you need a Windows code-signing certificate (OV or EV; EV is needed for
immediate SmartScreen reputation in many cases). Options supported by Tauri 2:

1. **Certificate in the Windows certificate store** — set `thumbprint`,
   `digestAlgorithm` and `timestampUrl` under `bundle.windows` in
   `src-tauri/tauri.conf.json`. The build user must have the private key.
2. **Custom sign command** — set `bundle.windows.signCommand` to your signing
   tool (for example Azure Trusted Signing or a hardware-token wrapper) and
   provide credentials through environment variables or the tool's own store.
   Never commit a certificate, password or PFX to the repository.
3. **PFX file** — import it into the current user's certificate store before the
   build; do not pass the password on the command line where it lands in shell
   history.

After signing, verify the installer and application executable:

```powershell
Get-AuthenticodeSignature .\Universal-Converter-Setup-1.0.1.exe
Get-AuthenticodeSignature ".\Universal Converter.exe"
```

Both should report `Valid`. Also confirm the file metadata (product name,
version, publisher) on the `.exe` properties page. The build does not fabricate
publisher information.

If no certificate is available, document the unsigned limitation in the release
notes and publish checksums.

## Auto-update preparation (not enabled)

Universal Converter 1.0.1 has **no update endpoint and no updater plugin**. The
Settings screen states this explicitly. To enable secure updates:

1. Add `tauri-plugin-updater` to Cargo and npm, initialize it in `main.rs`, and
   grant `updater:default` to the main window capability.
2. Generate a signing key pair with
   `npm run tauri signer generate -w <path-to-key>` and keep the private key out
   of the repository. Store the public key in `plugins.updater.pubkey`.
3. Set `bundle.createUpdaterArtifacts` to `true`.
4. Host a Tauri `latest.json` manifest and the signed artifacts at a real HTTPS
   endpoint, and put that endpoint in `plugins.updater.endpoints`. Do not invent
   an endpoint.
5. Add a UI flow that calls `check()`, shows current/available versions and
   release notes, asks for confirmation, then calls `downloadAndInstall()`.
6. Test an interrupted download, a failed signature and a restart after install.
   Settings and history must survive.

Until those steps are done and tested, the update system is not implemented. No
`TAURI_SIGNING_PRIVATE_KEY` or endpoint is configured here.

## Optional support page

Settings → Diagnostics & support can link to an official support or issue page.
No support URL is committed to this repository; each build supplies one at
compile time:

```powershell
$env:VITE_SUPPORT_URL = "https://support.your-domain.example/universal-converter"
npm run tauri build
```

- Only `https://` URLs are accepted. An empty, malformed or non-HTTPS value is
  ignored, and Settings shows “No support page is configured in this build.”
- The value is compiled into the frontend bundle, so changing it requires a
  rebuild.
- **Copy summary** works regardless of this setting and copies only the app
  version, OS, architecture and engine versions — no paths or file contents.
  The diagnostic report export is separate and is never uploaded automatically.
- Opening the page uses the `opener:allow-open-url` permission with the plugin's
  default URL scope; the frontend only passes an HTTPS URL.
