import { auth } from './firebase'

const API_URL = String(
  import.meta.env.VITE_API_URL || 'http://localhost:4000'
).replace(/\/$/, '')

const ALARM_PATH_PATTERN = /^\/api\/(alarms|alarm-rules)(?:\/|$)/i

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .slice(0, 20)
  )
}

export async function recordUserActivity({
  activityType,
  title,
  description = '',
  severity = 'info',
  deviceId = null,
  metadata = {},
}) {
  const user = auth.currentUser
  const normalizedType = String(activityType || '').trim().toLowerCase()

  if (!user || !normalizedType || !title || normalizedType.startsWith('alarm.')) {
    return null
  }

  try {
    const token = await user.getIdToken()
    const response = await fetch(`${API_URL}/api/activity`, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-dotWatch-Client': 'dashboard',
      },
      body: JSON.stringify({
        activityType: normalizedType,
        title: String(title).slice(0, 160),
        description: String(description || '').slice(0, 500),
        severity,
        deviceId: deviceId ? Number(deviceId) : null,
        metadata: normalizeMetadata(metadata),
      }),
    })

    if (!response.ok) return null
    const activity = await response.json().catch(() => null)

    if (activity && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dotwatchActivityRecorded', { detail: activity })
      )
    }

    return activity
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Activity tracking skipped:', error.message)
    }
    return null
  }
}

function describeMutation(path, method) {
  if (
    ALARM_PATH_PATTERN.test(path) ||
    path.toLowerCase().includes('alarm') ||
    path.startsWith('/api/activity')
  ) {
    return null
  }

  const deviceMatch = path.match(/^\/api\/devices\/(\d+)/i)
  const deviceId = deviceMatch?.[1] || null

  if (/\/record-settings(?:\/|$)/i.test(path)) {
    return ['operation.recording_settings_updated', 'Recording settings updated', 'Device recording interval was changed.', deviceId]
  }
  if (/\/metrics\/reset(?:\/|$)/i.test(path)) {
    return ['operation.metrics_reset', 'Value settings reset', 'Value configuration was restored to its defaults.', deviceId]
  }
  if (/\/metrics\//i.test(path) && method === 'DELETE') {
    return ['operation.metric_deleted', 'Value deleted', 'A device value was deleted.', deviceId]
  }
  if (/\/metrics(?:\/|$)/i.test(path)) {
    return ['operation.metrics_updated', 'Value settings updated', 'Device value display or recording settings were changed.', deviceId]
  }
  if (/\/reset-secret(?:\/|$)/i.test(path)) {
    return ['operation.device_secret_reset', 'Device secret reset', 'A new device secret was generated.', deviceId]
  }
  if (/^\/api\/devices(?:\/|$)/i.test(path)) {
    const action = method === 'POST' ? 'created' : method === 'DELETE' ? 'deleted' : 'updated'
    return [`operation.device_${action}`, `Device ${action}`, `Device information was ${action}.`, deviceId]
  }
  if (/\/history/i.test(path) && method === 'DELETE') {
    return ['operation.history_cleared', 'History data cleared', 'Filtered historical data was deleted.', deviceId]
  }
  if (/^\/api\/demo/i.test(path)) {
    return ['operation.demo_updated', 'Demo configuration updated', 'Demo data or generator settings were changed.', null]
  }

  return [
    'operation.settings_updated',
    'System setting updated',
    'A dashboard setting was changed successfully.',
    deviceId,
  ]
}

export function recordApiMutation(path, method) {
  const normalizedMethod = String(method || 'GET').toUpperCase()
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) return

  const activity = describeMutation(String(path || ''), normalizedMethod)
  if (!activity) return

  const [activityType, title, description, deviceId] = activity
  void recordUserActivity({
    activityType,
    title,
    description,
    deviceId,
    metadata: { method: normalizedMethod, path: String(path).split('?')[0] },
  })
}
