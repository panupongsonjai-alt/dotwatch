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
    'RameT7KiqYLV5vio0fsHKfxkQmh10+N+u4OAveuq5NI=',
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

function parseOriginUrl(origin) {
  try {
    return new URL(origin)
  } catch {
    return null
  }
}

function isLoopbackOrigin(originUrl) {
  if (!originUrl) return false

  return ['localhost', '127.0.0.1', '::1'].includes(originUrl.hostname)
}

function validateProductionCorsOrigins(
  origins,
  { allowLocalOrigins = false } = {}
) {
  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN must include at least one production origin')
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGIN must not use wildcard (*) in production')
    }

    const originUrl = parseOriginUrl(origin)

    if (!originUrl) {
      throw new Error(`CORS_ORIGIN must be a valid URL origin: ${origin}`)
    }

    const isLoopback = isLoopbackOrigin(originUrl)

    if (isLoopback) {
      if (!allowLocalOrigins) {
        throw new Error(
          `CORS_ORIGIN must not include local address in production unless ALLOW_LOCAL_CORS_IN_PRODUCTION=true: ${origin}`
        )
      }

      if (!['http:', 'https:'].includes(originUrl.protocol)) {
        throw new Error(
          `Local CORS_ORIGIN must use http:// or https://: ${origin}`
        )
      }

      continue
    }

    if (originUrl.protocol !== 'https:') {
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
  databaseSslDisabled: parseBoolean(process.env.DATABASE_SSL_DISABLED, false),
  databaseSslRejectUnauthorized: parseBoolean(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    nodeEnv === 'production'
  ),
  databaseSslCa: normalizePrivateKey(process.env.DATABASE_SSL_CA),

  corsOrigin: cleanEnvString(process.env.CORS_ORIGIN) || 'http://localhost:5173',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  allowLocalCorsInProduction: parseBoolean(
    process.env.ALLOW_LOCAL_CORS_IN_PRODUCTION,
    false
  ),

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
    12_000,
    { min: 60, max: 1_000_000 }
  ),
  ingestDeviceRateLimitPerMinute: parsePositiveInteger(
    process.env.INGEST_DEVICE_RATE_LIMIT_PER_MINUTE,
    180,
    { min: 10, max: 10_000 }
  ),
  deviceAuthFailureWindowMs: parsePositiveInteger(
    process.env.DEVICE_AUTH_FAILURE_WINDOW_MS,
    5 * 60 * 1000,
    { min: 10_000, max: 60 * 60 * 1000 }
  ),
  deviceAuthMaxFailuresPerIp: parsePositiveInteger(
    process.env.DEVICE_AUTH_MAX_FAILURES_PER_IP,
    30,
    { min: 5, max: 10_000 }
  ),
  deviceAuthMaxFailuresPerDevice: parsePositiveInteger(
    process.env.DEVICE_AUTH_MAX_FAILURES_PER_DEVICE,
    10,
    { min: 3, max: 10_000 }
  ),
  deviceAuthFailureTrackerMaxEntries: parsePositiveInteger(
    process.env.DEVICE_AUTH_FAILURE_TRACKER_MAX_ENTRIES,
    10_000,
    { min: 100, max: 1_000_000 }
  ),
  jsonBodyLimit: cleanEnvString(process.env.JSON_BODY_LIMIT) || '128kb',

  logLevel: cleanEnvString(process.env.LOG_LEVEL) || (nodeEnv === 'production' ? 'info' : 'debug'),
  httpLogEnabled: parseBoolean(process.env.HTTP_LOG_ENABLED, true),
  slowRequestMs: parsePositiveInteger(
    process.env.SLOW_REQUEST_MS,
    1000,
    { min: 0, max: 120_000 }
  ),
  opsSummaryIntervalSeconds: parsePositiveInteger(
    process.env.OPS_SUMMARY_INTERVAL_SECONDS,
    0,
    { min: 0, max: 86_400 }
  ),
  releaseVersion: cleanEnvString(process.env.RELEASE_VERSION) || cleanEnvString(process.env.RENDER_GIT_COMMIT),
  renderServiceName: cleanEnvString(process.env.RENDER_SERVICE_NAME),
  renderInstanceId: cleanEnvString(process.env.RENDER_INSTANCE_ID),

  wsPath: cleanEnvString(process.env.WS_PATH) || '/',
  wsSubscribeTimeoutMs: parsePositiveInteger(
    process.env.WS_SUBSCRIBE_TIMEOUT_MS,
    15_000,
    { min: 1_000, max: 120_000 }
  ),
  wsMaxPayloadBytes: parsePositiveInteger(
    process.env.WS_MAX_PAYLOAD_BYTES,
    16 * 1024,
    { min: 1024, max: 1024 * 1024 }
  ),
  wsMaxTotalClients: parsePositiveInteger(
    process.env.WS_MAX_TOTAL_CLIENTS,
    2000,
    { min: 10, max: 100_000 }
  ),
  wsMaxClientsPerIp: parsePositiveInteger(
    process.env.WS_MAX_CLIENTS_PER_IP,
    20,
    { min: 1, max: 1000 }
  ),
  wsMaxUnauthenticatedClientsPerIp: parsePositiveInteger(
    process.env.WS_MAX_UNAUTHENTICATED_CLIENTS_PER_IP,
    5,
    { min: 1, max: 100 }
  ),
  wsMaxClientsPerUser: parsePositiveInteger(
    process.env.WS_MAX_CLIENTS_PER_USER,
    5,
    { min: 1, max: 100 }
  ),
  wsMessageRateWindowMs: parsePositiveInteger(
    process.env.WS_MESSAGE_RATE_WINDOW_MS,
    10_000,
    { min: 1000, max: 60_000 }
  ),
  wsMaxMessagesPerWindow: parsePositiveInteger(
    process.env.WS_MAX_MESSAGES_PER_WINDOW,
    30,
    { min: 2, max: 10_000 }
  ),
  wsMaxBufferedBytes: parsePositiveInteger(
    process.env.WS_MAX_BUFFERED_BYTES,
    1024 * 1024,
    { min: 64 * 1024, max: 64 * 1024 * 1024 }
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

  weatherVirtualDeviceEnabled: parseBoolean(
    process.env.WEATHER_VIRTUAL_DEVICE_ENABLED,
    false
  ),
  weatherSchedulerEnabled: parseBoolean(
    process.env.WEATHER_SCHEDULER_ENABLED,
    true
  ),
  weatherPollSecret: cleanEnvString(process.env.WEATHER_POLL_SECRET),
  weatherSchedulerTickSeconds: parsePositiveInteger(
    process.env.WEATHER_SCHEDULER_TICK_SECONDS,
    60,
    { min: 10, max: 3600 }
  ),
  weatherSchedulerInitialDelayMs: parsePositiveInteger(
    process.env.WEATHER_SCHEDULER_INITIAL_DELAY_MS,
    5000,
    { min: 0, max: 300_000 }
  ),
  weatherFetchTimeoutMs: parsePositiveInteger(
    process.env.WEATHER_FETCH_TIMEOUT_MS,
    10_000,
    { min: 1000, max: 60_000 }
  ),
  weatherPollBatchSize: parsePositiveInteger(
    process.env.WEATHER_POLL_BATCH_SIZE,
    25,
    { min: 1, max: 500 }
  ),
  weatherPollConcurrency: parsePositiveInteger(
    process.env.WEATHER_POLL_CONCURRENCY,
    4,
    { min: 1, max: 20 }
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

  if (!env.wsPath.startsWith('/') || env.wsPath.includes('?') || env.wsPath.includes('#')) {
    throw new Error('WS_PATH must be an absolute URL path without query or fragment')
  }

  if (env.wsMaxUnauthenticatedClientsPerIp > env.wsMaxClientsPerIp) {
    throw new Error(
      'WS_MAX_UNAUTHENTICATED_CLIENTS_PER_IP must not exceed WS_MAX_CLIENTS_PER_IP'
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

    if (env.weatherVirtualDeviceEnabled) {
      requireEnv('WEATHER_POLL_SECRET', env.weatherPollSecret)

      if (env.weatherPollSecret.length < 32) {
        throw new Error(
          'WEATHER_POLL_SECRET must contain at least 32 characters in production'
        )
      }
    }

    if (env.databaseSslDisabled) {
      throw new Error('DATABASE_SSL_DISABLED must be false in production')
    }

    if (!env.databaseSslRejectUnauthorized) {
      throw new Error(
        'DATABASE_SSL_REJECT_UNAUTHORIZED must be true in production'
      )
    }

    validateProductionCorsOrigins(env.corsOrigins, {
      allowLocalOrigins: env.allowLocalCorsInProduction,
    })

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
    ingestDeviceRateLimitPerMinute: env.ingestDeviceRateLimitPerMinute,
    deviceAuthFailureWindowMs: env.deviceAuthFailureWindowMs,
    deviceAuthMaxFailuresPerIp: env.deviceAuthMaxFailuresPerIp,
    deviceAuthMaxFailuresPerDevice: env.deviceAuthMaxFailuresPerDevice,
    deviceAuthFailureTrackerMaxEntries: env.deviceAuthFailureTrackerMaxEntries,
    jsonBodyLimit: env.jsonBodyLimit,
    logLevel: env.logLevel,
    httpLogEnabled: env.httpLogEnabled,
    slowRequestMs: env.slowRequestMs,
    opsSummaryIntervalSeconds: env.opsSummaryIntervalSeconds,
    releaseVersion: env.releaseVersion,
    renderServiceName: env.renderServiceName,
    wsPath: env.wsPath,
    wsSubscribeTimeoutMs: env.wsSubscribeTimeoutMs,
    wsMaxPayloadBytes: env.wsMaxPayloadBytes,
    wsMaxTotalClients: env.wsMaxTotalClients,
    wsMaxClientsPerIp: env.wsMaxClientsPerIp,
    wsMaxUnauthenticatedClientsPerIp: env.wsMaxUnauthenticatedClientsPerIp,
    wsMaxClientsPerUser: env.wsMaxClientsPerUser,
    wsMessageRateWindowMs: env.wsMessageRateWindowMs,
    wsMaxMessagesPerWindow: env.wsMaxMessagesPerWindow,
    wsMaxBufferedBytes: env.wsMaxBufferedBytes,
    deviceWarningAfterSeconds: env.deviceWarningAfterSeconds,
    deviceOfflineAfterSeconds: env.deviceOfflineAfterSeconds,
    deviceStatusCheckSeconds: env.deviceStatusCheckSeconds,
    weatherVirtualDeviceEnabled: env.weatherVirtualDeviceEnabled,
    weatherSchedulerEnabled: env.weatherSchedulerEnabled,
    weatherSchedulerTickSeconds: env.weatherSchedulerTickSeconds,
    weatherPollBatchSize: env.weatherPollBatchSize,
    weatherPollConcurrency: env.weatherPollConcurrency,
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
