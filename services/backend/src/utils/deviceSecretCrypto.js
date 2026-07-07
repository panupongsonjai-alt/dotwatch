import crypto from 'crypto'
import { env } from '../config/env.js'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'

function getEncryptionKey() {
  const rawValue = env.deviceSecretEncryptionKey

  if (!rawValue) {
    throw new Error('Missing DEVICE_SECRET_ENCRYPTION_KEY')
  }

  const value = String(rawValue).trim()

  const base64Key = Buffer.from(value, 'base64')
  if (base64Key.length === 32) return base64Key

  if (/^[0-9a-f]{64}$/i.test(value)) {
    const hexKey = Buffer.from(value, 'hex')
    if (hexKey.length === 32) return hexKey
  }

  throw new Error(
    'DEVICE_SECRET_ENCRYPTION_KEY must be 32 bytes in base64 or 64 hex characters'
  )
}

export function encryptDeviceSecret(secret) {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(String(secret), 'utf8'),
    cipher.final(),
  ])

  const tag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

export function decryptDeviceSecret(payload) {
  if (!payload) {
    throw new Error('SECRET_NOT_RECOVERABLE')
  }

  const [version, ivValue, tagValue, encryptedValue] = String(payload).split(':')

  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('SECRET_NOT_RECOVERABLE')
  }

  const key = getEncryptionKey()
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivValue, 'base64')
  )

  decipher.setAuthTag(Buffer.from(tagValue, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
