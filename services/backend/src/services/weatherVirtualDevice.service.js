import { z } from 'zod'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { ingestVirtualReading } from '../controllers/ingest.controller.js'

export const WEATHER_MODEL_KEY = 'weather_api_demo'
export const WEATHER_PROVIDER = 'open_meteo'

const openMeteoResponseSchema = z.object({
  current: z.object({
    time: z.string().min(1),
    temperature_2m: z.number().finite(),
    relative_humidity_2m: z.number().finite().min(0).max(100),
  }),
})

function normalizeUtcTimestamp(value) {
  const text = String(value || '').trim()

  if (!text) {
    throw new Error('Weather provider returned an empty observation time')
  }

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
  const date = new Date(hasTimezone ? text : `${text}Z`)

  if (Number.isNaN(date.getTime())) {
    throw new Error('Weather provider returned an invalid observation time')
  }

  return date.toISOString()
}

export function buildOpenMeteoUrl({ latitude, longitude }) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m'
  )
  url.searchParams.set('temperature_unit', 'celsius')
  url.searchParams.set('timezone', 'UTC')

  return url
}

export function parseOpenMeteoCurrentResponse(payload) {
  const parsed = openMeteoResponseSchema.parse(payload)

  return {
    observedAt: normalizeUtcTimestamp(parsed.current.time),
    temperature: parsed.current.temperature_2m,
    humidity: parsed.current.relative_humidity_2m,
  }
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  timeout.unref?.()

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'dotWatch-weather-virtual-device/1.0',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      const error = new Error(
        `Weather provider request failed with HTTP ${response.status}`
      )
      error.statusCode = response.status
      throw error
    }

    return response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Weather provider timed out after ${timeoutMs} ms`)
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchOpenMeteoCurrentWeather(device) {
  const url = buildOpenMeteoUrl(device)
  const payload = await fetchJsonWithTimeout(url, env.weatherFetchTimeoutMs)

  return parseOpenMeteoCurrentResponse(payload)
}

async function listPollCandidates({ deviceId = null, force = false, limit }) {
  const result = await pool.query(
    `
    SELECT
      d.id,
      d.user_id,
      u.firebase_uid,
      d.device_code,
      d.name,
      d.status,
      d.last_seen_at,
      d.last_ingest_at,
      d.last_recorded_at,
      d.record_interval_seconds,
      d.latitude,
      d.longitude,
      d.model_id,
      w.provider,
      w.enabled AS weather_enabled,
      w.poll_interval_seconds,
      w.last_attempt_at,
      w.last_success_at,
      w.last_observed_at,
      w.consecutive_failures,
      w.last_error
    FROM devices d
    JOIN users u ON u.id = d.user_id
    JOIN device_models dm ON dm.id = d.model_id
    JOIN weather_virtual_devices w ON w.device_id = d.id
    WHERE d.is_active = true
      AND dm.model_key = $1
      AND w.enabled = true
      AND d.latitude IS NOT NULL
      AND d.longitude IS NOT NULL
      AND ($2::bigint IS NULL OR d.id = $2)
      AND (
        $3::boolean = true
        OR w.last_attempt_at IS NULL
        OR w.last_attempt_at <= NOW() - (w.poll_interval_seconds * INTERVAL '1 second')
      )
    ORDER BY COALESCE(w.last_attempt_at, TIMESTAMPTZ 'epoch') ASC, d.id ASC
    LIMIT $4
    `,
    [WEATHER_MODEL_KEY, deviceId, force, limit]
  )

  return result.rows
}

async function countUnconfiguredWeatherDevices() {
  const result = await pool.query(
    `
    SELECT COUNT(*)::integer AS count
    FROM devices d
    JOIN device_models dm ON dm.id = d.model_id
    JOIN weather_virtual_devices w ON w.device_id = d.id
    WHERE d.is_active = true
      AND dm.model_key = $1
      AND w.enabled = true
      AND (d.latitude IS NULL OR d.longitude IS NULL)
    `,
    [WEATHER_MODEL_KEY]
  )

  return Number(result.rows[0]?.count || 0)
}

async function acquireDeviceLock(client, deviceId) {
  const result = await client.query(
    `SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked`,
    [`dotwatch:weather:${deviceId}`]
  )

  return Boolean(result.rows[0]?.locked)
}

async function releaseDeviceLock(client, deviceId) {
  await client.query(
    `SELECT pg_advisory_unlock(hashtextextended($1, 0))`,
    [`dotwatch:weather:${deviceId}`]
  )
}

async function markAttempt(deviceId) {
  await pool.query(
    `
    UPDATE weather_virtual_devices
    SET last_attempt_at = NOW(), updated_at = NOW()
    WHERE device_id = $1
    `,
    [deviceId]
  )
}

async function markSuccess(deviceId, observedAt) {
  await pool.query(
    `
    UPDATE weather_virtual_devices
    SET
      last_success_at = NOW(),
      last_observed_at = GREATEST(
        COALESCE(last_observed_at, TIMESTAMPTZ 'epoch'),
        $2::timestamptz
      ),
      consecutive_failures = 0,
      last_error = NULL,
      updated_at = NOW()
    WHERE device_id = $1
    `,
    [deviceId, observedAt]
  )
}

async function markFailure(deviceId, error) {
  const message = String(error?.message || 'Unknown weather polling error').slice(
    0,
    1000
  )

  const result = await pool.query(
    `
    UPDATE weather_virtual_devices
    SET
      consecutive_failures = consecutive_failures + 1,
      last_error = $2,
      updated_at = NOW()
    WHERE device_id = $1
    RETURNING consecutive_failures
    `,
    [deviceId, message]
  )

  return Number(result.rows[0]?.consecutive_failures || 0)
}

async function touchProviderHeartbeat({ app, device, observedAt }) {
  const previousStatus = device.status || 'offline'
  const result = await pool.query(
    `
    UPDATE devices d
    SET
      last_seen_at = NOW(),
      last_ingest_at = NOW(),
      status = 'online',
      firmware_version = 'weather-api/open-meteo'
    FROM users u
    WHERE d.id = $1
      AND u.id = d.user_id
    RETURNING
      d.id,
      d.user_id,
      u.firebase_uid,
      d.device_code,
      d.name,
      d.status,
      d.last_seen_at,
      d.last_ingest_at,
      d.last_recorded_at,
      d.record_interval_seconds,
      d.firmware_version,
      d.last_ip_address,
      d.last_local_ip_address,
      d.last_wifi_ssid
    `,
    [device.id]
  )

  const updatedDevice = result.rows[0]
  const broadcastToUser = app?.get?.('broadcastToUser')

  if (updatedDevice && typeof broadcastToUser === 'function') {
    const payload = {
      type: 'device:update',
      data: {
        ...updatedDevice,
        latest_time: observedAt,
      },
    }

    broadcastToUser(updatedDevice.firebase_uid, payload)
    broadcastToUser(updatedDevice.user_id, payload)
  }

  return {
    previousStatus,
    updatedDevice,
  }
}

async function pollSingleWeatherDevice({ app, device }) {
  if (device.latitude == null || device.longitude == null) {
    return {
      deviceId: device.id,
      deviceCode: device.device_code,
      status: 'skipped_missing_location',
    }
  }

  const lockClient = await pool.connect()
  let locked = false

  try {
    locked = await acquireDeviceLock(lockClient, device.id)

    if (!locked) {
      return {
        deviceId: device.id,
        deviceCode: device.device_code,
        status: 'skipped_locked',
      }
    }

    await markAttempt(device.id)

    const reading = await fetchOpenMeteoCurrentWeather(device)
    const previousObservedAt = device.last_observed_at
      ? new Date(device.last_observed_at).getTime()
      : Number.NEGATIVE_INFINITY
    const currentObservedAt = new Date(reading.observedAt).getTime()

    if (
      Number.isFinite(previousObservedAt) &&
      currentObservedAt <= previousObservedAt
    ) {
      await touchProviderHeartbeat({
        app,
        device,
        observedAt: reading.observedAt,
      })
      await markSuccess(device.id, reading.observedAt)

      return {
        deviceId: device.id,
        deviceCode: device.device_code,
        status: 'skipped_duplicate',
        observedAt: reading.observedAt,
      }
    }

    const ingestResult = await ingestVirtualReading({
      app,
      device,
      data: {
        metrics: {
          temperature: reading.temperature,
          humidity: reading.humidity,
        },
        temperature: reading.temperature,
        humidity: reading.humidity,
        timestamp: reading.observedAt,
        firmwareVersion: 'weather-api/open-meteo',
      },
    })

    await markSuccess(device.id, reading.observedAt)

    return {
      deviceId: device.id,
      deviceCode: device.device_code,
      status: 'ingested',
      observedAt: reading.observedAt,
      temperature: reading.temperature,
      humidity: reading.humidity,
      alerts: ingestResult.alerts.length,
    }
  } catch (error) {
    const consecutiveFailures = await markFailure(device.id, error)

    return {
      deviceId: device.id,
      deviceCode: device.device_code,
      status: 'failed',
      error: String(error?.message || error),
      consecutiveFailures,
    }
  } finally {
    if (locked) {
      try {
        await releaseDeviceLock(lockClient, device.id)
      } catch (error) {
        console.warn('Weather device advisory lock release failed:', {
          deviceId: device.id,
          message: error.message,
        })
      }
    }

    lockClient.release()
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= items.length) return
      results[currentIndex] = await worker(items[currentIndex])
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length || 1)
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))

  return results
}

export async function pollWeatherVirtualDevices({
  app,
  deviceId = null,
  force = false,
  limit = env.weatherPollBatchSize,
} = {}) {
  if (!env.weatherVirtualDeviceEnabled) {
    return {
      enabled: false,
      selected: 0,
      unconfigured: 0,
      ingested: 0,
      skippedDuplicate: 0,
      skippedLocked: 0,
      skippedMissingLocation: 0,
      failed: 0,
      results: [],
    }
  }

  const safeLimit = Math.min(
    Math.max(1, Number(limit) || env.weatherPollBatchSize),
    env.weatherPollBatchSize
  )
  const candidates = await listPollCandidates({
    deviceId,
    force,
    limit: safeLimit,
  })
  const unconfigured = await countUnconfiguredWeatherDevices()
  const results = await runWithConcurrency(
    candidates,
    env.weatherPollConcurrency,
    (device) => pollSingleWeatherDevice({ app, device })
  )

  const count = (status) =>
    results.filter((result) => result?.status === status).length

  return {
    enabled: true,
    selected: candidates.length,
    unconfigured,
    ingested: count('ingested'),
    skippedDuplicate: count('skipped_duplicate'),
    skippedLocked: count('skipped_locked'),
    skippedMissingLocation: count('skipped_missing_location'),
    failed: count('failed'),
    results,
  }
}

export function startWeatherVirtualDeviceScheduler({ app, logger = console }) {
  if (
    !env.weatherVirtualDeviceEnabled ||
    !env.weatherSchedulerEnabled
  ) {
    logger.info?.({
      event: 'weather_scheduler_disabled',
      featureEnabled: env.weatherVirtualDeviceEnabled,
      schedulerEnabled: env.weatherSchedulerEnabled,
    })
    return null
  }

  let running = false

  async function tick() {
    if (running) {
      logger.warn?.({ event: 'weather_scheduler_overlap_skipped' })
      return
    }

    running = true

    try {
      const summary = await pollWeatherVirtualDevices({ app })
      logger.info?.(
        {
          event: 'weather_scheduler_tick',
          ...summary,
          results: undefined,
        },
        'Weather virtual device polling completed'
      )
    } catch (error) {
      logger.error?.(
        {
          event: 'weather_scheduler_failed',
          err: error,
        },
        'Weather virtual device polling failed'
      )
    } finally {
      running = false
    }
  }

  const initialTimer = setTimeout(tick, env.weatherSchedulerInitialDelayMs)
  initialTimer.unref?.()

  const interval = setInterval(
    tick,
    env.weatherSchedulerTickSeconds * 1000
  )
  interval.unref?.()

  return {
    stop() {
      clearTimeout(initialTimer)
      clearInterval(interval)
    },
  }
}
