import { pool } from '../db/pool.js'

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/
let notificationDeletionSchemaPromise = null

function parseDateBoundary(value, endOfDay = false) {
  if (!value) return null
  if (!DATE_INPUT_PATTERN.test(String(value))) return new Date(Number.NaN)

  return new Date(
    `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+07:00`
  )
}

function parseOptionalDeviceId(value) {
  if (value == null || value === '' || value === 'all') return null

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN
}

function normalizeOptionalMetric(value) {
  if (value == null || value === '' || value === 'all') return ''
  return String(value).trim().slice(0, 128)
}

async function ensureNotificationDeletionSchema() {
  if (!notificationDeletionSchemaPromise) {
    notificationDeletionSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notification_feed_deletions (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          notification_key TEXT NOT NULL,
          deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (user_id, notification_key)
        )
      `)

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_notification_feed_deletions_user_time
        ON notification_feed_deletions(user_id, deleted_at DESC)
      `)
    })().catch((error) => {
      notificationDeletionSchemaPromise = null
      throw error
    })
  }

  return notificationDeletionSchemaPromise
}

function getAlarmEventDeleteFilter(req) {
  const deviceId = parseOptionalDeviceId(req.query.deviceId)
  const metric = normalizeOptionalMetric(req.query.metric)
  const fromDate = parseDateBoundary(req.query.from)
  const toDate = parseDateBoundary(req.query.to, true)

  if (Number.isNaN(deviceId)) {
    return { error: 'Invalid deviceId' }
  }

  if (fromDate && Number.isNaN(fromDate.getTime())) {
    return { error: 'Invalid from date. Expected YYYY-MM-DD.' }
  }

  if (toDate && Number.isNaN(toDate.getTime())) {
    return { error: 'Invalid to date. Expected YYYY-MM-DD.' }
  }

  if (fromDate && toDate && fromDate > toDate) {
    return { error: 'Invalid date range: from must be before to.' }
  }

  return { deviceId, metric, fromDate, toDate }
}

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
      ae.notification_message,
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
      ar.notification_message,
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
    LEFT JOIN alarm_rules ar
      ON ar.id = ast.rule_id
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


export async function clearAlarmEvents(req, res) {
  const user = req.dbUser
  const filter = getAlarmEventDeleteFilter(req)

  if (filter.error) {
    return res.status(400).json({ message: filter.error })
  }

  const values = [user.id]
  const conditions = ['ae.user_id = $1']

  if (filter.deviceId) {
    values.push(filter.deviceId)
    conditions.push(`ae.device_id = $${values.length}`)
  }

  if (filter.metric) {
    values.push(filter.metric)
    conditions.push(`ae.metric = $${values.length}`)
  }

  if (filter.fromDate) {
    values.push(filter.fromDate)
    conditions.push(`ae.triggered_at >= $${values.length}`)
  }

  if (filter.toDate) {
    values.push(filter.toDate)
    conditions.push(`ae.triggered_at <= $${values.length}`)
  }

  const result = await pool.query(
    `
    DELETE FROM alarm_events ae
    WHERE ${conditions.join('\n      AND ')}
    RETURNING ae.id
    `,
    values
  )

  res.json({
    ok: true,
    deletedCount: result.rowCount,
  })
}

export async function listNotificationFeedDeletions(req, res) {
  const user = req.dbUser
  await ensureNotificationDeletionSchema()

  const result = await pool.query(
    `
    SELECT notification_key
    FROM notification_feed_deletions
    WHERE user_id = $1
    ORDER BY deleted_at DESC
    LIMIT 5000
    `,
    [user.id]
  )

  res.json({
    keys: result.rows.map((row) => row.notification_key),
  })
}

export async function clearNotificationFeed(req, res) {
  const user = req.dbUser
  await ensureNotificationDeletionSchema()

  const rawKeys = Array.isArray(req.body?.keys) ? req.body.keys : []
  const keys = Array.from(
    new Set(
      rawKeys
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .map((value) => value.slice(0, 300))
    )
  )

  if (!keys.length) {
    return res.status(400).json({
      message: 'At least one notification key is required.',
    })
  }

  if (keys.length > 1000) {
    return res.status(400).json({
      message: 'Too many notifications selected. Maximum is 1000.',
    })
  }

  await pool.query(
    `
    DELETE FROM notification_feed_deletions
    WHERE user_id = $1
      AND deleted_at < NOW() - INTERVAL '365 days'
    `,
    [user.id]
  )

  const result = await pool.query(
    `
    INSERT INTO notification_feed_deletions (
      user_id,
      notification_key,
      deleted_at
    )
    SELECT
      $1,
      selected.notification_key,
      NOW()
    FROM UNNEST($2::text[]) AS selected(notification_key)
    ON CONFLICT (user_id, notification_key)
    DO UPDATE SET deleted_at = EXCLUDED.deleted_at
    RETURNING notification_key
    `,
    [user.id, keys]
  )

  res.json({
    ok: true,
    deletedCount: result.rowCount,
    keys: result.rows.map((row) => row.notification_key),
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
