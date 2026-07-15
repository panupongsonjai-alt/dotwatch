import pg from 'pg'
import { env } from '../config/env.js'

const { Pool } = pg

const isRenderDb =
  env.databaseUrl?.includes('render.com') ||
  env.databaseUrl?.includes('render.internal')

function getDatabaseSslConfig() {
  if (env.databaseSslDisabled) return false

  if (isRenderDb || env.databaseUrl?.includes('sslmode=require')) {
    return {
      rejectUnauthorized: env.databaseSslRejectUnauthorized,
      ...(env.databaseSslCa ? { ca: env.databaseSslCa } : {}),
    }
  }

  return false
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: getDatabaseSslConfig(),
})
