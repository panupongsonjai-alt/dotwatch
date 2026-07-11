import { pool } from '../db/pool.js'
import { ensureDeviceMetricSettingsSchema } from '../services/schemaCompatibility.service.js'

const MAX_DEVICE_METRICS = 64
const METRIC_NAME_MAX_LENGTH = 80
const METRIC_UNIT_MAX_LENGTH = 24
const METRIC_ICON_MAX_LENGTH = 40
const METRIC_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const ALLOWED_RECORD_INTERVAL_SECONDS = new Set([10, 30, 60, 300, 600, 1800, 3600])
const DEFAULT_RECORD_INTERVAL_SECONDS = 10
const DEFAULT_DECIMAL_PLACES = 2

const FALLBACK_METRICS = [
  {
    metric_key: 'metric_1',
    metric_name: 'Name-01',
    metric_type: 'custom',
    unit: '',
    icon: 'Activity',
    visible: true,
    sort_order: 1,
    decimal_places: DEFAULT_DECIMAL_PLACES,
  },
  {
    metric_key: 'metric_2',
    metric_name: 'Name-02',
    metric_type: 'custom',
    unit: '',
    icon: 'Activity',
    visible: true,
    sort_order: 2,
    decimal_places: DEFAULT_DECIMAL_PLACES,
  },
]

function normalizeMetricKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeMetricType(value = '') {
  const type = normalizeMetricKey(value)

  return type || 'custom'
}

function isEsp32Dht3Model(model = {}) {
  return String(model.model_key || '').trim().toLowerCase() === 'esp32_dht3'
}

function isWifiRssiMetric(metric = {}) {
  const metricKey = String(metric.metric_key || metric.key || '')
    .trim()
    .toLowerCase()
  const metricName = String(metric.metric_name || metric.name || '')
    .trim()
    .toLowerCase()
  const metricType = String(metric.metric_type || metric.type || '')
    .trim()
    .toLowerCase()
  const unit = String(metric.unit || '').trim().toLowerCase()
  const icon = String(metric.icon || '').trim().toLowerCase()

  return (
    metricKey === 'rssi' ||
    metricKey === 'wifi_rssi' ||
    metricName.includes('wifi rssi') ||
    metricName === 'rssi' ||
    (metricType === 'signal' && unit === 'dbm') ||
    (icon === 'wifi' && unit === 'dbm')
  )
}

function cleanText(value = '', maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength)
}

function cleanMetric(metric, index) {
  const metricName = cleanText(
    metric.metric_name || metric.name || '',
    METRIC_NAME_MAX_LENGTH
  )
  const metricKey = normalizeMetricKey(
    metric.metric_key || metric.key || metricName
  )

  if (!metricName) {
    return null
  }

  if (!metricKey || !METRIC_KEY_PATTERN.test(metricKey)) {
    throw new Error('Invalid metric key')
  }

  return {
    metric_key: metricKey,
    metric_name: metricName,
    metric_type: normalizeMetricType(
      metric.metric_type || metric.type || metricName || ''
    ),
    unit: cleanText(metric.unit || '', METRIC_UNIT_MAX_LENGTH),
    icon: cleanText(metric.icon || 'Activity', METRIC_ICON_MAX_LENGTH),
    visible: metric.visible !== false,
    sort_order: Number.isFinite(Number(metric.sort_order))
      ? Number(metric.sort_order)
      : index + 1,
    decimal_places: Number.isInteger(Number(metric.decimal_places))
      ? Math.min(6, Math.max(0, Number(metric.decimal_places)))
      : DEFAULT_DECIMAL_PLACES,
  }
}

async function ensureDeviceOwner(deviceId, userId) {
  if (!userId) return false

  const result = await pool.query(
    `
    SELECT id
    FROM devices
    WHERE id = $1
      AND user_id = $2
      AND is_active = true
    `,
    [deviceId, userId]
  )

  return result.rowCount > 0
}

async function getDeviceModel(deviceId) {
  const result = await pool.query(
    `
    SELECT
      d.id AS device_id,
      d.model_id,
      dm.model_key,
      dm.model_name,
      dm.metric_count
    FROM devices d
    LEFT JOIN device_models dm
      ON dm.id = d.model_id
    WHERE d.id = $1
      AND d.is_active = true
    LIMIT 1
    `,
    [deviceId]
  )

  return result.rows[0] || null
}

async function insertModelMetrics(client, deviceId) {
  const model = await getDeviceModel(deviceId)

  if (model?.model_id) {
    const result = await client.query(
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
        sort_order,
        decimal_places
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
        sort_order,
        2
      FROM device_model_metrics
      WHERE model_id = $2
        AND ($3::text IS NULL OR metric_key <> $3)
      ORDER BY sort_order ASC
      ON CONFLICT (device_id, metric_key) DO NOTHING
      RETURNING id
      `,
      [
        deviceId,
        model.model_id,
        isEsp32Dht3Model(model) ? 'metric_3' : null,
      ]
    )

    if (result.rowCount > 0) {
      return
    }
  }

  for (const metric of FALLBACK_METRICS) {
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
        sort_order,
        decimal_places
      )
      VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (device_id, metric_key) DO NOTHING
      `,
      [
        deviceId,
        metric.metric_key,
        metric.metric_name,
        metric.metric_type,
        metric.unit,
        metric.icon,
        metric.visible,
        metric.sort_order,
        metric.decimal_places,
      ]
    )
  }
}

async function getMetrics(deviceId) {
  const result = await pool.query(
    `
    SELECT
      dm_cfg.id,
      dm_cfg.device_id,
      dm_cfg.metric_key,
      dm_cfg.source_key,
      dm_cfg.metric_name,
      dm_cfg.metric_type,
      dm_cfg.unit,
      dm_cfg.icon,
      dm_cfg.visible,
      dm_cfg.sort_order,
      dm_cfg.decimal_places,
      dm_cfg.created_at,
      dm_cfg.updated_at
    FROM device_metrics dm_cfg
    JOIN devices d
      ON d.id = dm_cfg.device_id
    LEFT JOIN device_models dm
      ON dm.id = d.model_id
    WHERE dm_cfg.device_id = $1
      AND NOT (
        COALESCE(dm.model_key, '') = 'esp32_dht3'
        AND (
          dm_cfg.metric_key = 'metric_3'
          OR lower(COALESCE(dm_cfg.metric_name, '')) LIKE '%rssi%'
          OR (
            lower(COALESCE(dm_cfg.metric_type, '')) = 'signal'
            AND lower(COALESCE(dm_cfg.unit, '')) = 'dbm'
          )
        )
      )
    ORDER BY dm_cfg.sort_order ASC, dm_cfg.id ASC
    `,
    [deviceId]
  )

  return result.rows
}

async function getMetricSettings(deviceId, client = pool) {
  const result = await client.query(
    `
    SELECT record_interval_seconds
    FROM devices
    WHERE id = $1
    LIMIT 1
    `,
    [deviceId]
  )

  return {
    record_interval_seconds: Number(
      result.rows[0]?.record_interval_seconds || DEFAULT_RECORD_INTERVAL_SECONDS
    ),
  }
}

function hasRecordIntervalSetting(payload = {}) {
  return (
    payload.record_interval_seconds !== undefined ||
    payload.recordIntervalSeconds !== undefined
  )
}

function normalizeMetricSettings(payload = {}) {
  const recordIntervalSeconds = Number(
    payload.record_interval_seconds ?? payload.recordIntervalSeconds
  )

  if (!ALLOWED_RECORD_INTERVAL_SECONDS.has(recordIntervalSeconds)) {
    throw new Error('Invalid record interval')
  }

  return {
    record_interval_seconds: recordIntervalSeconds,
  }
}

export async function getDeviceRecordSettings(req, res) {
  await ensureDeviceMetricSettingsSchema()

  const userId = req.dbUser?.id
  const deviceId = Number(req.params.deviceId)

  if (!Number.isInteger(deviceId)) {
    return res.status(400).json({
      message: 'Invalid device id',
    })
  }

  const allowed = await ensureDeviceOwner(deviceId, userId)

  if (!allowed) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  const result = await pool.query(
    `
    SELECT
      id AS device_id,
      device_code,
      name AS device_name,
      record_interval_seconds,
      last_recorded_at
    FROM devices
    WHERE id = $1
    LIMIT 1
    `,
    [deviceId]
  )

  const row = result.rows[0]

  res.json({
    device_id: row.device_id,
    device_code: row.device_code,
    device_name: row.device_name,
    record_interval_seconds: Number(
      row.record_interval_seconds || DEFAULT_RECORD_INTERVAL_SECONDS
    ),
    last_recorded_at: row.last_recorded_at || null,
  })
}

export async function updateDeviceRecordSettings(req, res) {
  await ensureDeviceMetricSettingsSchema()

  const userId = req.dbUser?.id
  const deviceId = Number(req.params.deviceId)

  if (!Number.isInteger(deviceId)) {
    return res.status(400).json({
      message: 'Invalid device id',
    })
  }

  const allowed = await ensureDeviceOwner(deviceId, userId)

  if (!allowed) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  let settings

  try {
    settings = normalizeMetricSettings(req.body || {})
  } catch {
    return res.status(400).json({
      message: 'Invalid record interval',
    })
  }

  const result = await pool.query(
    `
    UPDATE devices
    SET
      record_interval_seconds = $2,
      last_recorded_at = NULL
    WHERE id = $1
    RETURNING
      id AS device_id,
      device_code,
      name AS device_name,
      record_interval_seconds,
      last_recorded_at
    `,
    [deviceId, settings.record_interval_seconds]
  )

  const row = result.rows[0]

  res.json({
    ok: true,
    device_id: row.device_id,
    device_code: row.device_code,
    device_name: row.device_name,
    record_interval_seconds: Number(row.record_interval_seconds),
    last_recorded_at: row.last_recorded_at || null,
  })
}

export async function listDeviceMetrics(req, res) {
  await ensureDeviceMetricSettingsSchema()
  const client = await pool.connect()

  try {
    const userId = req.dbUser?.id
    const deviceId = Number(req.params.deviceId)

    if (!Number.isInteger(deviceId)) {
      return res.status(400).json({
        message: 'Invalid device id',
      })
    }

    const allowed = await ensureDeviceOwner(deviceId, userId)

    if (!allowed) {
      return res.status(404).json({
        message: 'Device not found',
      })
    }

    let metrics = await getMetrics(deviceId)

    if (metrics.length === 0) {
      await client.query('BEGIN')
      await insertModelMetrics(client, deviceId)
      await client.query('COMMIT')

      metrics = await getMetrics(deviceId)
    }

    const settings = await getMetricSettings(deviceId, client)

    res.json({ metrics, settings })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('listDeviceMetrics error:', error)

    res.status(500).json({
      message: 'Failed to load device metrics',
    })
  } finally {
    client.release()
  }
}

export async function saveDeviceMetrics(req, res) {
  await ensureDeviceMetricSettingsSchema()
  const client = await pool.connect()

  try {
    const userId = req.dbUser?.id
    const deviceId = Number(req.params.deviceId)
    const metrics = Array.isArray(req.body?.metrics) ? req.body.metrics : []
    const settingsPayload = req.body?.settings || null
    let settings = null

    if (settingsPayload && hasRecordIntervalSetting(settingsPayload)) {
      try {
        settings = normalizeMetricSettings(settingsPayload)
      } catch {
        return res.status(400).json({
          message: 'Invalid record interval',
        })
      }
    }

    if (!Number.isInteger(deviceId)) {
      return res.status(400).json({
        message: 'Invalid device id',
      })
    }

    if (metrics.length > MAX_DEVICE_METRICS) {
      return res.status(400).json({
        message: `Too many metrics. Maximum is ${MAX_DEVICE_METRICS}`,
      })
    }

    const allowed = await ensureDeviceOwner(deviceId, userId)

    if (!allowed) {
      return res.status(404).json({
        message: 'Device not found',
      })
    }

    const model = await getDeviceModel(deviceId)
    let cleaned

    try {
      cleaned = metrics.map(cleanMetric).filter(Boolean)

      if (isEsp32Dht3Model(model)) {
        cleaned = cleaned.filter(
          (metric) => metric.metric_key !== 'metric_3' && !isWifiRssiMetric(metric)
        )
      }
    } catch {
      return res.status(400).json({
        message: 'Invalid metric config',
      })
    }

    const seen = new Set()

    for (const metric of cleaned) {
      if (seen.has(metric.metric_key)) {
        return res.status(400).json({
          message: `Duplicate metric name: ${metric.metric_name}`,
        })
      }

      seen.add(metric.metric_key)
    }

    await client.query('BEGIN')

    await client.query(
      `
      DELETE FROM device_metrics
      WHERE device_id = $1
      `,
      [deviceId]
    )

    for (const metric of cleaned) {
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
          sort_order,
          decimal_places
        )
        VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          deviceId,
          metric.metric_key,
          metric.metric_name,
          metric.metric_type,
          metric.unit,
          metric.icon,
          metric.visible,
          metric.sort_order,
          metric.decimal_places,
        ]
      )
    }

    if (settings) {
      await client.query(
        `
        UPDATE devices
        SET
          record_interval_seconds = $2,
          last_recorded_at = NULL
        WHERE id = $1
        `,
        [deviceId, settings.record_interval_seconds]
      )
    }

    await client.query('COMMIT')

    const result = await getMetrics(deviceId)
    const savedSettings = await getMetricSettings(deviceId)
    res.json({ metrics: result, settings: savedSettings })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('saveDeviceMetrics error:', error)

    res.status(500).json({
      message: 'Failed to save device metrics',
    })
  } finally {
    client.release()
  }
}

export async function resetDeviceMetrics(req, res) {
  await ensureDeviceMetricSettingsSchema()
  const client = await pool.connect()

  try {
    const userId = req.dbUser?.id
    const deviceId = Number(req.params.deviceId)

    if (!Number.isInteger(deviceId)) {
      return res.status(400).json({
        message: 'Invalid device id',
      })
    }

    const allowed = await ensureDeviceOwner(deviceId, userId)

    if (!allowed) {
      return res.status(404).json({
        message: 'Device not found',
      })
    }

    await client.query('BEGIN')

    await client.query(
      `
      DELETE FROM device_metrics
      WHERE device_id = $1
      `,
      [deviceId]
    )

    await insertModelMetrics(client, deviceId)

    await client.query('COMMIT')

    const result = await getMetrics(deviceId)
    const settings = await getMetricSettings(deviceId)
    res.json({ metrics: result, settings })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('resetDeviceMetrics error:', error)

    res.status(500).json({
      message: 'Failed to reset device metrics',
    })
  } finally {
    client.release()
  }
}

export async function deleteDeviceMetric(req, res) {
  await ensureDeviceMetricSettingsSchema()
  try {
    const userId = req.dbUser?.id
    const deviceId = Number(req.params.deviceId)
    const metricId = Number(req.params.metricId)

    if (!Number.isInteger(deviceId) || !Number.isInteger(metricId)) {
      return res.status(400).json({
        message: 'Invalid id',
      })
    }

    const allowed = await ensureDeviceOwner(deviceId, userId)

    if (!allowed) {
      return res.status(404).json({
        message: 'Device not found',
      })
    }

    const result = await pool.query(
      `
      DELETE FROM device_metrics
      WHERE id = $1
        AND device_id = $2
      RETURNING id
      `,
      [metricId, deviceId]
    )

    if (!result.rows.length) {
      return res.status(404).json({
        message: 'Metric not found',
      })
    }

    res.json({
      ok: true,
    })
  } catch (error) {
    console.error('deleteDeviceMetric error:', error)

    res.status(500).json({
      message: 'Failed to delete metric',
    })
  }
}
