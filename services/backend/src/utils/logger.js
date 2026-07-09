import pino from 'pino'
import pinoHttp from 'pino-http'
import { env } from '../config/env.js'

function redactHeaders(headers = {}) {
  const safeHeaders = { ...headers }

  for (const key of Object.keys(safeHeaders)) {
    const normalized = key.toLowerCase()
    if (
      normalized === 'authorization' ||
      normalized === 'cookie' ||
      normalized === 'x-device-secret' ||
      normalized === 'x-api-key'
    ) {
      safeHeaders[key] = '[redacted]'
    }
  }

  return safeHeaders
}

function getClientIp(req) {
  const forwardedFor = req.headers?.['x-forwarded-for']
  if (Array.isArray(forwardedFor)) return forwardedFor[0]
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

function shouldIgnoreAutoLog(req) {
  if (!env.httpLogEnabled) return true

  const url = req.originalUrl || req.url || ''
  if (url === '/health/live') return true

  return false
}

export const logger = pino({
  level: env.logLevel,
  base: {
    service: 'dotwatch-backend',
    environment: env.nodeEnv,
    release: env.releaseVersion || undefined,
    renderService: env.renderServiceName || undefined,
    renderInstance: env.renderInstanceId || undefined,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-device-secret',
      'req.headers.x-api-key',
      'headers.authorization',
      'headers.cookie',
      'headers.x-device-secret',
      'headers.x-api-key',
      '*.deviceSecret',
      '*.device_secret',
      '*.secret',
      '*.password',
      '*.token',
      '*.idToken',
      '*.authToken',
    ],
    censor: '[redacted]',
  },
})

export function createHttpLogger() {
  return pinoHttp({
    logger,
    autoLogging: {
      ignore: shouldIgnoreAutoLog,
    },
    genReqId(req, res) {
      const requestId = req.requestId || req.headers['x-request-id']
      if (requestId) return String(requestId)
      return res.getHeader('x-request-id') || undefined
    },
    customLogLevel(req, res, error) {
      if (error || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      if (env.slowRequestMs > 0 && res.responseTime >= env.slowRequestMs) {
        return 'warn'
      }
      return 'info'
    },
    customProps(req, res) {
      const responseTime = Number(res.responseTime || 0)
      return {
        requestId: req.requestId,
        userId: req.user?.id || req.user?.uid || undefined,
        deviceCode: req.device?.device_code || req.device?.deviceCode || undefined,
        clientIp: getClientIp(req),
        slowRequest: env.slowRequestMs > 0 && responseTime >= env.slowRequestMs,
      }
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          path: req.raw?.originalUrl || req.originalUrl || req.url,
          headers: env.isDevelopment ? redactHeaders(req.headers) : undefined,
          remoteAddress: getClientIp(req.raw || req),
        }
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        }
      },
    },
  })
}

export function logStartupSummary(extra = {}) {
  logger.info({
    event: 'startup',
    nodeVersion: process.version,
    pid: process.pid,
    port: env.port,
    corsOrigins: env.isDevelopment ? env.corsOrigins : env.corsOrigins.length,
    databaseConfigured: Boolean(env.databaseUrl),
    firebaseRequired: env.isProduction,
    apiRateLimitPerMinute: env.apiRateLimitPerMinute,
    ingestRateLimitPerMinute: env.ingestRateLimitPerMinute,
    deviceWarningAfterSeconds: env.deviceWarningAfterSeconds,
    deviceOfflineAfterSeconds: env.deviceOfflineAfterSeconds,
    ...extra,
  }, 'dotWatch backend starting')
}

export function startOpsHeartbeat(getSnapshot) {
  if (!env.opsSummaryIntervalSeconds || env.opsSummaryIntervalSeconds <= 0) {
    return null
  }

  const interval = setInterval(() => {
    try {
      logger.info({
        event: 'ops_heartbeat',
        uptimeSeconds: Math.round(process.uptime()),
        memory: process.memoryUsage(),
        snapshot: typeof getSnapshot === 'function' ? getSnapshot() : undefined,
      }, 'dotWatch backend ops heartbeat')
    } catch (error) {
      logger.warn({ event: 'ops_heartbeat_failed', err: error }, 'Ops heartbeat failed')
    }
  }, env.opsSummaryIntervalSeconds * 1000)

  interval.unref?.()
  return interval
}
