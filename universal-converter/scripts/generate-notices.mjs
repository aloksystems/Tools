// Collects the licence text of every Rust crate statically linked into the
// release binary. Run after changing Cargo.toml:
//
//   npm run notices
//
// Output: resources/licenses/RUST-CRATES.md (shipped with the installed app).

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'resources', 'licenses', 'RUST-CRATES.md')

const metadata = JSON.parse(
  execFileSync(
    'cargo',
    [
      'metadata',
      '--manifest-path',
      path.join(root, 'src-tauri', 'Cargo.toml'),
      '--format-version',
      '1',
      '--filter-platform',
      'x86_64-pc-windows-msvc',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ),
)

const used = new Set(metadata.resolve.nodes.map((node) => node.id))
const packages = metadata.packages
  .filter((pkg) => used.has(pkg.id) && pkg.name !== 'universal-converter')
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version))

function licenseFiles(pkg) {
  const directory = path.dirname(pkg.manifest_path)
  const candidates = []
  if (pkg.license_file) {
    candidates.push(path.resolve(directory, pkg.license_file))
  }
  try {
    for (const entry of fs.readdirSync(directory)) {
      if (/^(licen[cs]e|copying|notice)(\..*)?$/i.test(entry)) {
        candidates.push(path.join(directory, entry))
      }
    }
  } catch {
    // The crate source may have been cleaned from the local registry cache.
  }
  return [...new Set(candidates)].filter((file) => {
    try {
      const stat = fs.statSync(file)
      return stat.isFile() && stat.size > 0 && stat.size < 512 * 1024
    } catch {
      return false
    }
  })
}

let text = `# Rust dependency licences\n\n`
text += `Generated from Cargo metadata for the Windows x64 release build. Each section\n`
text += `reproduces the licence file shipped with the crate. Packages without a licence\n`
text += `file list the SPDX expression declared in their manifest.\n\n`
text += `Total packages: ${packages.length}\n\n---\n\n`

for (const pkg of packages) {
  text += `## ${pkg.name} ${pkg.version}\n\n`
  text += `- Licence: ${pkg.license ?? 'not declared in Cargo.toml'}\n`
  if (pkg.repository) text += `- Repository: ${pkg.repository}\n`
  if (pkg.authors?.length) text += `- Authors: ${pkg.authors.join(', ')}\n`
  text += '\n'
  const files = licenseFiles(pkg)
  if (files.length === 0) {
    text += `_No licence file was found in the local crate source. The SPDX expression above is\n`
    text += `the authoritative declaration; consult the crate on crates.io for the full text._\n\n`
    continue
  }
  for (const file of files) {
    text += `### ${path.basename(file)}\n\n\`\`\`\n`
    text += fs.readFileSync(file, 'utf8').trim()
    text += `\n\`\`\`\n\n`
  }
}

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, text)
const bytes = fs.statSync(output).size
console.log(`[notices] ${packages.length} packages -> ${output} (${(bytes / 1024).toFixed(1)} kB)`)
