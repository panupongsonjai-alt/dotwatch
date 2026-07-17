import { createHash, createPublicKey } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const failures = []
const passes = []

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}
function expect(condition, passMessage, failMessage) {
  if (condition) passes.push(passMessage)
  else failures.push(failMessage)
}

const server = read('services/ota-server/server.mjs')
const signing = read('services/ota-server/lib/release-signing.mjs')
const publisher = read('services/ota-server/scripts/publish-release.mjs')
const keyGenerator = read('services/ota-server/scripts/generate-signing-key.mjs')
const otaManager = read('esp32/dotwatch_esp32_product/src/ota/OtaManager.cpp')
const otaHeader = read('esp32/dotwatch_esp32_product/src/ota/OtaManager.h')
const signingHeader = read('esp32/dotwatch_esp32_product/include/OtaSigningKey.h')
const signingMetadata = JSON.parse(
  read('services/ota-server/keys/release-signing-key.json')
)
const firmwareVersion = read('esp32/dotwatch_esp32_product/include/FirmwareVersion.h')
const envExample = read('services/ota-server/.env.example')
const render = read('services/ota-server/render.yaml')
const gitignore = read('.gitignore')

expect(
  signing.includes('ecdsa-p256-sha256') &&
    signing.includes("cryptoSign('sha256'") &&
    signing.includes("cryptoVerify('sha256'") &&
    signing.includes('canonicalReleasePayload'),
  'Release tooling signs a canonical payload with ECDSA P-256/SHA-256',
  'Canonical P-256 release signing is incomplete'
)

expect(
  publisher.includes('OTA_SIGNING_PRIVATE_KEY_FILE') &&
    publisher.includes('Private signing key must be stored outside the dotwatch repository') &&
    publisher.includes('Anti-rollback policy rejected build'),
  'Publisher keeps the private key outside the repository and enforces monotonic builds',
  'Publisher private-key or monotonic-build protections are incomplete'
)

expect(
  keyGenerator.includes("namedCurve: 'prime256v1'") &&
    keyGenerator.includes('OtaSigningKey.h') &&
    keyGenerator.includes("mode: 0o600"),
  'Key generator creates a unique P-256 key and embeds only the public key',
  'OTA key generation or public-key embedding is incomplete'
)

expect(
  server.includes('OTA_REQUIRE_SIGNED_RELEASES') &&
    server.includes('verifyReleaseSignature') &&
    server.includes('OTA manifest contains untrusted release') &&
    server.includes('await loadManifest();'),
  'OTA server validates the signed manifest and fails closed before listening',
  'OTA server signed-manifest fail-closed behavior is incomplete'
)

expect(
  otaManager.includes('mbedtls_pk_verify') &&
    otaManager.includes('verifyReleaseSignature(next, signatureReason)') &&
    otaManager.includes('signature_rejected') &&
    otaHeader.includes('signatureKeyId'),
  'ESP32 verifies the release signature before accepting an update',
  'ESP32 release signature verification is incomplete'
)

expect(
  otaManager.includes('releaseNotesSha256') &&
    otaManager.includes('canonicalReleasePayload') &&
    otaManager.includes('DOTWATCH_OTA_SIGNING_KEY_ID'),
  'ESP32 binds signed metadata, release notes hash, and key ID',
  'ESP32 signed metadata binding is incomplete'
)

expect(
  otaManager.includes('antiRollbackFloor_') &&
    otaManager.includes('preferences.putULong("otaFloor"') &&
    otaManager.includes('next.buildNumber <= minimumAcceptedBuild()') &&
    otaManager.includes('esp_ota_mark_app_valid_cancel_rollback'),
  'ESP32 persists an anti-rollback floor only after confirming the running image',
  'ESP32 anti-rollback persistence is incomplete'
)

const firmwareBuildMatch = firmwareVersion.match(/DOTWATCH_FIRMWARE_BUILD\s+(\d+)UL/)
expect(
  firmwareVersion.includes('DOTWATCH_FIRMWARE_VERSION') &&
    Number(firmwareBuildMatch?.[1] || 0) >= 1300,
  'Firmware version/build preserves or advances beyond the signed OTA trust-chain release',
  'Firmware version/build regressed below Phase S3A'
)

const configuredMatch = signingHeader.match(
  /#define\s+DOTWATCH_OTA_SIGNING_KEY_CONFIGURED\s+([01])/
)
const keyIdMatch = signingHeader.match(
  /#define\s+DOTWATCH_OTA_SIGNING_KEY_ID\s+"([^"]+)"/
)
const fingerprintMatch = signingHeader.match(
  /#define\s+DOTWATCH_OTA_SIGNING_PUBLIC_KEY_SHA256\s+"([0-9a-fA-F]+)"/
)
const publicKeyMatch = signingHeader.match(
  /R"DOTWATCH_OTA_KEY\(([\s\S]*?)\)DOTWATCH_OTA_KEY"/
)

const isFailClosedDefault =
  configuredMatch?.[1] === '0' &&
  keyIdMatch?.[1] === 'UNCONFIGURED' &&
  signingHeader.includes(
    '#define DOTWATCH_OTA_SIGNING_PUBLIC_KEY_SHA256 "UNCONFIGURED"'
  ) &&
  signingHeader.includes(
    'DOTWATCH_OTA_SIGNING_PUBLIC_KEY_PEM = "";'
  )

let embeddedPublicKeyFingerprint = ''
try {
  const embeddedPublicKey = createPublicKey(publicKeyMatch?.[1]?.trim() || '')
  const embeddedPublicKeyDer = embeddedPublicKey.export({
    type: 'spki',
    format: 'der',
  })
  embeddedPublicKeyFingerprint = createHash('sha256')
    .update(embeddedPublicKeyDer)
    .digest('hex')
} catch {
  embeddedPublicKeyFingerprint = ''
}

const isProvisionedKeyValid =
  configuredMatch?.[1] === '1' &&
  keyIdMatch?.[1] === signingMetadata.keyId &&
  fingerprintMatch?.[1]?.toLowerCase() ===
    String(signingMetadata.publicKeySha256 || '').toLowerCase() &&
  embeddedPublicKeyFingerprint ===
    String(signingMetadata.publicKeySha256 || '').toLowerCase()

expect(
  isFailClosedDefault || isProvisionedKeyValid,
  isFailClosedDefault
    ? 'OTA signing overlay defaults to fail-closed before provisioning'
    : 'Provisioned OTA signing key matches Key ID, fingerprint, and embedded public key',
  'OTA signing key state is neither fail-closed nor validly provisioned'
)

expect(
  envExample.includes('OTA_REQUIRE_SIGNED_RELEASES=true') &&
    envExample.includes('OTA_RELEASE_PUBLIC_KEY_SHA256=') &&
    render.includes('key: OTA_REQUIRE_SIGNED_RELEASES'),
  'Production environment and Render configuration require signed releases',
  'Production signed-release configuration is incomplete'
)

expect(
  gitignore.includes('*.pem') &&
    gitignore.includes('!services/ota-server/keys/*.public.pem') &&
    !fs.existsSync(path.join(root, 'services/ota-server/keys/release-signing.private.pem')),
  'Private PEM keys remain ignored while the public release key can be committed',
  'Repository key-file ignore rules are unsafe'
)

for (const message of passes) console.log(`PASS: ${message}`)
if (failures.length) {
  for (const message of failures) console.error(`FAIL: ${message}`)
  process.exit(1)
}
console.log(`Phase S3A security verification passed (${passes.length} checks).`)
