import { z } from 'zod'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { checkAlarms } from '../services/alarm.service.js'
import {
  createAlarmActivity,
  createDeviceStatusActivity,
  createReadingActivity,
} from '../services/activity.service.js'

const DEFAULT_MAX_METRICS_PER_INGEST = 64
const DEFAULT_BATCH_MAX_READINGS = 120
const DEFAULT_RECORD_INTERVAL_SECONDS = 10
const MAX_FUTURE_TIMESTAMP_MS = 5 * 60 * 1000
const MAX_BACKDATE_TIMESTAMP_MS = 7 * 24 * 60 * 60 * 1000
const METRIC_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$/

const ingestSchema = z.object({
  metrics: z.record(z.string(), z.number()).optional(),

  temperature: z.number().min(-40).max(125).optional(),
  humidity: z.number().min(0).max(100).optional(),
  rssi: z.number().optional(),

  firmwareVersion: z.string().max(50).optional(),
  // Accept normal ISO timestamps from Python/Raspberry Pi, including '+00:00' offsets.
  // normalizeTimestamp() below remains the source of truth for validity, future, and backdate checks.
  timestamp: z.string().min(1).max(80).optional(),
})

const ingestBatchSchema = z.object({
  readings: z.array(ingestSchema).min(1),
  firmwareVersion: z.string().max(50).optional(),
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

function getMaxMetricsPerReading() {
  const value = Number(env.ingestMaxMetricsPerReading)
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_METRICS_PER_INGEST
}

function getBatchMaxReadings() {
  const value = Number(env.ingestBatchMaxReadings)
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_BATCH_MAX_READINGS
}

function getDeviceRecordIntervalSeconds(device = {}) {
  const value = Number(device.record_interval_seconds)

  return Number.isInteger(value) && value >= 1
    ? value
    : DEFAULT_RECORD_INTERVAL_SECONDS
}

function filterReadingsForHistory(device = {}, readings = []) {
  const intervalMs = getDeviceRecordIntervalSeconds(device) * 1000
  let lastRecordedTime = device.last_recorded_at
    ? new Date(device.last_recorded_at).getTime()
    : Number.NEGATIVE_INFINITY

  return readings
    .slice()
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .filter((reading) => {
      const readingTime = new Date(reading.time).getTime()

      if (!Number.isFinite(readingTime)) return false
      if (readingTime - lastRecordedTime < intervalMs) return false

      lastRecordedTime = readingTime
      return true
    })
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
  const maxMetrics = getMaxMetricsPerReading()

  if (entries.length > maxMetrics) {
    throw httpError(400, `Too many metrics. Maximum is ${maxMetrics}`)
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

function normalizeReading(data) {
  const metrics = normalizeMetrics(data)
  const values = normalizeFiniteMetrics(metrics)

  if (!values.length) {
    throw httpError(400, 'No valid metrics provided')
  }

  const time = normalizeTimestamp(data.timestamp)
  const latestMetrics = Object.fromEntries(values)

  return {
    time,
    values,
    latestMetrics,
    firmwareVersion: data.firmwareVersion || null,
    legacySensor:
      data.temperature != null && data.humidity != null
        ? {
            temperature: data.temperature,
            humidity: data.humidity,
            rssi: data.rssi ?? null,
          }
        : null,
  }
}

function pickNewestReading(readings = []) {
  return readings
    .slice()
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]
}

function flattenMetricRows(deviceId, readings = []) {
  const rows = []

  for (const reading of readings) {
    for (const [metricKey, value] of reading.values) {
      rows.push({
        time: reading.time,
        deviceId,
        metricKey,
        value,
      })
    }
  }

  return rows
}

function flattenLegacySensorRows(deviceId, readings = []) {
  return readings
    .filter((reading) => reading.legacySensor)
    .map((reading) => ({
      time: reading.time,
      deviceId,
      ...reading.legacySensor,
    }))
}

async function insertMetricRows(client, rows = []) {
  if (!rows.length) return 0

  await client.query(
    `
    INSERT INTO device_metric_readings (
      time,
      device_id,
      metric_key,
      value
    )
    SELECT
      input_rows.time,
      input_rows.device_id,
      input_rows.metric_key,
      input_rows.value
    FROM unnest(
      $1::timestamptz[],
      $2::bigint[],
      $3::text[],
      $4::double precision[]
    ) AS input_rows(time, device_id, metric_key, value)
    `,
    [
      rows.map((row) => row.time),
      rows.map((row) => row.deviceId),
      rows.map((row) => row.metricKey),
      rows.map((row) => row.value),
    ]
  )

  return rows.length
}

async function upsertMetricLatest(client, rows = []) {
  if (!rows.length) return 0

  await client.query(
    `
    INSERT INTO device_metric_latest (
      device_id,
      metric_key,
      time,
      value,
      updated_at
    )
    SELECT DISTINCT ON (input_rows.device_id, input_rows.metric_key)
      input_rows.device_id,
      input_rows.metric_key,
      input_rows.time,
      input_rows.value,
      now()
    FROM unnest(
      $1::timestamptz[],
      $2::bigint[],
      $3::text[],
      $4::double precision[]
    ) AS input_rows(time, device_id, metric_key, value)
    ORDER BY
      input_rows.device_id,
      input_rows.metric_key,
      input_rows.time DESC
    ON CONFLICT (device_id, metric_key)
    DO UPDATE SET
      time = EXCLUDED.time,
      value = EXCLUDED.value,
      updated_at = now()
    WHERE EXCLUDED.time >= device_metric_latest.time
    `,
    [
      rows.map((row) => row.time),
      rows.map((row) => row.deviceId),
      rows.map((row) => row.metricKey),
      rows.map((row) => row.value),
    ]
  )

  return rows.length
}

async function insertLegacySensorRows(client, rows = []) {
  if (!rows.length) return 0

  await client.query(
    `
    INSERT INTO sensor_readings (
      time,
      device_id,
      temperature,
      humidity,
      rssi
    )
    SELECT
      input_rows.time,
      input_rows.device_id,
      input_rows.temperature,
      input_rows.humidity,
      input_rows.rssi
    FROM unnest(
      $1::timestamptz[],
      $2::bigint[],
      $3::double precision[],
      $4::double precision[],
      $5::integer[]
    ) AS input_rows(time, device_id, temperature, humidity, rssi)
    `,
    [
      rows.map((row) => row.time),
      rows.map((row) => row.deviceId),
      rows.map((row) => row.temperature),
      rows.map((row) => row.humidity),
      rows.map((row) => row.rssi),
    ]
  )

  return rows.length
}

async function persistReadings({ client, device, readings, firmwareVersion }) {
  const historyReadings = filterReadingsForHistory(device, readings)
  const historyMetricRows = flattenMetricRows(device.id, historyReadings)
  const latestMetricRows = flattenMetricRows(device.id, readings)
  const legacySensorRows = flattenLegacySensorRows(device.id, historyReadings)

  await insertMetricRows(client, historyMetricRows)
  await upsertMetricLatest(client, latestMetricRows)
  await insertLegacySensorRows(client, legacySensorRows)

  const newestReading = pickNewestReading(readings)
  const newestRecordedReading = pickNewestReading(historyReadings)

  const deviceResult = await client.query(
    `
    UPDATE devices d
    SET
      last_seen_at = now(),
      last_ingest_at = now(),
      last_recorded_at = COALESCE($3::timestamptz, last_recorded_at),
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
      d.last_recorded_at,
      d.record_interval_seconds,
      d.firmware_version
    `,
    [
      device.id,
      firmwareVersion || newestReading?.firmwareVersion || null,
      newestRecordedReading?.time || null,
    ]
  )

  if (!deviceResult.rows.length) {
    throw httpError(404, 'Device not found')
  }

  return {
    updatedDevice: deviceResult.rows[0],
    newestReading,
    metricRowsInserted: historyMetricRows.length,
    historyReadingsRecorded: historyReadings.length,
    legacyRowsInserted: legacySensorRows.length,
  }
}

function broadcastIngestEvent(req, userIds, payload) {
  const broadcastToUser = req.app.get('broadcastToUser')

  if (typeof broadcastToUser !== 'function') return 0

  const targets = [...new Set(userIds.filter(Boolean).map(String))]

  return targets.reduce((total, userId) => {
    return total + broadcastToUser(userId, payload)
  }, 0)
}

async function publishIngestSideEffects({
  req,
  updatedDevice,
  previousStatus,
  reading,
  isBatch = false,
  batchSize = 1,
}) {
  const latestMetrics = reading.latestMetrics
  const time = reading.time

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
      temperature: latestMetrics.temperature ?? latestMetrics.metric_1,
      humidity: latestMetrics.humidity ?? latestMetrics.metric_2,
      rssi: latestMetrics.rssi,
      ...latestMetrics,
      latest_metrics: latestMetrics,
      metrics: latestMetrics,
      batch_size: batchSize,
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
      isBatch,
      batchSize,
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

  return alerts
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

  const reading = normalizeReading(data)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const {
      updatedDevice,
      metricRowsInserted,
      legacyRowsInserted,
      historyReadingsRecorded,
    } =
      await persistReadings({
        client,
        device,
        readings: [reading],
        firmwareVersion: data.firmwareVersion || null,
      })

    await client.query('COMMIT')

    const alerts = await publishIngestSideEffects({
      req,
      updatedDevice,
      previousStatus,
      reading,
    })

    res.status(201).json({
      ok: true,
      data: {
        deviceId: updatedDevice.id,
        deviceCode: updatedDevice.device_code,
        time: reading.time,
        latest_metrics: reading.latestMetrics,
        metrics: reading.latestMetrics,
        rowsInserted: metricRowsInserted,
        historyReadingsRecorded,
        legacyRowsInserted,
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

export async function ingestBatch(req, res) {
  const data = ingestBatchSchema.parse(req.body)
  const device = req.device
  const previousStatus = device.status || 'offline'
  const maxBatchReadings = getBatchMaxReadings()

  if (data.readings.length > maxBatchReadings) {
    return res.status(400).json({
      message: `Too many readings. Maximum is ${maxBatchReadings}`,
    })
  }

  const readings = data.readings.map((reading) => normalizeReading(reading))
  const newestReading = pickNewestReading(readings)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const {
      updatedDevice,
      metricRowsInserted,
      legacyRowsInserted,
      historyReadingsRecorded,
    } =
      await persistReadings({
        client,
        device,
        readings,
        firmwareVersion: data.firmwareVersion || newestReading?.firmwareVersion || null,
      })

    await client.query('COMMIT')

    const alerts = await publishIngestSideEffects({
      req,
      updatedDevice,
      previousStatus,
      reading: newestReading,
      isBatch: true,
      batchSize: readings.length,
    })

    res.status(201).json({
      ok: true,
      data: {
        deviceId: updatedDevice.id,
        deviceCode: updatedDevice.device_code,
        acceptedReadings: readings.length,
        rowsInserted: metricRowsInserted,
        historyReadingsRecorded,
        legacyRowsInserted,
        latestTime: newestReading.time,
        latest_metrics: newestReading.latestMetrics,
        metrics: newestReading.latestMetrics,
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
