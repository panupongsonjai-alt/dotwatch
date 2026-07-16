import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto'

export const OTA_RELEASE_PAYLOAD_VERSION = 'dotwatch-ota-release-v1'
export const OTA_RELEASE_SIGNATURE_ALGORITHM = 'ecdsa-p256-sha256'

function assertText(name, value, { maxLength = 512, pattern = null } = {}) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${name} is required`)
  if (text.length > maxLength) throw new Error(`${name} exceeds ${maxLength} characters`)
  if (/\r|\n|\0/.test(text)) throw new Error(`${name} contains invalid control characters`)
  if (pattern && !pattern.test(text)) throw new Error(`${name} contains invalid characters`)
  return text
}

function assertPositiveInteger(name, value) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function assertBoolean(value) {
  return value === true
}

function assertSha256(name, value) {
  const text = assertText(name, value, { maxLength: 64 }).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`${name} must be a 64-character SHA-256 hex value`)
  return text
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function publicKeyFingerprint(publicKeyPem) {
  const publicKey = createPublicKey(publicKeyPem)
  const der = publicKey.export({ type: 'spki', format: 'der' })
  return sha256Hex(der)
}

export function assertP256PublicKey(publicKeyPem) {
  const key = createPublicKey(publicKeyPem)
  if (key.asymmetricKeyType !== 'ec') throw new Error('OTA release public key must be an EC key')
  const curve = String(key.asymmetricKeyDetails?.namedCurve || '')
  if (!['prime256v1', 'P-256', 'secp256r1'].includes(curve)) {
    throw new Error(`OTA release public key must use P-256; found ${curve || 'unknown curve'}`)
  }
  return key
}

export function assertP256PrivateKey(privateKeyPem) {
  const key = createPrivateKey(privateKeyPem)
  if (key.asymmetricKeyType !== 'ec') throw new Error('OTA release private key must be an EC key')
  const curve = String(key.asymmetricKeyDetails?.namedCurve || '')
  if (!['prime256v1', 'P-256', 'secp256r1'].includes(curve)) {
    throw new Error(`OTA release private key must use P-256; found ${curve || 'unknown curve'}`)
  }
  return key
}

export function normalizeReleaseForSignature(release, { keyId = release?.signatureKeyId } = {}) {
  const normalized = {
    signatureAlgorithm: OTA_RELEASE_SIGNATURE_ALGORITHM,
    signatureKeyId: assertText('signatureKeyId', keyId, {
      maxLength: 96,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
    }),
    modelKey: assertText('modelKey', release?.modelKey, {
      maxLength: 96,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
    }),
    channel: assertText('channel', release?.channel, {
      maxLength: 32,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
    }),
    version: assertText('version', release?.version, {
      maxLength: 128,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/,
    }),
    buildNumber: assertPositiveInteger('buildNumber', release?.buildNumber),
    file: assertText('file', release?.file, {
      maxLength: 180,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]*\.bin$/,
    }),
    size: assertPositiveInteger('size', release?.size),
    sha256: assertSha256('sha256', release?.sha256),
    mandatory: assertBoolean(release?.mandatory),
    autoInstall: assertBoolean(release?.autoInstall),
    releaseNotes: String(release?.releaseNotes ?? ''),
    publishedAt: assertText('publishedAt', release?.publishedAt, {
      maxLength: 64,
      pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
    }),
  }

  normalized.releaseNotesSha256 = sha256Hex(Buffer.from(normalized.releaseNotes, 'utf8'))
  return normalized
}

export function canonicalReleasePayload(release) {
  const normalized = normalizeReleaseForSignature(release)
  return [
    OTA_RELEASE_PAYLOAD_VERSION,
    `algorithm=${normalized.signatureAlgorithm}`,
    `keyId=${normalized.signatureKeyId}`,
    `modelKey=${normalized.modelKey}`,
    `channel=${normalized.channel}`,
    `version=${normalized.version}`,
    `buildNumber=${normalized.buildNumber}`,
    `file=${normalized.file}`,
    `size=${normalized.size}`,
    `sha256=${normalized.sha256}`,
    `mandatory=${normalized.mandatory ? 1 : 0}`,
    `autoInstall=${normalized.autoInstall ? 1 : 0}`,
    `publishedAt=${normalized.publishedAt}`,
    `releaseNotesSha256=${normalized.releaseNotesSha256}`,
    '',
  ].join('\n')
}

export function signRelease(release, privateKeyPem, keyId) {
  const privateKey = assertP256PrivateKey(privateKeyPem)
  const normalized = normalizeReleaseForSignature(release, { keyId })
  const payload = canonicalReleasePayload(normalized)
  const signature = cryptoSign('sha256', Buffer.from(payload, 'utf8'), privateKey).toString('base64')
  const publicKey = createPublicKey(privateKey)
  const verified = cryptoVerify(
    'sha256',
    Buffer.from(payload, 'utf8'),
    publicKey,
    Buffer.from(signature, 'base64')
  )
  if (!verified) throw new Error('Generated OTA release signature did not self-verify')

  return {
    ...release,
    ...normalized,
    signature,
  }
}

export function verifyReleaseSignature(release, publicKeyPem, { expectedKeyId = '' } = {}) {
  try {
    const publicKey = assertP256PublicKey(publicKeyPem)
    const normalized = normalizeReleaseForSignature(release)
    if (release?.signatureAlgorithm !== OTA_RELEASE_SIGNATURE_ALGORITHM) {
      return { ok: false, reason: 'unsupported signature algorithm' }
    }
    if (expectedKeyId && normalized.signatureKeyId !== expectedKeyId) {
      return { ok: false, reason: 'signature key id mismatch' }
    }
    if (String(release?.releaseNotesSha256 || '').toLowerCase() !== normalized.releaseNotesSha256) {
      return { ok: false, reason: 'release notes hash mismatch' }
    }
    const signatureText = String(release?.signature || '').trim()
    if (!signatureText || !/^[A-Za-z0-9+/]+={0,2}$/.test(signatureText)) {
      return { ok: false, reason: 'missing or invalid base64 signature' }
    }
    const signature = Buffer.from(signatureText, 'base64')
    if (signature.length < 64 || signature.length > 80) {
      return { ok: false, reason: 'invalid ECDSA signature length' }
    }
    const payload = canonicalReleasePayload(normalized)
    const ok = cryptoVerify('sha256', Buffer.from(payload, 'utf8'), publicKey, signature)
    return ok ? { ok: true, normalized } : { ok: false, reason: 'signature verification failed' }
  } catch (error) {
    return { ok: false, reason: error.message }
  }
}
