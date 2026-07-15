import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'
import { pool } from '../db/pool.js'
import { FixedWindowLimiter } from '../security/fixedWindowLimiter.js'
import { ensureDeviceMetricSettingsSchema } from '../services/schemaCompatibility.service.js'

const failedAuthByIp = new FixedWindowLimiter({
  windowMs: env.deviceAuthFailureWindowMs,
  limit: env.deviceAuthMaxFailuresPerIp,
  maxEntries: env.deviceAuthFailureTrackerMaxEntries,
})

const failedAuthByDevice = new FixedWindowLimiter({
  windowMs: env.deviceAuthFailureWindowMs,
  limit: env.deviceAuthMaxFailuresPerDevice,
  maxEntries: env.deviceAuthFailureTrackerMaxEntries,
})

function getHeaderValue(req, names = []) {
  for (const name of names) {
    const value = req.headers[name]

    if (value) return String(value).trim()
  }

  return ''
}

function getRequestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 128)
}

function getDeviceKey(deviceCode) {
  return String(deviceCode || 'unknown').trim().toLowerCase().slice(0, 128)
}

function sendRateLimitResponse(res, state) {
  const retryAfterSeconds = Math.max(1, Math.ceil(state.retryAfterMs / 1000))

  res.setHeader('Retry-After', String(retryAfterSeconds))
  return res.status(429).json({
    message: 'Too many invalid device authentication attempts',
    retryAfterSeconds,
  })
}

function getLockedState(ipKey, deviceKey) {
  const ipState = failedAuthByIp.check(ipKey)
  if (!ipState.allowed) return ipState

  const deviceState = failedAuthByDevice.check(deviceKey)
  if (!deviceState.allowed) return deviceState

  return null
}

function recordFailedDeviceAuth(ipKey, deviceKey) {
  failedAuthByIp.consume(ipKey)
  failedAuthByDevice.consume(deviceKey)
}

export async function authDevice(req, res, next) {
  const deviceCode = getHeaderValue(req, ['x-device-code', 'x-device-id'])
  const deviceSecret = getHeaderValue(req, ['x-device-secret'])
  const ipKey = `ip:${getRequestIp(req)}`
  const deviceKey = `device:${getDeviceKey(deviceCode)}`

  try {
    const lockedState = getLockedState(ipKey, deviceKey)
    if (lockedState) return sendRateLimitResponse(res, lockedState)

    if (!deviceCode || !deviceSecret) {
      recordFailedDeviceAuth(ipKey, deviceKey)

      return res.status(401).json({
        message: 'Missing device credentials',
      })
    }

    await ensureDeviceMetricSettingsSchema()

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        device_code,
        secret_hash,
        status,
        is_active,
        last_ingest_at,
        record_interval_seconds,
        last_recorded_at,
        model_id
      FROM devices
      WHERE device_code = $1
      LIMIT 1
      `,
      [deviceCode]
    )

    const device = result.rows[0]

    if (!device || !device.is_active || !device.secret_hash) {
      recordFailedDeviceAuth(ipKey, deviceKey)

      return res.status(401).json({
        message: 'Invalid device credentials',
      })
    }

    const ok = await bcrypt.compare(deviceSecret, device.secret_hash)

    if (!ok) {
      recordFailedDeviceAuth(ipKey, deviceKey)

      return res.status(401).json({
        message: 'Invalid device credentials',
      })
    }

    req.device = device
    next()
  } catch (error) {
    next(error)
  }
}
