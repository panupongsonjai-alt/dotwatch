import { env, getPublicRuntimeConfig } from '../config/env.js'
import { firebaseReady } from '../config/firebaseAdmin.js'
import { pool } from '../db/pool.js'

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function checkDatabaseHealth() {
  const startedAt = Date.now()

  try {
    await withTimeout(pool.query('SELECT 1 AS ok'), env.healthDbTimeoutMs, 'Database health check')

    return {
      status: 'connected',
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - startedAt,
      message: env.isDevelopment ? error.message : 'Database health check failed',
    }
  }
}

export async function buildHealthResponse({ includeDatabase = true, websocketSummary = null } = {}) {
  const startedAt = Date.now()
  const database = includeDatabase ? await checkDatabaseHealth() : { status: 'not_checked' }
  const firebase = firebaseReady ? 'configured' : 'not_configured'
  const ready = database.status !== 'error' && (!env.isProduction || firebaseReady)

  return {
    statusCode: ready ? 200 : 503,
    body: {
      ok: ready,
      service: 'dotwatch-backend',
      environment: env.nodeEnv,
      release: env.releaseVersion || 'local',
      renderService: env.renderServiceName || undefined,
      database: database.status,
      databaseLatencyMs: database.latencyMs,
      firebase,
      websocket: websocketSummary ?? 'enabled',
      uptime: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      ...(database.message ? { databaseMessage: database.message } : {}),
      ...(env.isDevelopment ? { config: getPublicRuntimeConfig() } : {}),
    },
  }
}
