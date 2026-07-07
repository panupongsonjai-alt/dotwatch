import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config()

function cleanEnvString(value) {
  if (value === undefined || value === null) return ''

  const trimmed = String(value).trim()

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }

  return trimmed
}

function parseNumber(value, fallback) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function parsePositiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numberValue = Number(value)

  if (!Number.isInteger(numberValue)) return fallback
  if (numberValue < min || numberValue > max) return fallback

  return numberValue
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback

  const normalized = String(value).trim().toLowerCase()

  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false

  return fallback
}

function normalizePrivateKey(value) {
  const cleaned = cleanEnvString(value)
  return cleaned ? cleaned.replace(/\\n/g, '\n') : ''
}

function parseCorsOrigins(value) {
  return String(value || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
}

function isValid32ByteSecretKey(value) {
  const cleaned = cleanEnvString(value)

  if (!cleaned) return false

  try {
    const base64Key = Buffer.from(cleaned, 'base64')
    if (base64Key.length === 32) return true
  } catch {
    // Continue to hex check.
  }

  if (/^[0-9a-f]{64}$/i.test(cleaned)) {
    const hexKey = Buffer.from(cleaned, 'hex')
    return hexKey.length === 32
  }

  return false
}

function isUnsafePlaceholderSecretKey(value) {
  const cleaned = cleanEnvString(value)
  if (!cleaned) return true

  const placeholders = new Set([
    'REPLACE_WITH_GENERATED_32_BYTE_BASE64_KEY',
    'CHANGE_ME',
    'CHANGE-THIS',
    'change-this',
  ])

  if (placeholders.has(cleaned)) return true

  try {
    const key = Buffer.from(cleaned, 'base64')
    if (key.length === 32) {
      return key.every((byte) => byte === 0)
    }
  } catch {
    // Ignore malformed base64 here. The format validator handles it.
  }

  return false
}

function validateProductionCorsOrigins(origins) {
  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN must include at least one production origin')
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGIN must not use wildcard (*) in production')
    }

    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(origin)) {
      throw new Error(
        `CORS_ORIGIN must not include local address in production: ${origin}`
      )
    }

    if (!origin.startsWith('https://')) {
      throw new Error(
        `CORS_ORIGIN must use https:// in production: ${origin}`
      )
    }
  }
}

const nodeEnv = cleanEnvString(process.env.NODE_ENV) || 'development'

export const env = {
  port: parseNumber(process.env.PORT, 4000),
  nodeEnv,
  databaseUrl: cleanEnvString(process.env.DATABASE_URL),

  corsOrigin: cleanEnvString(process.env.CORS_ORIGIN) || 'http://localhost:5173',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),

  firebaseProjectId: cleanEnvString(process.env.FIREBASE_PROJECT_ID),
  firebaseClientEmail: cleanEnvString(process.env.FIREBASE_CLIENT_EMAIL),
  firebasePrivateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),

  deviceSecretEncryptionKey: cleanEnvString(
    process.env.DEVICE_SECRET_ENCRYPTION_KEY
  ),

  devAuthBypass: parseBoolean(process.env.DEV_AUTH_BYPASS, false),
  devAuthUid: cleanEnvString(process.env.DEV_AUTH_UID) || 'local-dev-user',
  devAuthEmail:
    cleanEnvString(process.env.DEV_AUTH_EMAIL) || 'local-dev@dotwatch.local',

  ingestMinIntervalSeconds: parsePositiveInteger(
    process.env.INGEST_MIN_INTERVAL_SECONDS,
    5,
    { min: 0, max: 3600 }
  ),
  ingestMaxMetricsPerReading: parsePositiveInteger(
    process.env.INGEST_MAX_METRICS_PER_READING,
    64,
    { min: 1, max: 256 }
  ),
  ingestBatchMaxReadings: parsePositiveInteger(
    process.env.INGEST_BATCH_MAX_READINGS,
    120,
    { min: 1, max: 1000 }
  ),

  historyRawMaxHours: parsePositiveInteger(
    process.env.HISTORY_RAW_MAX_HOURS,
    36,
    { min: 1, max: 24 * 31 }
  ),
  historyMaxRows: parsePositiveInteger(
    process.env.HISTORY_MAX_ROWS,
    5000,
    { min: 100, max: 100_000 }
  ),
  historyUseContinuousAggregates: parseBoolean(
    process.env.HISTORY_USE_CONTINUOUS_AGGREGATES,
    true
  ),

  apiRateLimitPerMinute: parsePositiveInteger(
    process.env.API_RATE_LIMIT_PER_MINUTE,
    600,
    { min: 10, max: 100_000 }
  ),
  ingestRateLimitPerMinute: parsePositiveInteger(
    process.env.INGEST_RATE_LIMIT_PER_MINUTE,
    50_000,
    { min: 60, max: 1_000_000 }
  ),
  jsonBodyLimit: cleanEnvString(process.env.JSON_BODY_LIMIT) || '128kb',

  wsSubscribeTimeoutMs: parsePositiveInteger(
    process.env.WS_SUBSCRIBE_TIMEOUT_MS,
    15_000,
    { min: 1_000, max: 120_000 }
  ),
  wsMaxClientsPerUser: parsePositiveInteger(
    process.env.WS_MAX_CLIENTS_PER_USER,
    5,
    { min: 1, max: 100 }
  ),

  deviceWarningAfterSeconds: parsePositiveInteger(
    process.env.DEVICE_WARNING_AFTER_SECONDS,
    30,
    { min: 5, max: 86_400 }
  ),
  deviceOfflineAfterSeconds: parsePositiveInteger(
    process.env.DEVICE_OFFLINE_AFTER_SECONDS,
    60,
    { min: 10, max: 86_400 }
  ),
  deviceStatusCheckSeconds: parsePositiveInteger(
    process.env.DEVICE_STATUS_CHECK_SECONDS,
    30,
    { min: 10, max: 3600 }
  ),

  healthDbTimeoutMs: parsePositiveInteger(
    process.env.HEALTH_DB_TIMEOUT_MS,
    3000,
    { min: 500, max: 30_000 }
  ),
  shutdownTimeoutMs: parsePositiveInteger(
    process.env.SHUTDOWN_TIMEOUT_MS,
    10_000,
    { min: 1000, max: 60_000 }
  ),

  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
}

export function validateEnv() {
  requireEnv('DATABASE_URL', env.databaseUrl)

  if (env.devAuthBypass && !env.isDevelopment) {
    throw new Error(
      'DEV_AUTH_BYPASS=true is allowed only when NODE_ENV=development'
    )
  }

  if (env.deviceWarningAfterSeconds >= env.deviceOfflineAfterSeconds) {
    throw new Error(
      'DEVICE_WARNING_AFTER_SECONDS must be lower than DEVICE_OFFLINE_AFTER_SECONDS'
    )
  }

  if (env.deviceSecretEncryptionKey && !isValid32ByteSecretKey(env.deviceSecretEncryptionKey)) {
    throw new Error(
      'DEVICE_SECRET_ENCRYPTION_KEY must be 32 bytes in base64 or 64 hex characters'
    )
  }

  if (env.isProduction) {
    requireEnv('CORS_ORIGIN', process.env.CORS_ORIGIN)
    requireEnv('FIREBASE_PROJECT_ID', env.firebaseProjectId)
    requireEnv('FIREBASE_CLIENT_EMAIL', env.firebaseClientEmail)
    requireEnv('FIREBASE_PRIVATE_KEY', env.firebasePrivateKey)
    requireEnv('DEVICE_SECRET_ENCRYPTION_KEY', env.deviceSecretEncryptionKey)

    validateProductionCorsOrigins(env.corsOrigins)

    if (isUnsafePlaceholderSecretKey(env.deviceSecretEncryptionKey)) {
      throw new Error(
        'DEVICE_SECRET_ENCRYPTION_KEY must be a newly generated random key in production'
      )
    }
  }

  if (env.isDevelopment && env.devAuthBypass) {
    console.warn(
      'DEV_AUTH_BYPASS is enabled for local development. Do not use this setting in production.'
    )
  }
}

export function getPublicRuntimeConfig() {
  return {
    nodeEnv: env.nodeEnv,
    corsOrigins: env.isDevelopment ? env.corsOrigins : env.corsOrigins.length,
    devAuthBypass: env.isDevelopment ? env.devAuthBypass : false,
    apiRateLimitPerMinute: env.apiRateLimitPerMinute,
    ingestRateLimitPerMinute: env.ingestRateLimitPerMinute,
    jsonBodyLimit: env.jsonBodyLimit,
    wsSubscribeTimeoutMs: env.wsSubscribeTimeoutMs,
    wsMaxClientsPerUser: env.wsMaxClientsPerUser,
    deviceWarningAfterSeconds: env.deviceWarningAfterSeconds,
    deviceOfflineAfterSeconds: env.deviceOfflineAfterSeconds,
    deviceStatusCheckSeconds: env.deviceStatusCheckSeconds,
    healthDbTimeoutMs: env.healthDbTimeoutMs,
    ingestMaxMetricsPerReading: env.ingestMaxMetricsPerReading,
    ingestBatchMaxReadings: env.ingestBatchMaxReadings,
    historyRawMaxHours: env.historyRawMaxHours,
    historyMaxRows: env.historyMaxRows,
    historyUseContinuousAggregates: env.historyUseContinuousAggregates,
  }
}

export function generateDeviceSecretEncryptionKey() {
  return crypto.randomBytes(32).toString('base64')
}

validateEnv()
