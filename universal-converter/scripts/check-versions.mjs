// Fails when the three version fields disagree, or when a version supplied on
// the command line (for example from a release workflow) does not match them.
//
//   node scripts/check-versions.mjs
//   node scripts/check-versions.mjs 1.0.1

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const cargoToml = fs.readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8')
const cargoMatch = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)
if (!cargoMatch) {
  console.error('[check-versions] could not find [package] version in src-tauri/Cargo.toml')
  process.exit(1)
}

const tauri = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))

const versions = {
  'package.json': pkg.version,
  'src-tauri/Cargo.toml': cargoMatch[1],
  'src-tauri/tauri.conf.json': tauri.version,
}

const expected = process.argv[2]
const unique = new Set(Object.values(versions))
let failed = unique.size !== 1

for (const [file, version] of Object.entries(versions)) {
  const suffix = version === pkg.version ? '' : '  <-- mismatch'
  console.log(`${file.padEnd(28)} ${version}${suffix}`)
}

if (expected && pkg.version !== expected) {
  console.error(`\n[check-versions] expected ${expected}, found ${pkg.version}`)
  failed = true
}

if (failed) {
  console.error('\n[check-versions] version fields must match before building a release')
  process.exit(1)
}

console.log(`\n[check-versions] all three files report ${pkg.version}`)
