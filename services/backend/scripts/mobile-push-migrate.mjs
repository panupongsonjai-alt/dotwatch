import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const databaseUrl = String(process.env.DATABASE_URL || '').trim()

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL')
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback

  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false

  return fallback
}

function normalizePem(value) {
  const cleaned = String(value || '').trim()
  return cleaned ? cleaned.replace(/\\n/g, '\n') : ''
}

function getSslConfig() {
  const isRender =
    databaseUrl.includes('render.com') ||
    databaseUrl.includes('render.internal')
  const sslDisabled = parseBoolean(process.env.DATABASE_SSL_DISABLED, false)
  const rejectUnauthorized = parseBoolean(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    process.env.NODE_ENV === 'production'
  )
  const ca = normalizePem(process.env.DATABASE_SSL_CA)

  if (process.env.NODE_ENV === 'production' && sslDisabled) {
    throw new Error('DATABASE_SSL_DISABLED must be false in production')
  }

  if (process.env.NODE_ENV === 'production' && !rejectUnauthorized) {
    throw new Error(
      'DATABASE_SSL_REJECT_UNAUTHORIZED must be true in production'
    )
  }

  if (sslDisabled) return false

  if (isRender || databaseUrl.includes('sslmode=require')) {
    return {
      rejectUnauthorized,
      ...(ca ? { ca } : {}),
    }
  }

  return false
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationPath = path.resolve(
  __dirname,
  '../migrations/025_mobile_push_tokens.sql'
)
const sql = fs.readFileSync(migrationPath, 'utf8')
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: getSslConfig(),
})

await client.connect()

try {
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')
  console.log('Mobile push token migration: OK')
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  await client.end()
}
