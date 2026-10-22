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
  // Explicit sizing/timeouts. Without connectionTimeoutMillis a request waits
  // forever when the pool is exhausted, which turns a load spike into a hang.
  max: env.databasePoolMax,
  idleTimeoutMillis: env.databasePoolIdleTimeoutMs,
  connectionTimeoutMillis: env.databasePoolConnectionTimeoutMs,
  // Server-side guard so a runaway query cannot hold a connection forever.
  // 0 disables it (Postgres default).
  ...(env.databaseStatementTimeoutMs > 0
    ? { statement_timeout: env.databaseStatementTimeoutMs }
    : {}),
  application_name: 'dotwatch-backend',
})

// An idle client can be disconnected by the server (restart, failover,
// network blip). pg emits 'error' on the pool in that case; without a listener
// Node treats it as an unhandled error and the whole process exits.
pool.on('error', (error) => {
  console.error('Postgres idle client error:', error.message)
})
