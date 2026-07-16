import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sha256Hex, signRelease } from '../lib/release-signing.mjs'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = path.resolve(scriptsDir, '..')
const repoRoot = path.resolve(serviceDir, '..', '..')
const releasesDir = path.join(serviceDir, 'releases')
const manifestPath = path.join(releasesDir, 'manifest.json')

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) values[key] = true
    else {
      values[key] = next
      index += 1
    }
  }
  return values
}

const args = parseArgs(process.argv.slice(2))
const privateKeyPath = path.resolve(
  String(args['private-key'] || process.env.OTA_SIGNING_PRIVATE_KEY_FILE || '').trim()
)
const keyId = String(args['key-id'] || process.env.OTA_RELEASE_KEY_ID || '').trim()
if (!privateKeyPath || privateKeyPath === path.parse(privateKeyPath).root) {
  throw new Error('Missing --private-key or OTA_SIGNING_PRIVATE_KEY_FILE')
}
if (privateKeyPath.startsWith(`${repoRoot}${path.sep}`)) {
  throw new Error('Private signing key must be stored outside the dotwatch repository')
}
if (!keyId) throw new Error('Missing --key-id or OTA_RELEASE_KEY_ID')

const privateKeyPem = await readFile(privateKeyPath, 'utf8')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (!manifest || !Array.isArray(manifest.releases)) throw new Error('manifest.json is invalid')

const signedReleases = []
for (const release of manifest.releases) {
  const firmwarePath = path.join(releasesDir, path.basename(String(release.file || '')))
  const body = await readFile(firmwarePath)
  const info = await stat(firmwarePath)
  const actualSha256 = sha256Hex(body)
  if (Number(release.size) !== info.size) {
    throw new Error(`${release.file}: size mismatch (${release.size} != ${info.size})`)
  }
  if (String(release.sha256 || '').toLowerCase() !== actualSha256) {
    throw new Error(`${release.file}: SHA-256 mismatch`)
  }
  signedReleases.push(signRelease(release, privateKeyPem, keyId))
}

manifest.schemaVersion = 2
manifest.releases = signedReleases.sort((a, b) => Number(b.buildNumber) - Number(a.buildNumber))
const temporaryManifest = `${manifestPath}.tmp-${process.pid}`
await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
await rename(temporaryManifest, manifestPath)
console.log(`Signed ${signedReleases.length} existing OTA release(s) with key ${keyId}.`)
