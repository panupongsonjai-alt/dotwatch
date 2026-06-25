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
  const metricKey =
    req.query.metricKey ||
    req.query.metric_key ||
    req.query.metric ||
    req.query.key

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

  const { fromDate, toDate } = parseHistoryRange(req.query)

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({
      message: 'Invalid history date range',
    })
  }

  if (fromDate > toDate) {
    return res.status(400).json({
      message: 'Invalid history date range: from must be before to',
    })
  }

  const diffHours =
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60)

  if (metricKey) {
    if (diffHours <= 36) {
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
