import { pool } from '../db/pool.js'

const MAX_DEVICE_METRICS = 64
const METRIC_NAME_MAX_LENGTH = 80
const METRIC_UNIT_MAX_LENGTH = 24
const METRIC_ICON_MAX_LENGTH = 40
const METRIC_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

const FALLBACK_METRICS = [
  {
    metric_key: 'metric_1',
    metric_name: 'Name-01',
    metric_type: 'custom',
    unit: '',
    icon: 'Activity',
    visible: true,
    sort_order: 1,
  },
  {
    metric_key: 'metric_2',
    metric_name: 'Name-02',
    metric_type: 'custom',
    unit: '',
    icon: 'Activity',
    visible: true,
    sort_order: 2,
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
      RETURNING id
      `,
      [deviceId, model.model_id]
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
        sort_order
      )
      VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8)
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
      ]
    )
  }
}

async function getMetrics(deviceId) {
  const result = await pool.query(
    `
    SELECT
      id,
      device_id,
      metric_key,
      source_key,
      metric_name,
      metric_type,
      unit,
      icon,
      visible,
      sort_order,
      created_at,
      updated_at
    FROM device_metrics
    WHERE device_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [deviceId]
  )

  return result.rows
}

export async function listDeviceMetrics(req, res) {
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

    res.json(metrics)
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
  const client = await pool.connect()

  try {
    const userId = req.dbUser?.id
    const deviceId = Number(req.params.deviceId)
    const metrics = Array.isArray(req.body?.metrics) ? req.body.metrics : []

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

    let cleaned

    try {
      cleaned = metrics.map(cleanMetric).filter(Boolean)
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
          sort_order
        )
        VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8)
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
        ]
      )
    }

    await client.query('COMMIT')

    const result = await getMetrics(deviceId)
    res.json(result)
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
    res.json(result)
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
