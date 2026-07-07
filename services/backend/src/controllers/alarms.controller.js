import { pool } from '../db/pool.js'

export async function listAlarms(req, res) {
  const user = req.dbUser

  const result = await pool.query(
    `
    SELECT
      ae.id,
      ae.device_id,
      d.device_code,
      d.name AS device_name,
      d.model_id,
      model.model_key,
      model.model_name,
      ae.metric,
      COALESCE(dm.metric_name, ae.metric) AS metric_name,
      COALESCE(dm.unit, '') AS unit,
      ae.operator,
      ae.threshold,
      ae.value,
      ae.severity,
      ae.status,
      ae.triggered_at,
      ae.acknowledged_at
    FROM alarm_events ae
    LEFT JOIN devices d
      ON d.id = ae.device_id
    LEFT JOIN device_models model
      ON model.id = d.model_id
    LEFT JOIN device_metrics dm
      ON dm.device_id = ae.device_id
      AND dm.metric_key = ae.metric
    WHERE ae.user_id = $1
    ORDER BY ae.triggered_at DESC
    LIMIT 100
    `,
    [user.id]
  )

  res.json(result.rows)
}

export async function listActiveAlarms(req, res) {
  const user = req.dbUser

  const result = await pool.query(
    `
    SELECT
      ast.id,
      ast.user_id,
      ast.device_id,
      d.device_code,
      d.name AS device_name,
      d.model_id,
      model.model_key,
      model.model_name,
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
    LEFT JOIN devices d
      ON d.id = ast.device_id
    LEFT JOIN device_models model
      ON model.id = d.model_id
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
    LIMIT 100
    `,
    [user.id]
  )

  res.json(result.rows)
}

export async function getAlarmSummary(req, res) {
  const user = req.dbUser

  const stateResult = await pool.query(
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

  const eventResult = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active_events,
      COUNT(*) FILTER (WHERE status = 'acknowledged')::int AS acknowledged_events,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_events
    FROM alarm_events
    WHERE user_id = $1
    `,
    [user.id]
  )

  res.json({
    active: stateResult.rows[0]?.active || 0,
    warning: stateResult.rows[0]?.warning || 0,
    critical: stateResult.rows[0]?.critical || 0,
    total_events: eventResult.rows[0]?.total_events || 0,
    active_events: eventResult.rows[0]?.active_events || 0,
    acknowledged_events: eventResult.rows[0]?.acknowledged_events || 0,
    resolved_events: eventResult.rows[0]?.resolved_events || 0,
  })
}

export async function acknowledgeAlarm(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const result = await pool.query(
    `
    UPDATE alarm_events
    SET
      status = 'acknowledged',
      acknowledged_at = now()
    WHERE id = $1
      AND user_id = $2
    RETURNING *
    `,
    [id, user.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Alarm not found',
    })
  }

  res.json(result.rows[0])
}
