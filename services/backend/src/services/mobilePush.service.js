import { pool } from '../db/pool.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const MAX_BATCH_SIZE = 100

function splitBatches(items, size = MAX_BATCH_SIZE) {
  const batches = []

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }

  return batches
}

function isExpoPushToken(token) {
  return (
    typeof token === 'string' &&
    (token.startsWith('ExponentPushToken[') ||
      token.startsWith('ExpoPushToken['))
  )
}

function formatAlarmValue(value, decimalPlaces = 2, unit = '') {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) return '-'

  const normalizedPlaces = Math.min(
    Math.max(Number(decimalPlaces) || 0, 0),
    6
  )

  return `${numericValue.toFixed(normalizedPlaces)}${unit ? ` ${unit}` : ''}`
}

async function disableInvalidTokens(tokens) {
  if (!tokens.length) return

  await pool.query(
    `
    UPDATE mobile_push_tokens
    SET
      is_active = false,
      updated_at = NOW()
    WHERE token = ANY($1::text[])
    `,
    [tokens]
  )
}

async function loadPushTargets({ userId, deviceId }) {
  const result = await pool.query(
    `
    SELECT
      d.id AS device_id,
      d.device_code,
      d.name AS device_name,
      COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'token', mpt.token,
            'platform', mpt.platform
          )
        ) FILTER (
          WHERE mpt.id IS NOT NULL
            AND mpt.is_active = true
        ),
        '[]'::jsonb
      ) AS push_tokens
    FROM devices d
    LEFT JOIN mobile_push_tokens mpt
      ON mpt.user_id = d.user_id
      AND mpt.is_active = true
    WHERE d.id = $1
      AND d.user_id = $2
    GROUP BY d.id, d.device_code, d.name
    LIMIT 1
    `,
    [deviceId, userId]
  )

  return result.rows[0] || null
}

async function sendExpoBatch(messages) {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      `Expo push request failed (${response.status}): ${
        payload?.errors?.[0]?.message || response.statusText
      }`
    )
  }

  return Array.isArray(payload?.data) ? payload.data : []
}

export async function sendAlarmTriggeredPush({
  userId,
  deviceId,
  alarmEvent,
}) {
  if (!userId || !deviceId || !alarmEvent) {
    return { sent: 0, skipped: true }
  }

  const target = await loadPushTargets({ userId, deviceId })

  if (!target) {
    return { sent: 0, skipped: true }
  }

  const tokenRows = Array.isArray(target.push_tokens)
    ? target.push_tokens
    : []

  const tokens = tokenRows
    .map((item) => item?.token)
    .filter(isExpoPushToken)

  if (!tokens.length) {
    return { sent: 0, skipped: true }
  }

  const metricName = alarmEvent.metric_name || alarmEvent.metric || 'Metric'
  const severity = String(alarmEvent.severity || 'warning').toUpperCase()
  const value = formatAlarmValue(
    alarmEvent.value,
    alarmEvent.decimal_places,
    alarmEvent.unit
  )
  const deviceName =
    target.device_name || target.device_code || `Device ${deviceId}`

  const body =
    alarmEvent.notification_message ||
    `${metricName}: ${value} (${alarmEvent.operator || ''} ${
      alarmEvent.threshold ?? ''
    })`.replace(/\s+/g, ' ').trim()

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    priority: 'high',
    channelId: 'alarms',
    title: `[${severity}] ${deviceName}`,
    body,
    data: {
      type: 'alarm.triggered',
      alarmId: String(alarmEvent.id),
      deviceId: String(deviceId),
      severity: alarmEvent.severity || 'warning',
      metric: alarmEvent.metric || '',
      url: `/devices/${deviceId}`,
    },
  }))

  let sent = 0
  const invalidTokens = []

  for (const batch of splitBatches(messages)) {
    const tickets = await sendExpoBatch(batch)

    tickets.forEach((ticket, index) => {
      const sourceMessage = batch[index]
      const token = sourceMessage?.to

      if (ticket?.status === 'ok') {
        sent += 1
        return
      }

      if (
        ticket?.status === 'error' &&
        ticket?.details?.error === 'DeviceNotRegistered' &&
        token
      ) {
        invalidTokens.push(token)
      }

      console.warn('Expo push ticket error:', {
        tokenSuffix: token ? token.slice(-10) : 'unknown',
        message: ticket?.message || 'Unknown Expo push error',
        error: ticket?.details?.error || null,
      })
    })
  }

  await disableInvalidTokens(invalidTokens)

  return {
    sent,
    attempted: messages.length,
    disabled: invalidTokens.length,
  }
}
