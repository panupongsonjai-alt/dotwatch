import { z } from 'zod'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { checkAlarms } from '../services/alarm.service.js'
import {
  createAlarmActivity,
  createDeviceStatusActivity,
  createReadingActivity,
} from '../services/activity.service.js'

const MAX_METRICS_PER_INGEST = 64
const MAX_FUTURE_TIMESTAMP_MS = 5 * 60 * 1000
const MAX_BACKDATE_TIMESTAMP_MS = 7 * 24 * 60 * 60 * 1000
const METRIC_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$/

const ingestSchema = z.object({
  metrics: z.record(z.string(), z.number()).optional(),

  temperature: z.number().min(-40).max(125).optional(),
  humidity: z.number().min(0).max(100).optional(),
  rssi: z.number().optional(),

  firmwareVersion: z.string().max(50).optional(),
  timestamp: z.string().datetime().optional(),
})

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function getIngestMinIntervalSeconds() {
  const value = Number(env.ingestMinIntervalSeconds)

  return Number.isFinite(value) && value > 0 ? value : 0
}

function normalizeTimestamp(value) {
  if (!value) return new Date().toISOString()

  const date = new Date(value)
  const time = date.getTime()

  if (Number.isNaN(time)) {
    throw httpError(400, 'Invalid timestamp')
  }

  const now = Date.now()

  if (time > now + MAX_FUTURE_TIMESTAMP_MS) {
    throw httpError(400, 'Timestamp is too far in the future')
  }

  if (time < now - MAX_BACKDATE_TIMESTAMP_MS) {
    throw httpError(400, 'Timestamp is too old')
  }

  return date.toISOString()
}

function normalizeMetrics(data) {
  if (data.metrics && Object.keys(data.metrics).length > 0) {
    return data.metrics
  }

  const legacyMetrics = {}

  if (data.temperature != null) legacyMetrics.metric_1 = data.temperature
  if (data.humidity != null) legacyMetrics.metric_2 = data.humidity
  if (data.rssi != null) legacyMetrics.rssi = data.rssi

  return legacyMetrics
}

function normalizeFiniteMetrics(metrics) {
  const entries = Object.entries(metrics || {})

  if (entries.length > MAX_METRICS_PER_INGEST) {
    throw httpError(
      400,
      `Too many metrics. Maximum is ${MAX_METRICS_PER_INGEST}`
    )
  }

  return entries
    .map(([metricKey, value]) => {
      const normalizedKey = String(metricKey || '').trim()
      const numberValue = Number(value)

      if (!METRIC_KEY_PATTERN.test(normalizedKey)) {
        throw httpError(400, `Invalid metric key: ${normalizedKey || '(empty)'}`)
      }

      if (!Number.isFinite(numberValue)) {
        return null
      }

      return [normalizedKey, numberValue]
    })
    .filter(Boolean)
}

function broadcastIngestEvent(req, userIds, payload) {
  const broadcastToUser = req.app.get('broadcastToUser')

  if (typeof broadcastToUser !== 'function') return 0

  const targets = [...new Set(userIds.filter(Boolean).map(String))]

  return targets.reduce((total, userId) => {
    return total + broadcastToUser(userId, payload)
  }, 0)
}

export async function ingestReading(req, res) {
  const data = ingestSchema.parse(req.body)
  const device = req.device
  const previousStatus = device.status || 'offline'
  const minIntervalSeconds = getIngestMinIntervalSeconds()

  if (device.last_ingest_at && minIntervalSeconds > 0) {
    const diff =
      (Date.now() - new Date(device.last_ingest_at).getTime()) / 1000

    if (diff < minIntervalSeconds) {
      return res.status(429).json({
        message: 'Device is sending too fast',
      })
    }
  }

  const metrics = normalizeMetrics(data)
  const values = normalizeFiniteMetrics(metrics)

  if (!values.length) {
    return res.status(400).json({
      message: 'No valid metrics provided',
    })
  }

  const time = normalizeTimestamp(data.timestamp)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    for (const [metricKey, value] of values) {
      await client.query(
        `
        INSERT INTO device_metric_readings (
          time,
          device_id,
          metric_key,
          value
        )
        VALUES ($1, $2, $3, $4)
        `,
        [time, device.id, metricKey, value]
      )
    }

    if (data.temperature != null && data.humidity != null) {
      await client.query(
        `
        INSERT INTO sensor_readings (
          time,
          device_id,
          temperature,
          humidity,
          rssi
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [time, device.id, data.temperature, data.humidity, data.rssi ?? null]
      )
    }

    const deviceResult = await client.query(
      `
      UPDATE devices d
      SET
        last_seen_at = now(),
        last_ingest_at = now(),
        status = 'online',
        firmware_version = COALESCE($2, firmware_version)
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
        d.firmware_version
      `,
      [device.id, data.firmwareVersion || null]
    )

    if (!deviceResult.rows.length) {
      throw httpError(404, 'Device not found')
    }

    await client.query('COMMIT')

    const updatedDevice = deviceResult.rows[0]
    const latestMetrics = Object.fromEntries(values)

    const alerts = await checkAlarms({
      userId: updatedDevice.user_id,
      deviceId: updatedDevice.id,
      reading: {
        time,
        ...latestMetrics,
      },
    })

    const readingPayload = {
      type: 'reading',
      data: {
        id: updatedDevice.id,
        user_id: updatedDevice.user_id,
        firebase_uid: updatedDevice.firebase_uid,
        device_code: updatedDevice.device_code,
        name: updatedDevice.name,
        status: updatedDevice.status,
        last_seen_at: updatedDevice.last_seen_at,
        last_ingest_at: updatedDevice.last_ingest_at,
        firmware_version: updatedDevice.firmware_version,
        latest_time: time,
        temperature:
          data.temperature ??
          latestMetrics.temperature ??
          latestMetrics.metric_1,
        humidity:
          data.humidity ?? latestMetrics.humidity ?? latestMetrics.metric_2,
        rssi: data.rssi ?? latestMetrics.rssi,
        ...latestMetrics,
        latest_metrics: latestMetrics,
        metrics: latestMetrics,
      },
    }

    const realtimeTargets = [updatedDevice.firebase_uid, updatedDevice.user_id]

    const sentCount = broadcastIngestEvent(req, realtimeTargets, readingPayload)

    const readingActivity = await createReadingActivity({
      userId: updatedDevice.user_id,
      deviceId: updatedDevice.id,
      deviceName: updatedDevice.name || updatedDevice.device_code,
      latestMetrics,
      createdAt: time,
    })

    if (readingActivity) {
      broadcastIngestEvent(req, realtimeTargets, {
        type: 'activity',
        data: readingActivity,
      })
    }

    if (previousStatus !== 'online') {
      const statusActivity = await createDeviceStatusActivity({
        userId: updatedDevice.user_id,
        deviceId: updatedDevice.id,
        deviceName: updatedDevice.name || updatedDevice.device_code,
        status: 'online',
        createdAt: time,
      })

      if (statusActivity) {
        broadcastIngestEvent(req, realtimeTargets, {
          type: 'activity',
          data: statusActivity,
        })
      }
    }

    if (sentCount === 0) {
      console.warn('Ingest realtime broadcast had no active subscribers:', {
        deviceId: updatedDevice.id,
        deviceCode: updatedDevice.device_code,
        firebaseUid: updatedDevice.firebase_uid,
      })
    }

    if (alerts.length > 0) {
      broadcastIngestEvent(req, realtimeTargets, {
        type: 'alarm',
        data: alerts,
      })

      for (const alert of alerts) {
        const alarmActivity = await createAlarmActivity({
          userId: updatedDevice.user_id,
          deviceId: updatedDevice.id,
          alarm: alert,
        })

        if (alarmActivity) {
          broadcastIngestEvent(req, realtimeTargets, {
            type: 'activity',
            data: alarmActivity,
          })
        }
      }
    }

    res.status(201).json({
      ok: true,
      data: {
        deviceId: updatedDevice.id,
        deviceCode: updatedDevice.device_code,
        time,
        latest_metrics: latestMetrics,
        metrics: latestMetrics,
        alerts,
      },
    })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
