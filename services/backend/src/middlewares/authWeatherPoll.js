import crypto from 'node:crypto'
import { env } from '../config/env.js'

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8')
  const rightBuffer = Buffer.from(String(right || ''), 'utf8')

  if (leftBuffer.length !== rightBuffer.length) return false
  if (leftBuffer.length === 0) return false

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function authWeatherPoll(req, res, next) {
  if (!env.weatherVirtualDeviceEnabled) {
    return res.status(503).json({
      code: 'WEATHER_VIRTUAL_DEVICE_DISABLED',
      message: 'Weather virtual device polling is disabled',
    })
  }

  const authorization = String(req.headers.authorization || '').trim()
  const [scheme, token] = authorization.split(/\s+/, 2)

  if (!env.weatherPollSecret) {
    return res.status(503).json({
      code: 'WEATHER_POLL_SECRET_NOT_CONFIGURED',
      message: 'Weather polling secret is not configured',
    })
  }

  if (scheme !== 'Bearer' || !safeEqual(token, env.weatherPollSecret)) {
    return res.status(401).json({
      code: 'INVALID_WEATHER_POLL_SECRET',
      message: 'Invalid weather polling credentials',
    })
  }

  next()
}
