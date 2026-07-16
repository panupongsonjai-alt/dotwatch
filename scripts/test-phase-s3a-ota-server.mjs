import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

import {
  publicKeyFingerprint,
  sha256Hex,
  signRelease,
} from '../services/ota-server/lib/release-signing.mjs'

const root = path.resolve(import.meta.dirname, '..')
const otaDir = path.join(root, 'services', 'ota-server')
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'dotwatch-s3a-'))
const releasesDir = path.join(tempRoot, 'releases')
const manifestPath = path.join(releasesDir, 'manifest.json')
const publicKeyPath = path.join(tempRoot, 'release.public.pem')
const port = 45123
const baseUrl = `http://127.0.0.1:${port}`
const deviceCode = 'DW-S3A-TEST'
const deviceSecret = 'phase-s3a-device-secret-not-for-production'
const keyId = 'phase-s3a-test-key'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHealth(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`OTA server exited with code ${child.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return response.json()
    } catch {
      // Starting.
    }
    await wait(100)
  }
  throw new Error('OTA server did not become healthy')
}

function authHeaders() {
  return {
    'x-device-code': deviceCode,
    'x-device-secret': deviceSecret,
    'x-model-key': 'esp32_dht3',
  }
}

await mkdir(releasesDir, { recursive: true })
const firmware = randomBytes(8192)
const filename = 'esp32_dht3-stable-build-1300.bin'
await writeFile(path.join(releasesDir, filename), firmware)

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
await writeFile(publicKeyPath, publicKey, 'utf8')

const release = signRelease(
  {
    modelKey: 'esp32_dht3',
    channel: 'stable',
    version: 'esp32-product-1.3.0-signed-ota',
    buildNumber: 1300,
    file: filename,
    size: firmware.length,
    sha256: sha256Hex(firmware),
    mandatory: false,
    autoInstall: false,
    releaseNotes: 'Signed OTA server integration test',
    publishedAt: '2026-07-15T07:00:00.000Z',
  },
  privateKey,
  keyId
)
const manifest = { schemaVersion: 2, releases: [release] }
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const stdout = []
const stderr = []
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: otaDir,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    PUBLIC_BASE_URL: 'https://ota.example.test',
    OTA_RELEASES_DIR: releasesDir,
    OTA_MANIFEST_PATH: manifestPath,
    OTA_REQUIRE_SIGNED_RELEASES: 'true',
    OTA_RELEASE_KEY_ID: keyId,
    OTA_RELEASE_PUBLIC_KEY_FILE: publicKeyPath,
    OTA_RELEASE_PUBLIC_KEY_SHA256: publicKeyFingerprint(publicKey),
    OTA_ALLOW_UNREGISTERED_DEVICES: 'false',
    OTA_REQUIRE_DEVICE_SCOPE: 'true',
    OTA_DEVICE_REGISTRY_JSON: JSON.stringify({
      [deviceCode]: {
        secret: deviceSecret,
        modelKeys: ['esp32_dht3'],
        channels: ['stable'],
      },
    }),
    OTA_DEVICE_SECRETS_JSON: '{}',
    OTA_RATE_LIMIT_PER_IP: '1000',
    OTA_RATE_LIMIT_PER_DEVICE: '1000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', (chunk) => stdout.push(String(chunk)))
child.stderr.on('data', (chunk) => stderr.push(String(chunk)))

try {
  const health = await waitForHealth(child)
  assert.equal(health.requireSignedReleases, true)
  assert.equal(health.signedReleaseCount, 1)
  assert.equal(health.rejectedReleaseCount, 0)
  assert.equal(health.releaseKeyId, keyId)
  console.log('PASS: production OTA server starts only with a trusted signed manifest')

  const update = await fetch(
    `${baseUrl}/api/device-firmware/check?modelKey=esp32_dht3&channel=stable&currentBuild=1260`,
    { headers: authHeaders() }
  )
  assert.equal(update.status, 200)
  const body = await update.json()
  assert.equal(body.updateAvailable, true)
  assert.equal(body.release.signatureKeyId, keyId)
  assert.equal(body.release.signatureAlgorithm, 'ecdsa-p256-sha256')
  assert.equal(body.release.file, filename)
  assert.equal(body.release.signature, release.signature)
  console.log('PASS: signed release metadata is delivered to the device')

  const current = await fetch(
    `${baseUrl}/api/device-firmware/check?modelKey=esp32_dht3&channel=stable&currentBuild=1300`,
    { headers: authHeaders() }
  )
  assert.equal(current.status, 200)
  assert.equal((await current.json()).updateAvailable, false)
  console.log('PASS: server anti-rollback selection does not offer the current/older build')

  const tampered = JSON.parse(await readFile(manifestPath, 'utf8'))
  tampered.releases[0].buildNumber = 9999
  await writeFile(manifestPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8')
  const rejected = await fetch(
    `${baseUrl}/api/device-firmware/check?modelKey=esp32_dht3&channel=stable&currentBuild=1260`,
    { headers: authHeaders() }
  )
  assert.equal(rejected.status, 500)
  console.log('PASS: tampered manifest fails closed after startup')
} finally {
  child.kill('SIGTERM')
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), wait(2000)])
  await rm(tempRoot, { recursive: true, force: true })
}

const unexpected = stderr.join('').trim()
if (unexpected && !unexpected.includes('untrusted release')) console.error(unexpected)
console.log('Phase S3A OTA server integration tests passed.')
