import { pool } from '../db/pool.js'

export async function listAlarmRules(req, res) {
  const user = req.dbUser
  if (!user?.id) {
    return res.status(401).json({
      message: 'User not loaded',
    })
  }

  const result = await pool.query(
    `
    SELECT
      ar.id,
      ar.user_id,
      ar.device_id,
      d.device_code,
      d.name AS device_name,
      d.model_id,
      model.model_key,
      model.model_name,
      ar.metric,
      COALESCE(dm.metric_name, ar.metric) AS metric_name,
      COALESCE(dm.unit, '') AS unit,
      ar.operator,
      ar.threshold,
      ar.severity,
      ar.is_active,
      ar.created_at
    FROM alarm_rules ar
    LEFT JOIN devices d
      ON d.id = ar.device_id
    LEFT JOIN device_models model
      ON model.id = d.model_id
    LEFT JOIN device_metrics dm
      ON dm.device_id = ar.device_id
      AND dm.metric_key = ar.metric
    WHERE ar.user_id = $1
    ORDER BY ar.created_at DESC
    `,
    [user.id]
  )

  res.json(result.rows)
}

export async function createAlarmRule(req, res) {
  const user = req.dbUser

  if (!user?.id) {
    return res.status(401).json({
      message: 'User not loaded',
    })
  }

  const { device_id, metric, metric_key, operator, threshold, severity } =
    req.body

  const selectedMetric = metric_key || metric

  if (!device_id) {
    return res.status(400).json({
      message: 'Device is required',
    })
  }

  if (!selectedMetric) {
    return res.status(400).json({
      message: 'Metric is required',
    })
  }

  if (!['>', '>=', '<', '<=', '='].includes(operator)) {
    return res.status(400).json({
      message: 'Invalid operator',
    })
  }

  if (threshold === '' || Number.isNaN(Number(threshold))) {
    return res.status(400).json({
      message: 'Invalid threshold',
    })
  }

  const deviceCheck = await pool.query(
    `
    SELECT id
    FROM devices
    WHERE id = $1
      AND user_id = $2
      AND is_active = true
    LIMIT 1
    `,
    [device_id, user.id]
  )

  if (!deviceCheck.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  const metricCheck = await pool.query(
    `
    SELECT metric_key
    FROM device_metrics
    WHERE device_id = $1
      AND metric_key = $2
    LIMIT 1
    `,
    [device_id, selectedMetric]
  )

  if (!metricCheck.rows.length) {
    return res.status(400).json({
      message: 'Metric not found for this device',
    })
  }

  const result = await pool.query(
    `
    INSERT INTO alarm_rules (
      user_id,
      device_id,
      metric,
      operator,
      threshold,
      severity,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, true)
    RETURNING *
    `,
    [
      user.id,
      device_id,
      selectedMetric,
      operator,
      Number(threshold),
      severity || 'warning',
    ]
  )

  res.status(201).json(result.rows[0])
}

export async function updateAlarmRule(req, res) {
  const user = req.dbUser
  if (!user?.id) {
    return res.status(401).json({
      message: 'User not loaded',
    })
  }

  const { id } = req.params

  const {
    device_id,
    metric,
    metric_key,
    operator,
    threshold,
    severity,
    is_active,
  } = req.body

  const selectedMetric = metric_key || metric

  if (!device_id) {
    return res.status(400).json({
      message: 'Device is required',
    })
  }

  if (!selectedMetric) {
    return res.status(400).json({
      message: 'Metric is required',
    })
  }

  if (!['>', '>=', '<', '<=', '='].includes(operator)) {
    return res.status(400).json({
      message: 'Invalid operator',
    })
  }

  if (threshold === '' || Number.isNaN(Number(threshold))) {
    return res.status(400).json({
      message: 'Invalid threshold',
    })
  }

  const deviceCheck = await pool.query(
    `
    SELECT id
    FROM devices
    WHERE id = $1
      AND user_id = $2
      AND is_active = true
    LIMIT 1
    `,
    [device_id, user.id]
  )

  if (!deviceCheck.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  const metricCheck = await pool.query(
    `
    SELECT metric_key
    FROM device_metrics
    WHERE device_id = $1
      AND metric_key = $2
    LIMIT 1
    `,
    [device_id, selectedMetric]
  )

  if (!metricCheck.rows.length) {
    return res.status(400).json({
      message: 'Metric not found for this device',
    })
  }

  const result = await pool.query(
    `
    UPDATE alarm_rules
    SET
      device_id = $1,
      metric = $2,
      operator = $3,
      threshold = $4,
      severity = $5,
      is_active = COALESCE($6, is_active)
    WHERE id = $7
      AND user_id = $8
    RETURNING *
    `,
    [
      device_id,
      selectedMetric,
      operator,
      Number(threshold),
      severity || 'warning',
      typeof is_active === 'boolean' ? is_active : null,
      id,
      user.id,
    ]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Rule not found',
    })
  }

  res.json(result.rows[0])
}

export async function deleteAlarmRule(req, res) {
  const user = req.dbUser
  if (!user?.id) {
    return res.status(401).json({
      message: 'User not loaded',
    })
  }
  const { id } = req.params

  const result = await pool.query(
    `
    DELETE FROM alarm_rules
    WHERE id = $1
      AND user_id = $2
    RETURNING id
    `,
    [id, user.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Rule not found',
    })
  }

  res.json({
    ok: true,
  })
}
