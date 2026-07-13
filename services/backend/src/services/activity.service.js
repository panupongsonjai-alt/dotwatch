import { pool } from '../db/pool.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function normalizeLimit(limit) {
  const nextLimit = Number(limit || DEFAULT_LIMIT)
  if (!Number.isFinite(nextLimit)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(nextLimit), 1), MAX_LIMIT)
}

function normalizeSeverity(severity = 'info') {
  const value = String(severity || 'info').toLowerCase()
  if (['info', 'success', 'warning', 'danger', 'critical'].includes(value)) {
    return value
  }
  return 'info'
}

export async function createActivityLog({
  userId,
  deviceId = null,
  activityType,
  title,
  description = null,
  severity = 'info',
  metadata = {},
  createdAt = null,
}) {
  if (!userId || !activityType || !title) return null

  try {
    const result = await pool.query(
      `
      INSERT INTO activity_logs (
        user_id,
        device_id,
        activity_type,
        title,
        description,
        severity,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8::timestamptz, now()))
      RETURNING *
      `,
      [
        userId,
        deviceId,
        activityType,
        title,
        description,
        normalizeSeverity(severity),
        JSON.stringify(metadata || {}),
        createdAt,
      ]
    )

    return result.rows[0] || null
  } catch (error) {
    // Activity logging must never break ingest or alarm processing.
    // If migration has not been applied yet, the main app keeps working.
    console.warn('Activity log skipped:', error.message)
    return null
  }
}

export async function createReadingActivity({
  userId,
  deviceId,
  deviceName,
  latestMetrics,
  createdAt,
}) {
  if (!userId || !deviceId) return null

  try {
    const result = await pool.query(
      `
      INSERT INTO activity_logs (
        user_id,
        device_id,
        activity_type,
        title,
        description,
        severity,
        metadata,
        created_at
      )
      SELECT
        $1,
        $2,
        'reading.received',
        $3,
        $4,
        'success',
        $5::jsonb,
        COALESCE($6::timestamptz, now())
      WHERE NOT EXISTS (
        SELECT 1
        FROM activity_logs
        WHERE user_id = $1
          AND device_id = $2
          AND activity_type = 'reading.received'
          AND created_at > now() - interval '60 seconds'
      )
      RETURNING *
      `,
      [
        userId,
        deviceId,
        `${deviceName || 'Device'} sent telemetry`,
        'Latest metrics were received and saved.',
        JSON.stringify({ latestMetrics: latestMetrics || {} }),
        createdAt,
      ]
    )

    return result.rows[0] || null
  } catch (error) {
    console.warn('Reading activity skipped:', error.message)
    return null
  }
}

export async function createDeviceStatusActivity({
  userId,
  deviceId,
  deviceName,
  status,
  createdAt,
}) {
  if (!userId || !deviceId || !status) return null

  const normalizedStatus = String(status).toLowerCase()
  const isOnline = normalizedStatus === 'online'
  const isOffline = normalizedStatus === 'offline'

  const severity = isOnline ? 'success' : isOffline ? 'danger' : 'warning'
  const title = `${deviceName || 'Device'} ${normalizedStatus}`
  const description = isOnline
    ? 'Device is sending data again.'
    : isOffline
      ? 'Device has stopped sending telemetry.'
      : `Device status changed to ${normalizedStatus}.`

  try {
    const result = await pool.query(
      `
      INSERT INTO activity_logs (
        user_id,
        device_id,
        activity_type,
        title,
        description,
        severity,
        metadata,
        created_at
      )
      SELECT
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb,
        COALESCE($8::timestamptz, now())
      WHERE NOT EXISTS (
        SELECT 1
        FROM activity_logs
        WHERE user_id = $1
          AND device_id = $2
          AND activity_type = $3
          AND created_at > now() - interval '10 minutes'
      )
      RETURNING *
      `,
      [
        userId,
        deviceId,
        `device.${normalizedStatus}`,
        title,
        description,
        severity,
        JSON.stringify({ status: normalizedStatus }),
        createdAt,
      ]
    )

    return result.rows[0] || null
  } catch (error) {
    console.warn('Device status activity skipped:', error.message)
    return null
  }
}

export async function createAlarmActivity({ userId, deviceId, alarm }) {
  if (!userId || !alarm) return null

  const metricName = alarm.metric_name || alarm.metric || 'Metric'
  const severity = alarm.severity === 'critical' ? 'critical' : 'warning'
  const notificationMessage = String(alarm.notification_message || '').trim()
  const decimals = Math.min(
    6,
    Math.max(0, Number.isInteger(Number(alarm.decimal_places)) ? Number(alarm.decimal_places) : 2)
  )
  const formatMetricNumber = (value) => {
    if (value == null || value === '') return '--'
    const number = Number(value)
    return Number.isFinite(number) ? number.toFixed(decimals) : String(value)
  }

  return createActivityLog({
    userId,
    deviceId,
    activityType: 'alarm.triggered',
    title: `${severity === 'critical' ? 'Critical' : 'Warning'} alarm triggered`,
    description:
      notificationMessage ||
      `${metricName} ${alarm.operator || ''} ${formatMetricNumber(alarm.threshold)} · Current ${formatMetricNumber(alarm.value)}${alarm.unit ? ` ${alarm.unit}` : ''}`,
    severity,
    metadata: alarm,
    createdAt: alarm.triggered_at || new Date().toISOString(),
  })
}

export async function listActivityLogs({ userId, deviceId, limit }) {
  const safeLimit = normalizeLimit(limit)
  const params = [userId]
  let deviceWhere = ''

  if (deviceId) {
    params.push(deviceId)
    deviceWhere = `AND al.device_id = $${params.length}`
  }

  params.push(safeLimit)

  const result = await pool.query(
    `
    SELECT
      al.id,
      al.user_id,
      al.device_id,
      d.device_code,
      d.name AS device_name,
      al.activity_type,
      al.title,
      al.description,
      al.severity,
      al.metadata,
      al.created_at
    FROM activity_logs al
    LEFT JOIN devices d
      ON d.id = al.device_id
    WHERE al.user_id = $1
      AND al.activity_type NOT LIKE 'alarm.%'
      ${deviceWhere}
    ORDER BY al.created_at DESC
    LIMIT $${params.length}
    `,
    params
  )

  return result.rows
}

export async function clearActivityLogs({
  userId,
  ids,
  deviceId = null,
  startDate = '',
  endDate = '',
  category = 'all',
}) {
  const params = [userId, ids]
  const conditions = [
    'user_id = $1',
    'id = ANY($2::bigint[])',
    "activity_type NOT LIKE 'alarm.%'",
  ]

  if (deviceId) {
    params.push(deviceId)
    conditions.push(`device_id = $${params.length}`)
  }

  if (startDate) {
    params.push(startDate)
    conditions.push(
      `created_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Asia/Bangkok')`
    )
  }

  if (endDate) {
    params.push(endDate)
    conditions.push(
      `created_at < (($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Bangkok')`
    )
  }

  const categoryConditions = {
    session: "activity_type LIKE 'session.%'",
    navigation: "activity_type LIKE 'navigation.%'",
    changes: "activity_type ~ '^(operation|preference|profile)\\.'",
    device: "(activity_type LIKE 'device.%' OR activity_type LIKE 'reading.%')",
    other: `activity_type !~ '^(session|navigation|operation|preference|profile|device|reading)\\.'`,
  }

  if (category !== 'all') {
    conditions.push(categoryConditions[category])
  }

  const result = await pool.query(
    `
    DELETE FROM activity_logs
    WHERE ${conditions.join('\n      AND ')}
    RETURNING id
    `,
    params
  )

  return result.rows.map((row) => row.id)
}
