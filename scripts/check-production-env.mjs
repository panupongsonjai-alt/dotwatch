import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const args = process.argv.slice(2)
const fileIndex = args.indexOf('--file')
const envFile = fileIndex >= 0 ? args[fileIndex + 1] : ''

function parseDotEnv(content) {
  const result = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const equalIndex = trimmed.indexOf('=')
    if (equalIndex === -1) continue

    const key = trimmed.slice(0, equalIndex).trim()
    let value = trimmed.slice(equalIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

function loadEnv() {
  if (!envFile) return { ...process.env }

  const resolved = path.resolve(envFile)
  if (!fs.existsSync(resolved)) {
    console.error(`Env file not found: ${resolved}`)
    process.exit(1)
  }

  return parseDotEnv(fs.readFileSync(resolved, 'utf8'))
}

function isTruthy(value) {
  return ['true', '1', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase())
}

function isValid32ByteKey(value) {
  const cleaned = String(value || '').trim()
  if (!cleaned) return false

  try {
    if (Buffer.from(cleaned, 'base64').length === 32) return true
  } catch {}

  if (/^[0-9a-f]{64}$/i.test(cleaned)) {
    return Buffer.from(cleaned, 'hex').length === 32
  }

  return false
}

function isUnsafePlaceholderKey(value) {
  const cleaned = String(value || '').trim()
  if (!cleaned) return true
  if (/REPLACE|CHANGE|YOUR_|example|placeholder/i.test(cleaned)) return true

  try {
    const key = Buffer.from(cleaned, 'base64')
    if (key.length === 32 && key.every((byte) => byte === 0)) return true
  } catch {}

  return false
}

function parsePositiveInteger(value, fallback) {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback
}

const env = loadEnv()
const errors = []
const warnings = []

for (const key of [
  'NODE_ENV',
  'DATABASE_URL',
  'CORS_ORIGIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'DEVICE_SECRET_ENCRYPTION_KEY',
]) {
  if (!env[key]) errors.push(`Missing ${key}`)
}

if (env.NODE_ENV !== 'production') {
  errors.push('NODE_ENV must be production')
}

if (isTruthy(env.DEV_AUTH_BYPASS)) {
  errors.push('DEV_AUTH_BYPASS must be false or omitted in production')
}

const origins = String(env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (origins.length === 0) errors.push('CORS_ORIGIN must include at least one origin')

for (const origin of origins) {
  if (origin === '*') errors.push('CORS_ORIGIN must not be wildcard (*)')
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(origin)) {
    errors.push(`CORS_ORIGIN must not include local address: ${origin}`)
  }
  if (!origin.startsWith('https://')) {
    errors.push(`CORS_ORIGIN must use https://: ${origin}`)
  }
}

if (!isValid32ByteKey(env.DEVICE_SECRET_ENCRYPTION_KEY)) {
  errors.push('DEVICE_SECRET_ENCRYPTION_KEY must be 32 bytes in base64 or 64 hex characters')
} else if (isUnsafePlaceholderKey(env.DEVICE_SECRET_ENCRYPTION_KEY)) {
  errors.push('DEVICE_SECRET_ENCRYPTION_KEY must not be a placeholder or all-zero key')
}

if (env.DATABASE_URL && /localhost|127\.0\.0\.1/i.test(env.DATABASE_URL)) {
  errors.push('DATABASE_URL must not point to localhost in production')
}

if (env.FIREBASE_PRIVATE_KEY && !env.FIREBASE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY')) {
  warnings.push('FIREBASE_PRIVATE_KEY does not look like a private key block')
}
const warningAfterSeconds = parsePositiveInteger(env.DEVICE_WARNING_AFTER_SECONDS, 30)
const offlineAfterSeconds = parsePositiveInteger(env.DEVICE_OFFLINE_AFTER_SECONDS, 60)
const statusCheckSeconds = parsePositiveInteger(env.DEVICE_STATUS_CHECK_SECONDS, 30)
const healthDbTimeoutMs = parsePositiveInteger(env.HEALTH_DB_TIMEOUT_MS, 3000)

if (warningAfterSeconds >= offlineAfterSeconds) {
  errors.push('DEVICE_WARNING_AFTER_SECONDS must be lower than DEVICE_OFFLINE_AFTER_SECONDS')
}

if (statusCheckSeconds > offlineAfterSeconds) {
  warnings.push('DEVICE_STATUS_CHECK_SECONDS is higher than DEVICE_OFFLINE_AFTER_SECONDS; offline updates may feel delayed')
}

if (healthDbTimeoutMs > 10000) {
  warnings.push('HEALTH_DB_TIMEOUT_MS is high; Render health checks may take too long to fail')
}


if (!env.DEVICE_SECRET_ENCRYPTION_KEY) {
  warnings.push(`Generate a key with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
}

if (errors.length) {
  console.error('Production environment check failed:')
  for (const error of errors) console.error(`- ${error}`)
  for (const warning of warnings) console.warn(`Warning: ${warning}`)
  process.exit(1)
}

console.log('Production environment check passed.')
for (const warning of warnings) console.warn(`Warning: ${warning}`)
console.log(`Generated key helper: ${crypto.randomBytes(32).toString('base64')}`)
