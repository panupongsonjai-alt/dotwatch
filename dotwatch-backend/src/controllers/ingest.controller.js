import { z } from 'zod'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { broadcastToUser } from '../server.js'
import { checkAlarms } from '../services/alarm.service.js'

const ingestSchema = z.object({
  metrics: z.record(z.string(), z.number()).optional(),

  temperature: z.number().min(-40).max(125).optional(),
  humidity: z.number().min(0).max(100).optional(),
  rssi: z.number().optional(),

  firmwareVersion: z.string().max(50).optional(),
  timestamp: z.string().datetime().optional(),
})

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
  return Object.entries(metrics)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([metricKey, value]) => [metricKey, value])
}

export async function ingestReading(req, res) {
  const data = ingestSchema.parse(req.body)
  const device = req.device

  if (device.last_ingest_at) {
    const diff = (Date.now() - new Date(device.last_ingest_at).getTime()) / 1000

    if (diff < env.ingestMinIntervalSeconds) {
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

  const time = data.timestamp || new Date().toISOString()

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

    broadcastToUser(updatedDevice.firebase_uid, {
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
    })

    if (alerts.length > 0) {
      broadcastToUser(updatedDevice.firebase_uid, {
        type: 'alarm',
        data: alerts,
      })
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
