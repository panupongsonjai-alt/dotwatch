import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'

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
      COALESCE(lm.latest_metrics, '{}'::jsonb) AS latest_metrics

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

    WHERE d.user_id = $1
    ORDER BY d.created_at DESC
    `,
    [user.id]
  )

  res.json(result.rows)
}

export async function createDevice(req, res) {
  const user = req.dbUser

  const name = req.body.name || 'New Device'
  const modelId = Number(req.body.modelId) || 1

  const deviceCode =
    req.body.deviceCode ||
    `DW-${crypto.randomInt(1, 999999).toString().padStart(6, '0')}`

  const deviceSecret =
    req.body.deviceSecret || crypto.randomBytes(18).toString('hex')

  const secretHash = await bcrypt.hash(deviceSecret, 10)

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
      [user.id, deviceCode, name, secretHash, modelId]
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
    await client.query('ROLLBACK')
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
      COALESCE(lm.latest_metrics, '{}'::jsonb) AS latest_metrics

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

    WHERE d.id = $1
      AND d.user_id = $2
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

  const { name, groupName, latitude, longitude, mapUrl } = req.body

  const result = await pool.query(
    `
    UPDATE devices
    SET
      name = COALESCE($1, name),
      group_name = COALESCE($2, group_name),
      latitude = COALESCE($3, latitude),
      longitude = COALESCE($4, longitude),
      map_url = COALESCE($5, map_url)
    WHERE id = $6
      AND user_id = $7
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
      name ?? null,
      groupName ?? null,
      latitude ?? null,
      longitude ?? null,
      mapUrl ?? null,
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

  const deviceSecret = crypto.randomBytes(18).toString('hex')
  const secretHash = await bcrypt.hash(deviceSecret, 10)

  const result = await pool.query(
    `
    UPDATE devices
    SET secret_hash = $1
    WHERE id = $2
      AND user_id = $3
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
  const metricKey = req.query.metricKey || req.query.metric_key

  const deviceCheck = await pool.query(
    `
    SELECT id
    FROM devices
    WHERE id = $1
      AND user_id = $2
    LIMIT 1
    `,
    [id, user.id]
  )

  if (!deviceCheck.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  const now = new Date()

  const fromDate = req.query.from
    ? new Date(req.query.from)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const toDate = req.query.to ? new Date(req.query.to) : now

  if (metricKey) {
    const result = await pool.query(
      `
      SELECT
        time AS bucket_time,
        metric_key,
        value,
        value AS avg_value,
        value AS min_value,
        value AS max_value
      FROM device_metric_readings
      WHERE device_id = $1
        AND metric_key = $2
        AND time BETWEEN $3 AND $4
      ORDER BY time ASC
      LIMIT 1000
      `,
      [id, metricKey, fromDate, toDate]
    )

    return res.json(result.rows)
  }

  const diffDays =
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)

  let query

  if (diffDays <= 1) {
    query = `
      SELECT
        time AS bucket_time,
        temperature AS avg_temperature,
        temperature AS min_temperature,
        temperature AS max_temperature,
        humidity AS avg_humidity,
        humidity AS min_humidity,
        humidity AS max_humidity
      FROM sensor_readings
      WHERE device_id = $1
        AND time BETWEEN $2 AND $3
      ORDER BY time ASC
      LIMIT 288
    `
  } else if (diffDays <= 30) {
    query = `
      SELECT
        bucket AS bucket_time,
        avg_temperature,
        min_temperature,
        max_temperature,
        avg_humidity,
        min_humidity,
        max_humidity
      FROM sensor_readings_1m
      WHERE device_id = $1
        AND bucket BETWEEN $2 AND $3
      ORDER BY bucket ASC
      LIMIT 500
    `
  } else {
    query = `
      SELECT
        bucket AS bucket_time,
        avg_temperature,
        min_temperature,
        max_temperature,
        avg_humidity,
        min_humidity,
        max_humidity
      FROM sensor_readings_1h
      WHERE device_id = $1
        AND bucket BETWEEN $2 AND $3
      ORDER BY bucket ASC
      LIMIT 500
    `
  }

  const result = await pool.query(query, [id, fromDate, toDate])

  res.json(result.rows)
}
