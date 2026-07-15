import { env } from '../config/env.js'
import { FixedWindowLimiter } from '../security/fixedWindowLimiter.js'

const limiter = new FixedWindowLimiter({
  windowMs: 60_000,
  limit: env.ingestDeviceRateLimitPerMinute,
  maxEntries: env.deviceAuthFailureTrackerMaxEntries,
})

export function deviceIngestRateLimit(req, res, next) {
  const deviceId = req.device?.id

  if (!deviceId) {
    return res.status(401).json({
      message: 'Device authentication required',
    })
  }

  const state = limiter.consume(`device:${deviceId}`)

  res.setHeader('RateLimit-Limit', String(env.ingestDeviceRateLimitPerMinute))
  res.setHeader('RateLimit-Remaining', String(state.remaining))
  res.setHeader('RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)))

  if (!state.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(state.retryAfterMs / 1000))
    res.setHeader('Retry-After', String(retryAfterSeconds))

    return res.status(429).json({
      message: 'Device ingest rate limit exceeded',
      retryAfterSeconds,
    })
  }

  next()
}
