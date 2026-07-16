import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  publicKeyFingerprint,
  sha256Hex,
  signRelease,
} from '../lib/release-signing.mjs'

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

function required(args, name) {
  const value = String(args[name] || '').trim()
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

async function sha256File(filePath) {
  return sha256Hex(await readFile(filePath))
}

function booleanArg(value) {
  return value === true || String(value || '').toLowerCase() === 'true'
}

const args = parseArgs(process.argv.slice(2))
const source = path.resolve(required(args, 'file'))
const version = required(args, 'version')
const buildNumber = Number(required(args, 'build'))
const modelKey = String(args.model || 'esp32_dht3').trim()
const channel = String(args.channel || 'stable').trim()
const mandatory = booleanArg(args.mandatory)
const autoInstall = booleanArg(args.auto)
const releaseNotes = String(args.notes || '').trim()
const maxFirmwareBytes = 0x180000
const privateKeyPath = path.resolve(
  String(args['private-key'] || process.env.OTA_SIGNING_PRIVATE_KEY_FILE || '').trim()
)
const keyId = String(args['key-id'] || process.env.OTA_RELEASE_KEY_ID || '').trim()

if (!Number.isInteger(buildNumber) || buildNumber <= 0) throw new Error('--build must be a positive integer')
if (!source.endsWith('.bin')) throw new Error('--file must point to firmware.bin')
if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(modelKey)) throw new Error('--model contains invalid characters')
if (!/^(stable|beta)$/.test(channel)) throw new Error('--channel must be stable or beta')
if (!privateKeyPath || privateKeyPath === path.parse(privateKeyPath).root) {
  throw new Error('Missing --private-key or OTA_SIGNING_PRIVATE_KEY_FILE')
}
if (privateKeyPath.startsWith(`${repoRoot}${path.sep}`)) {
  throw new Error('Private signing key must be stored outside the dotwatch repository')
}
if (!keyId) throw new Error('Missing --key-id or OTA_RELEASE_KEY_ID')

await mkdir(releasesDir, { recursive: true })
const filename = `${modelKey}-${channel}-build-${buildNumber}.bin`
const destination = path.join(releasesDir, filename)

let manifest = { schemaVersion: 2, releases: [] }
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
} catch {}
if (!Array.isArray(manifest.releases)) manifest.releases = []

const sameScope = manifest.releases.filter(
  (item) => item?.modelKey === modelKey && item?.channel === channel
)
const highestBuild = sameScope.reduce(
  (highest, item) => Math.max(highest, Number(item?.buildNumber) || 0),
  0
)
if (buildNumber <= highestBuild) {
  throw new Error(
    `Anti-rollback policy rejected build ${buildNumber}; latest ${modelKey}/${channel} build is ${highestBuild}`
  )
}

await copyFile(source, destination)
const info = await stat(destination)
if (info.size <= 0 || info.size > maxFirmwareBytes) {
  throw new Error(`Firmware size ${info.size} exceeds OTA slot limit ${maxFirmwareBytes}`)
}
const sha256 = await sha256File(destination)
const privateKeyPem = await readFile(privateKeyPath, 'utf8')
const publishedAt = new Date().toISOString()

const release = signRelease(
  {
    modelKey,
    channel,
    version,
    buildNumber,
    file: filename,
    size: info.size,
    sha256,
    mandatory,
    autoInstall,
    releaseNotes,
    publishedAt,
  },
  privateKeyPem,
  keyId
)

manifest.schemaVersion = 2
manifest.releases.push(release)
manifest.releases.sort((a, b) => Number(b.buildNumber) - Number(a.buildNumber))

const temporaryManifest = `${manifestPath}.tmp-${process.pid}`
await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
await rename(temporaryManifest, manifestPath)

console.log('Signed firmware release published locally')
console.log(`File        : ${destination}`)
console.log(`Version     : ${version}`)
console.log(`Build       : ${buildNumber}`)
console.log(`Size        : ${info.size}`)
console.log(`SHA-256     : ${sha256}`)
console.log(`Key ID      : ${keyId}`)
console.log(`Key SHA-256 : ${publicKeyFingerprint(privateKeyPem)}`)
console.log(`Mandatory   : ${mandatory}`)
console.log(`AutoInstall : ${autoInstall}`)
console.log('Commit the public key, manifest and generated .bin. Never commit the private key.')
