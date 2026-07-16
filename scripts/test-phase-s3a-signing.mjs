import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'

import {
  canonicalReleasePayload,
  publicKeyFingerprint,
  signRelease,
  verifyReleaseSignature,
} from '../services/ota-server/lib/release-signing.mjs'

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const release = signRelease(
  {
    modelKey: 'esp32_dht3',
    channel: 'stable',
    version: 'esp32-product-1.3.0-signed-ota',
    buildNumber: 1300,
    file: 'esp32_dht3-stable-build-1300.bin',
    size: 4096,
    sha256: 'a'.repeat(64),
    mandatory: false,
    autoInstall: false,
    releaseNotes: 'Phase S3A test release',
    publishedAt: '2026-07-15T07:00:00.000Z',
  },
  privateKey,
  'phase-s3a-test-key'
)

const verified = verifyReleaseSignature(release, publicKey, {
  expectedKeyId: 'phase-s3a-test-key',
})
assert.equal(verified.ok, true)
assert.match(release.signature, /^[A-Za-z0-9+/]+={0,2}$/)
assert.equal(release.releaseNotesSha256.length, 64)
assert.match(canonicalReleasePayload(release), /buildNumber=1300\n/)
console.log('PASS: signed release verifies with the matching P-256 public key')

for (const [name, tampered] of [
  ['build number', { ...release, buildNumber: 1301 }],
  ['firmware hash', { ...release, sha256: 'b'.repeat(64) }],
  ['release notes', { ...release, releaseNotes: 'tampered notes' }],
  ['channel', { ...release, channel: 'beta' }],
]) {
  assert.equal(
    verifyReleaseSignature(tampered, publicKey, { expectedKeyId: 'phase-s3a-test-key' }).ok,
    false,
    `${name} tampering should fail`
  )
}
console.log('PASS: signed metadata tampering is rejected')

assert.equal(
  verifyReleaseSignature(release, publicKey, { expectedKeyId: 'another-key' }).ok,
  false
)
console.log('PASS: signing key ID mismatch is rejected')

const other = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
assert.equal(verifyReleaseSignature(release, other.publicKey).ok, false)
console.log('PASS: signature from an untrusted key is rejected')

assert.equal(publicKeyFingerprint(publicKey).length, 64)
console.log('PASS: public-key fingerprint is stable SHA-256 metadata')
console.log('Phase S3A release signing tests passed.')
