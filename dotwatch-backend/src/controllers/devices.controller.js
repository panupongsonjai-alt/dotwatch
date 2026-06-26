import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'

const DEVICE_NAME_MAX_LENGTH = 80
const DEVICE_GROUP_MAX_LENGTH = 80
const MAP_URL_MAX_LENGTH = 500
const DEVICE_CODE_PATTERN = /^DW-[A-Z0-9-]{4,40}$/
const METRIC_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$/
const MAX_HISTORY_RANGE_DAYS = 366
const MAX_HISTORY_RAW_HOURS = 36

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function cleanText(value, fallback = '', maxLength = 120) {
  const text = String(value ?? fallback).trim()

  return text.slice(0, maxLength)
}

function normalizeNullableText(value, maxLength = 120) {
  if (value === undefined) return undefined
  if (value === null) return null

  const text = String(value).trim()

  return text ? text.slice(0, maxLength) : null
}

function normalizeCoordinate(value, min, max, label) {
  if (value === undefined || value === null || value === '') return undefined

  const numberValue = Number(value)

  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    throw httpError(400, `Invalid ${label}`)
  }

  return numberValue
}

function normalizeMapUrl(value) {
  const text = normalizeNullableText(value, MAP_URL_MAX_LENGTH)

  if (!text) return text

  if (!/^https?:\/\//i.test(text)) {
    throw httpError(400, 'Map URL must start with http:// or https://')
  }

  return text
}

function generateDeviceCode() {
  return `DW-${crypto.randomInt(1, 999999999).toString().padStart(9, '0')}`
}

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function getBangkokDayRange(dateValue) {
  return {
    fromDate: new Date(`${dateValue}T00:00:00.000+07:00`),
    toDate: new Date(`${dateValue}T23:59:59.999+07:00`),
  }
}

function parseHistoryRange(query = {}) {
  const now = new Date()
  const dateValue = query.date || query.day

  if (isDateOnly(dateValue)) {
    return getBangkokDayRange(dateValue)
  }

  const fromValue = query.from || query.start
  const toValue = query.to || query.end

  if (
    isDateOnly(fromValue) &&
    (!toValue || String(toValue) === String(fromValue))
  ) {
    return getBangkokDayRange(fromValue)
  }

  let fromDate
  let toDate

  if (isDateOnly(fromValue)) {
    fromDate = new Date(`${fromValue}T00:00:00.000+07:00`)
  } else if (fromValue) {
    fromDate = new Date(fromValue)
  } else {
    fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  }

  if (isDateOnly(toValue)) {
    toDate = new Date(`${toValue}T23:59:59.999+07:00`)
  } else if (toValue) {
    toDate = new Date(toValue)
  } else if (isDateOnly(fromValue)) {
    toDate = new Date(`${fromValue}T23:59:59.999+07:00`)
  } else {
    toDate = now
  }

  return {
    fromDate,
    toDate,
  }
}

function validateHistoryRange(fromDate, toDate) {
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw httpError(400, 'Invalid history date range')
  }

  if (fromDate > toDate) {
    throw httpError(400, 'Invalid history date range: from must be before to')
  }

  const diffDays =
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)

  if (diffDays > MAX_HISTORY_RANGE_DAYS) {
    throw httpError(
      400,
      `History range is too large. Maximum is ${MAX_HISTORY_RANGE_DAYS} days`
    )
  }
}

function normalizeMetricKey(value) {
  const metricKey = String(value || '').trim()

  if (!metricKey) return ''

  if (!METRIC_KEY_PATTERN.test(metricKey)) {
    throw httpError(400, 'Invalid metric key')
  }

  return metricKey
}

async function createUniqueDeviceCode(client) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const deviceCode = generateDeviceCode()

    const existing = await client.query(
      `
      SELECT id
      FROM devices
      WHERE device_code = $1
      LIMIT 1
      `,
      [deviceCode]
    )

    if (!existing.rows.length) return deviceCode
  }

  throw httpError(500, 'Unable to generate device code')
}

export async function listDevices(req, res) {
  const user = req.dbUser

  const result = await pool.query(
    `
    SELECT
      d.id,
      d.device_code,
      d.name,
      d.group_name,
      d.status,
      d.last_seen_at,
      d.last_ingest_at,
      d.firmware_version,
      d.latitude,
      d.longitude,
      d.map_url,
      d.model_id,
      dm.model_key,
      dm.model_name,
      dm.metric_count,

      lr.temperature,
      lr.humidity,
      lr.rssi,

      COALESCE(lm.latest_time, lr.time) AS latest_time,
      COALESCE(lm.latest_metrics, '{}'::jsonb) AS latest_metrics,
      COALESCE(metric_config.metric_configs, '[]'::jsonb) AS metric_configs

    FROM devices d
    LEFT JOIN device_models dm
      ON dm.id = d.model_id

    LEFT JOIN LATERAL (
      SELECT time, temperature, humidity, rssi
      FROM sensor_readings
      WHERE device_id = d.id
      ORDER BY time DESC
      LIMIT 1
    ) lr ON true

    LEFT JOIN LATERAL (
      SELECT
        MAX(metric_latest.time) AS latest_time,
        jsonb_object_agg(metric_latest.metric_key, metric_latest.value) AS latest_metrics
      FROM (
        SELECT DISTINCT ON (metric_key)
          metric_key,
          value,
          time
        FROM device_metric_readings
        WHERE device_id = d.id
        ORDER BY metric_key, time DESC
      ) metric_latest
    ) lm ON true

    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', dm_cfg.id,
              'metric_key', dm_cfg.metric_key,
              'source_key', dm_cfg.source_key,
              'metric_name', dm_cfg.metric_name,
              'metric_type', dm_cfg.metric_type,
              'unit', dm_cfg.unit,
              'icon', dm_cfg.icon,
              'visible', dm_cfg.visible,
              'sort_order', dm_cfg.sort_order
            )
            ORDER BY dm_cfg.sort_order ASC, dm_cfg.metric_key ASC
          ),
          '[]'::jsonb
        ) AS metric_configs
      FROM device_metrics dm_cfg
      WHERE dm_cfg.device_id = d.id
        AND dm_cfg.visible = true
    ) metric_config ON true

    WHERE d.user_id = $1
      AND d.is_active = true
    ORDER BY d.created_at DESC
    `,
    [user.id]
  )

  res.json(result.rows)
}

export async function createDevice(req, res) {
  const user = req.dbUser
  const name = cleanText(req.body.name, 'New Device', DEVICE_NAME_MAX_LENGTH)
  const modelId = Number(req.body.modelId) || 1

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const modelCheck = await client.query(
      `
      SELECT id
      FROM device_models
      WHERE id = $1
        AND is_active = true
      LIMIT 1
      `,
      [modelId]
    )

    if (!modelCheck.rows.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        message: 'Invalid device model',
      })
    }

    const deviceCode =
      env.isDevelopment && req.body.deviceCode
        ? cleanText(req.body.deviceCode, '', 50).toUpperCase()
        : await createUniqueDeviceCode(client)

    if (!DEVICE_CODE_PATTERN.test(deviceCode)) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        message: 'Invalid device code',
      })
    }

    const deviceSecret =
      env.isDevelopment && req.body.deviceSecret
        ? cleanText(req.body.deviceSecret, '', 128)
        : crypto.randomBytes(24).toString('hex')

    if (deviceSecret.length < 24) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        message: 'Device secret is too short',
      })
    }

    const secretHash = await bcrypt.hash(deviceSecret, 12)

    const deviceResult = await client.query(
      `
      INSERT INTO devices (
        user_id,
        device_code,
        name,
        secret_hash,
        model_id
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        device_code,
        name,
        model_id,
        group_name,
        latitude,
        longitude,
        map_url,
        created_at
      `,
      [user.id, deviceCode, name || 'New Device', secretHash, modelId]
    )

    const device = deviceResult.rows[0]

    await client.query(
      `
      INSERT INTO device_metrics (
        device_id,
        metric_key,
        source_key,
        metric_name,
        metric_type,
        unit,
        icon,
        visible,
        sort_order
      )
      SELECT
        $1,
        metric_key,
        metric_key,
        default_name,
        default_type,
        default_unit,
        default_icon,
        true,
        sort_order
      FROM device_model_metrics
      WHERE model_id = $2
      ORDER BY sort_order ASC
      ON CONFLICT (device_id, metric_key) DO NOTHING
      `,
      [device.id, modelId]
    )

    await client.query('COMMIT')

    res.status(201).json({
      ...device,
      deviceSecret,
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'Device code already exists',
      })
    }

    throw error
  } finally {
    client.release()
  }
}

export async function getDevice(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const result = await pool.query(
    `
    SELECT
      d.id,
      d.device_code,
      d.name,
      d.group_name,
      d.status,
      d.last_seen_at,
      d.last_ingest_at,
      d.firmware_version,
      d.latitude,
      d.longitude,
      d.map_url,
      d.model_id,
      dm.model_key,
      dm.model_name,
      dm.metric_count,

      lr.temperature,
      lr.humidity,
      lr.rssi,

      COALESCE(lm.latest_time, lr.time) AS latest_time,
      COALESCE(lm.latest_metrics, '{}'::jsonb) AS latest_metrics,
      COALESCE(metric_config.metric_configs, '[]'::jsonb) AS metric_configs

    FROM devices d
    LEFT JOIN device_models dm
      ON dm.id = d.model_id

    LEFT JOIN LATERAL (
      SELECT time, temperature, humidity, rssi
      FROM sensor_readings
      WHERE device_id = d.id
      ORDER BY time DESC
      LIMIT 1
    ) lr ON true

    LEFT JOIN LATERAL (
      SELECT
        MAX(metric_latest.time) AS latest_time,
        jsonb_object_agg(metric_latest.metric_key, metric_latest.value) AS latest_metrics
      FROM (
        SELECT DISTINCT ON (metric_key)
          metric_key,
          value,
          time
        FROM device_metric_readings
        WHERE device_id = d.id
        ORDER BY metric_key, time DESC
      ) metric_latest
    ) lm ON true

    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', dm_cfg.id,
              'metric_key', dm_cfg.metric_key,
              'source_key', dm_cfg.source_key,
              'metric_name', dm_cfg.metric_name,
              'metric_type', dm_cfg.metric_type,
              'unit', dm_cfg.unit,
              'icon', dm_cfg.icon,
              'visible', dm_cfg.visible,
              'sort_order', dm_cfg.sort_order
            )
            ORDER BY dm_cfg.sort_order ASC, dm_cfg.metric_key ASC
          ),
          '[]'::jsonb
        ) AS metric_configs
      FROM device_metrics dm_cfg
      WHERE dm_cfg.device_id = d.id
        AND dm_cfg.visible = true
    ) metric_config ON true

    WHERE d.id = $1
      AND d.user_id = $2
      AND d.is_active = true
    LIMIT 1
    `,
    [id, user.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  res.json(result.rows[0])
}

export async function updateDevice(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const name = normalizeNullableText(req.body.name, DEVICE_NAME_MAX_LENGTH)
  const groupName = normalizeNullableText(
    req.body.groupName ?? req.body.group_name,
    DEVICE_GROUP_MAX_LENGTH
  )
  const latitude = normalizeCoordinate(req.body.latitude, -90, 90, 'latitude')
  const longitude = normalizeCoordinate(
    req.body.longitude,
    -180,
    180,
    'longitude'
  )
  const mapUrl = normalizeMapUrl(req.body.mapUrl ?? req.body.map_url)

  const result = await pool.query(
    `
    UPDATE devices
    SET
      name = CASE WHEN $1::boolean THEN $2 ELSE name END,
      group_name = CASE WHEN $3::boolean THEN $4 ELSE group_name END,
      latitude = CASE WHEN $5::boolean THEN $6 ELSE latitude END,
      longitude = CASE WHEN $7::boolean THEN $8 ELSE longitude END,
      map_url = CASE WHEN $9::boolean THEN $10 ELSE map_url END
    WHERE id = $11
      AND user_id = $12
      AND is_active = true
    RETURNING
      id,
      device_code,
      name,
      group_name,
      status,
      last_seen_at,
      last_ingest_at,
      firmware_version,
      latitude,
      longitude,
      map_url,
      model_id
    `,
    [
      name !== undefined,
      name,
      groupName !== undefined,
      groupName,
      latitude !== undefined,
      latitude,
      longitude !== undefined,
      longitude,
      mapUrl !== undefined,
      mapUrl,
      id,
      user.id,
    ]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  res.json(result.rows[0])
}

export async function resetDeviceSecret(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const deviceSecret = crypto.randomBytes(24).toString('hex')
  const secretHash = await bcrypt.hash(deviceSecret, 12)

  const result = await pool.query(
    `
    UPDATE devices
    SET secret_hash = $1
    WHERE id = $2
      AND user_id = $3
      AND is_active = true
    RETURNING id, device_code, name
    `,
    [secretHash, id, user.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  res.json({
    ...result.rows[0],
    deviceSecret,
  })
}

export async function deleteDevice(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const result = await pool.query(
    `
    DELETE FROM devices
    WHERE id = $1
      AND user_id = $2
    RETURNING id
    `,
    [id, user.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  res.json({
    ok: true,
  })
}

export async function getHistory(req, res) {
  const user = req.dbUser
  const { id } = req.params
  const metricKey = normalizeMetricKey(
    req.query.metricKey ||
      req.query.metric_key ||
      req.query.metric ||
      req.query.key
  )

  const deviceCheck = await pool.query(
    `
    SELECT id
    FROM devices
    WHERE id = $1
      AND user_id = $2
      AND is_active = true
    LIMIT 1
    `,
    [id, user.id]
  )

  if (!deviceCheck.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  const { fromDate, toDate } = parseHistoryRange(req.query)

  try {
    validateHistoryRange(fromDate, toDate)
  } catch (error) {
    return res.status(error.status || 400).json({
      message: error.message,
    })
  }

  const diffHours =
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60)

  if (metricKey) {
    if (diffHours <= MAX_HISTORY_RAW_HOURS) {
      const result = await pool.query(
        `
        SELECT
          time,
          time AS bucket_time,
          metric_key,
          value,
          value AS avg_value,
          value AS min_value,
          value AS max_value,
          1 AS sample_count
        FROM device_metric_readings
        WHERE device_id = $1
          AND metric_key = $2
          AND time BETWEEN $3 AND $4
        ORDER BY time ASC
        LIMIT 5000
        `,
        [id, metricKey, fromDate, toDate]
      )

      return res.json(result.rows)
    }

    const bucketSeconds =
      diffHours <= 24 * 7 ? 60 : diffHours <= 24 * 30 ? 300 : 3600

    const result = await pool.query(
      `
      SELECT
        bucket_time AS time,
        bucket_time,
        metric_key,
        AVG(value)::double precision AS value,
        AVG(value)::double precision AS avg_value,
        MIN(value)::double precision AS min_value,
        MAX(value)::double precision AS max_value,
        COUNT(*)::integer AS sample_count
      FROM (
        SELECT
          to_timestamp(
            floor(extract(epoch from time) / $5) * $5
          ) AS bucket_time,
          metric_key,
          value
        FROM device_metric_readings
        WHERE device_id = $1
          AND metric_key = $2
          AND time BETWEEN $3 AND $4
      ) bucketed
      GROUP BY bucket_time, metric_key
      ORDER BY bucket_time ASC
      LIMIT 5000
      `,
      [id, metricKey, fromDate, toDate, bucketSeconds]
    )

    return res.json(result.rows)
  }

  const result = await pool.query(
    `
    SELECT
      latest.time,
      latest.time AS bucket_time,
      latest.metric_key,
      latest.value,
      latest.value AS avg_value,
      latest.value AS min_value,
      latest.value AS max_value,
      1 AS sample_count
    FROM (
      SELECT DISTINCT ON (metric_key)
        metric_key,
        value,
        time
      FROM device_metric_readings
      WHERE device_id = $1
        AND time BETWEEN $2 AND $3
      ORDER BY metric_key, time DESC
    ) latest
    ORDER BY latest.metric_key ASC
    `,
    [id, fromDate, toDate]
  )

  res.json(result.rows)
}
