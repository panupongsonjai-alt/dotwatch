import pg from 'pg'
import { env } from '../config/env.js'

const { Pool } = pg

const isRenderDb =
  env.databaseUrl?.includes('render.com') ||
  env.databaseUrl?.includes('render.internal')

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback

  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false

  return fallback
}

function getDatabaseSslConfig() {
  if (parseBoolean(process.env.DATABASE_SSL_DISABLED, false)) return false

  const rejectUnauthorized = parseBoolean(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    false
  )

  if (isRenderDb || env.databaseUrl?.includes('sslmode=require')) {
    return { rejectUnauthorized }
  }

  return false
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: getDatabaseSslConfig(),
})
