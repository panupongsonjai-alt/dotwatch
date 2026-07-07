import { pool } from '../db/pool.js'

function parseLimit(value, fallback = 50) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(Math.max(Math.floor(numberValue), 1), 200)
}

export async function listActiveAlarms(req, res) {
  const user = req.dbUser
  const limit = parseLimit(req.query.limit, 50)

  const result = await pool.query(
    `
    SELECT
      ast.id,
      ast.user_id,
      ast.device_id,
      d.device_code,
      d.name AS device_name,
      ast.metric,
      COALESCE(dm.metric_name, ast.metric) AS metric_name,
      COALESCE(dm.unit, '') AS unit,
      ast.state,
      ast.severity,
      ast.rule_id,
      ast.operator,
      ast.threshold,
      ast.current_value,
      ast.triggered_at,
      ast.recovered_at,
      ast.updated_at
    FROM alarm_states ast
    JOIN devices d
      ON d.id = ast.device_id
    LEFT JOIN device_metrics dm
      ON dm.device_id = ast.device_id
      AND dm.metric_key = ast.metric
    WHERE ast.user_id = $1
      AND ast.state <> 'normal'
    ORDER BY
      CASE
        WHEN ast.state = 'critical' THEN 1
        WHEN ast.state = 'warning' THEN 2
        ELSE 3
      END,
      ast.updated_at DESC
    LIMIT $2
    `,
    [user.id, limit]
  )

  res.json(result.rows)
}

export async function listAlarmHistory(req, res) {
  const user = req.dbUser
  const limit = parseLimit(req.query.limit, 100)

  const result = await pool.query(
    `
    SELECT
      ae.id,
      ae.user_id,
      ae.device_id,
      d.device_code,
      d.name AS device_name,
      ae.rule_id,
      ae.metric,
      COALESCE(dm.metric_name, ae.metric) AS metric_name,
      COALESCE(dm.unit, '') AS unit,
      ae.operator,
      ae.threshold,
      ae.value,
      ae.severity,
      ae.status,
      ae.triggered_at,
      ae.acknowledged_at,
      ae.resolved_at
    FROM alarm_events ae
    JOIN devices d
      ON d.id = ae.device_id
    LEFT JOIN device_metrics dm
      ON dm.device_id = ae.device_id
      AND dm.metric_key = ae.metric
    WHERE ae.user_id = $1
    ORDER BY ae.triggered_at DESC
    LIMIT $2
    `,
    [user.id, limit]
  )

  res.json(result.rows)
}

export async function getAlarmSummary(req, res) {
  const user = req.dbUser

  const result = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE state = 'critical')::int AS critical,
      COUNT(*) FILTER (WHERE state = 'warning')::int AS warning,
      COUNT(*) FILTER (WHERE state <> 'normal')::int AS active
    FROM alarm_states
    WHERE user_id = $1
    `,
    [user.id]
  )

  const historyResult = await pool.query(
    `
    SELECT COUNT(*)::int AS total_events
    FROM alarm_events
    WHERE user_id = $1
    `,
    [user.id]
  )

  res.json({
    critical: result.rows[0]?.critical || 0,
    warning: result.rows[0]?.warning || 0,
    active: result.rows[0]?.active || 0,
    total_events: historyResult.rows[0]?.total_events || 0,
  })
}
