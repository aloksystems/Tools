// Builds the release folder from artifacts that were really produced by
// `tauri build`. It never renames an unrelated executable into an installer.
//
//   npm run tauri build
//   node scripts/package-release.mjs
//
// Produces:
//   release/Universal-Converter-Setup-<version>.exe
//   release/Universal-Converter-Portable-<version>.zip
//   release/checksums.txt
//   release/RELEASE-NOTES.md

import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const releaseDir = path.join(root, 'release')
const targetDir = path.join(root, 'src-tauri', 'target', 'release')
const resourcesDir = path.join(root, 'resources')
const stagingParent = path.join(root, '.release-staging')
const portableName = 'Universal Converter'
const stagingDir = path.join(stagingParent, portableName)
const setupName = `Universal-Converter-Setup-${version}.exe`
const portableNameZip = `Universal-Converter-Portable-${version}.zip`

function fail(message) {
  console.error(`\n[package-release] ${message}`)
  process.exit(1)
}

function findBuiltExe() {
  const candidates = ['universal-converter.exe', 'Universal Converter.exe']
    .map((name) => path.join(targetDir, name))
    .filter((file) => fs.existsSync(file))
  if (candidates.length === 0) {
    fail(`release executable not found in ${targetDir}. Run "npm run tauri build" first.`)
  }
  return candidates[0]
}

function findInstaller() {
  const nsisDir = path.join(targetDir, 'bundle', 'nsis')
  if (!fs.existsSync(nsisDir)) {
    return null
  }
  const installers = fs
    .readdirSync(nsisDir)
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => path.join(nsisDir, name))
  if (installers.length === 0) {
    return null
  }
  return installers.find((file) => file.includes(version)) ?? installers[0]
}

function linkOrCopy(source, destination) {
  try {
    fs.linkSync(source, destination)
  } catch {
    fs.copyFileSync(source, destination)
  }
}

function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) {
      copyTree(from, to)
    } else if (entry.isFile()) {
      linkOrCopy(from, to)
    }
  }
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  const handle = fs.openSync(file, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let read
    while ((read = fs.readSync(handle, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, read))
    }
  } finally {
    fs.closeSync(handle)
  }
  return hash.digest('hex')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) {
    fail(`${path.basename(command)} exited with ${result.status ?? 'a signal'}`)
  }
}

function main() {
  const builtExe = findBuiltExe()
  const installer = findInstaller()
  fs.rmSync(releaseDir, { recursive: true, force: true })
  fs.mkdirSync(releaseDir, { recursive: true })

  if (installer) {
    const setupTarget = path.join(releaseDir, setupName)
    fs.copyFileSync(installer, setupTarget)
    console.log(`[package-release] installer copied from ${installer}`)
  } else {
    console.warn('[package-release] no NSIS installer found — skipping Setup.exe; producing portable zip only.')
  }

  fs.rmSync(stagingParent, { recursive: true, force: true })
  fs.mkdirSync(stagingDir, { recursive: true })
  fs.copyFileSync(builtExe, path.join(stagingDir, 'Universal Converter.exe'))
  copyTree(resourcesDir, path.join(stagingDir, 'resources'))

  const required = [
    'resources/ffmpeg/ffmpeg.exe',
    'resources/ffmpeg/ffprobe.exe',
    'resources/7zip/7z.exe',
    'resources/libreoffice/program/soffice.com',
    'resources/tesseract/tesseract.exe',
    'resources/tesseract/tessdata/eng.traineddata',
    'resources/pdfium/pdfium.dll',
    'resources/qpdf/qpdf.exe',
  ]
  for (const relative of required) {
    if (!fs.existsSync(path.join(stagingDir, relative))) {
      fail(`portable package is missing ${relative}`)
    }
  }

  fs.copyFileSync(
    path.join(root, 'THIRD-PARTY-NOTICES.md'),
    path.join(stagingDir, 'THIRD-PARTY-NOTICES.md'),
  )

  const sevenZip = path.join(resourcesDir, '7zip', '7z.exe')
  if (!fs.existsSync(sevenZip)) {
    fail('resources/7zip/7z.exe is required to create the portable zip')
  }
  const portableZip = path.join(releaseDir, portableNameZip)
  run(sevenZip, ['a', '-tzip', '-mx=5', '-bso0', '-bsp0', portableZip, portableName], {
    cwd: stagingParent,
  })

  const notesSource = path.join(root, 'docs', 'RELEASE-NOTES.md')
  if (fs.existsSync(notesSource)) {
    fs.copyFileSync(notesSource, path.join(releaseDir, 'RELEASE-NOTES.md'))
  }

  const checksumed = [portableNameZip]
  if (installer) {
    checksumed.unshift(setupName)
  }
  const lines = checksumed.map((name) => `${sha256(path.join(releaseDir, name))}  ${name}`)
  fs.writeFileSync(path.join(releaseDir, 'checksums.txt'), `${lines.join('\n')}\n`)

  fs.rmSync(stagingParent, { recursive: true, force: true })

  console.log('[package-release] artifacts:')
  for (const name of checksumed) {
    const bytes = fs.statSync(path.join(releaseDir, name)).size
    console.log(`  ${name} — ${(bytes / (1024 * 1024)).toFixed(1)} MB`)
  }
  console.log(`  checksums.txt\n[package-release] release folder: ${releaseDir}`)
}

main()
