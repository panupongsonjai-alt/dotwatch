import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'

const FAILED_AUTH_WINDOW_MS = 5 * 60 * 1000
const MAX_FAILED_AUTH_ATTEMPTS = 10

const failedDeviceAuthAttempts = new Map()

function getHeaderValue(req, names = []) {
  for (const name of names) {
    const value = req.headers[name]

    if (value) return String(value).trim()
  }

  return ''
}

function getDeviceAuthAttemptKey(req, deviceCode = '') {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown'

  return `${String(deviceCode || 'unknown').toLowerCase()}|${ip}`
}

function getFailedAttemptState(key) {
  const now = Date.now()
  const existing = failedDeviceAuthAttempts.get(key)

  if (!existing || existing.expiresAt <= now) {
    const next = {
      count: 0,
      expiresAt: now + FAILED_AUTH_WINDOW_MS,
    }

    failedDeviceAuthAttempts.set(key, next)
    return next
  }

  return existing
}

function assertDeviceAuthNotLocked(key) {
  const state = getFailedAttemptState(key)

  if (state.count >= MAX_FAILED_AUTH_ATTEMPTS) {
    const seconds = Math.ceil((state.expiresAt - Date.now()) / 1000)
    const error = new Error(
      `Too many invalid device auth attempts. Try again in ${seconds}s`
    )

    error.status = 429
    throw error
  }
}

function recordFailedDeviceAuth(key) {
  const state = getFailedAttemptState(key)

  state.count += 1
  failedDeviceAuthAttempts.set(key, state)
}

function clearFailedDeviceAuth(key) {
  failedDeviceAuthAttempts.delete(key)
}

export async function authDevice(req, res, next) {
  const deviceCode = getHeaderValue(req, ['x-device-code', 'x-device-id'])
  const deviceSecret = getHeaderValue(req, ['x-device-secret'])
  const attemptKey = getDeviceAuthAttemptKey(req, deviceCode)

  try {
    if (!deviceCode || !deviceSecret) {
      return res.status(401).json({
        message: 'Missing device credentials',
      })
    }

    assertDeviceAuthNotLocked(attemptKey)

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
      recordFailedDeviceAuth(attemptKey)

      return res.status(401).json({
        message: 'Invalid device',
      })
    }

    const ok = await bcrypt.compare(deviceSecret, device.secret_hash)

    if (!ok) {
      recordFailedDeviceAuth(attemptKey)

      return res.status(401).json({
        message: 'Invalid device secret',
      })
    }

    clearFailedDeviceAuth(attemptKey)

    req.device = device
    next()
  } catch (error) {
    next(error)
  }
}
