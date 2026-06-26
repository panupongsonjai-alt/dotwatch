import dotenv from 'dotenv'

dotenv.config()

function parseNumber(value, fallback) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : fallback
}

function normalizePrivateKey(value) {
  return value?.replace(/\\n/g, '\n')
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

function validateCorsOrigins(origins = []) {
  if (!origins.length) {
    throw new Error('CORS_ORIGIN must include at least one origin')
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGIN must not include wildcard "*"')
    }

    let url

    try {
      url = new URL(origin)
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`)
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Invalid CORS origin protocol: ${origin}`)
    }

    if (url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`CORS origin must not include path/query/hash: ${origin}`)
    }
  }
}

export const env = {
  port: parseNumber(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),

  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),

  ingestMinIntervalSeconds: parseNumber(
    process.env.INGEST_MIN_INTERVAL_SECONDS,
    5
  ),

  isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
  isProduction: process.env.NODE_ENV === 'production',
}

export function validateEnv() {
  requireEnv('DATABASE_URL', env.databaseUrl)

  if (env.isProduction) {
    requireEnv('CORS_ORIGIN', process.env.CORS_ORIGIN)
    requireEnv('FIREBASE_PROJECT_ID', env.firebaseProjectId)
    requireEnv('FIREBASE_CLIENT_EMAIL', env.firebaseClientEmail)
    requireEnv('FIREBASE_PRIVATE_KEY', env.firebasePrivateKey)

    validateCorsOrigins(env.corsOrigins)
  }
}

validateEnv()
