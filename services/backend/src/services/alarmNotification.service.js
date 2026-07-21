import { env } from '../config/env.js'
import { pool } from '../db/pool.js'

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push'
const RESEND_EMAIL_URL = 'https://api.resend.com/emails'

function formatValue(value, decimalPlaces = 2, unit = '') {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return '-'
  const places = Math.min(Math.max(Number(decimalPlaces) || 0, 0), 6)
  return `${numberValue.toFixed(places)}${unit ? ` ${unit}` : ''}`
}

function buildMessage({ alarmEvent, deviceName, deviceCode }) {
  const recovered = alarmEvent.status === 'resolved'
  const metricName = alarmEvent.metric_name || alarmEvent.metric || 'Value'
  const severity = String(alarmEvent.severity || 'warning').toUpperCase()
  const title = recovered
    ? `dotWatch: Alarm recovered · ${deviceName}`
    : `dotWatch: ${severity} alarm · ${deviceName}`
  const lines = [
    recovered ? '✅ Alarm recovered' : severity === 'CRITICAL' ? '🚨 Critical alarm' : '⚠️ Warning alarm',
    `Device: ${deviceName}${deviceCode ? ` (${deviceCode})` : ''}`,
    `Value: ${metricName} = ${formatValue(alarmEvent.value, alarmEvent.decimal_places, alarmEvent.unit)}`,
  ]

  if (alarmEvent.operator && alarmEvent.threshold != null) {
    lines.push(`Rule: ${alarmEvent.operator} ${formatValue(alarmEvent.threshold, alarmEvent.decimal_places, alarmEvent.unit)}`)
  }
  const customMessage = String(alarmEvent.notification_message || '').trim()
  if (customMessage) lines.push(`Message: ${customMessage}`)
  lines.push(`Time: ${new Date(alarmEvent.triggered_at || Date.now()).toISOString()}`)
  return { title, text: lines.join('\n') }
}

async function loadTargets({ userId, deviceId }) {
  const result = await pool.query(
    `SELECT np.line_enabled, np.line_target_id, np.email_enabled,
      COALESCE(NULLIF(np.email_address, ''), u.email) AS email_address,
      np.notify_on_trigger, np.notify_on_recovery,
      d.name AS device_name, d.device_code
    FROM devices d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN notification_preferences np ON np.user_id = u.id
    WHERE d.id = $1 AND d.user_id = $2
    LIMIT 1`,
    [deviceId, userId]
  )
  return result.rows[0] || null
}

async function sendLine({ targetId, text }) {
  if (!env.lineChannelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured')
  const response = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.lineChannelAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: targetId, messages: [{ type: 'text', text }] }),
    signal: AbortSignal.timeout(env.notificationTimeoutMs),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message || `LINE Messaging API returned ${response.status}`)
  }
}

async function sendEmail({ to, title, text }) {
  if (!env.resendApiKey || !env.emailFrom) throw new Error('Email provider is not configured')
  const response = await fetch(RESEND_EMAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject: title, text }),
    signal: AbortSignal.timeout(env.notificationTimeoutMs),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message || `Email API returned ${response.status}`)
  }
}

export function getNotificationProviderStatus() {
  return {
    lineConfigured: Boolean(env.lineChannelAccessToken),
    emailConfigured: Boolean(env.resendApiKey && env.emailFrom),
  }
}

export async function sendAlarmChannelNotifications({ userId, deviceId, alarmEvent }) {
  const targets = await loadTargets({ userId, deviceId })
  if (!targets) return []
  const recovered = alarmEvent.status === 'resolved'
  if (recovered && targets.notify_on_recovery === false) return []
  if (!recovered && targets.notify_on_trigger === false) return []

  const message = buildMessage({
    alarmEvent,
    deviceName: targets.device_name || targets.device_code || `Device ${deviceId}`,
    deviceCode: targets.device_code,
  })
  const jobs = []
  if (targets.line_enabled && targets.line_target_id) {
    jobs.push(sendLine({ targetId: targets.line_target_id, text: message.text }))
  }
  if (targets.email_enabled && targets.email_address) {
    jobs.push(sendEmail({ to: targets.email_address, title: message.title, text: message.text }))
  }

  const results = await Promise.allSettled(jobs)
  const failures = results.filter((result) => result.status === 'rejected')
  if (failures.length) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      `${failures.length} alarm notification channel(s) failed`
    )
  }
  return results
}

export async function sendTestChannelNotification({ userId, channel }) {
  const result = await pool.query(
    `SELECT np.line_target_id, COALESCE(NULLIF(np.email_address, ''), u.email) AS email_address
     FROM users u LEFT JOIN notification_preferences np ON np.user_id = u.id
     WHERE u.id = $1 LIMIT 1`,
    [userId]
  )
  const target = result.rows[0]
  if (!target) throw new Error('Notification preferences not found')
  const title = 'dotWatch: Test notification'
  const text = `✅ dotWatch test notification\nTime: ${new Date().toISOString()}`

  if (channel === 'line') {
    if (!target.line_target_id) throw new Error('LINE target ID is not configured')
    await sendLine({ targetId: target.line_target_id, text })
  } else {
    if (!target.email_address) throw new Error('Email address is not configured')
    await sendEmail({ to: target.email_address, title, text })
  }
  return { channel, sent: true }
}
