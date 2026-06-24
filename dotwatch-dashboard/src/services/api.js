import { auth } from './firebase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS || 15000)

async function getToken() {
  const user = auth.currentUser

  if (!user) {
    throw new Error('User not logged in')
  }

  return user.getIdToken()
}

function createRequestTimeout() {
  const controller = new AbortController()

  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  return {
    controller,
    clear: () => window.clearTimeout(timeoutId),
  }
}

async function parseResponse(response) {
  const text = await response.text()

  try {
    return text ? JSON.parse(text) : null
  } catch {
    return {
      message: text,
    }
  }
}

async function apiFetch(path, options = {}) {
  const token = await getToken()
  const { controller, clear } = createRequestTimeout()

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    })

    const data = await parseResponse(response)

    if (!response.ok) {
      console.error('API ERROR:', {
        path,
        status: response.status,
        data,
      })

      throw new Error(
        data?.message || data?.error || `API request failed: ${response.status}`
      )
    }

    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('API request timeout. Please try again.')
    }

    throw error
  } finally {
    clear()
  }
}

export function getDevices() {
  return apiFetch('/api/devices')
}

export function getDevice(id) {
  return apiFetch(`/api/devices/${id}`)
}

export function addDevice({ deviceCode, name, deviceSecret, modelId }) {
  return apiFetch('/api/devices', {
    method: 'POST',
    body: JSON.stringify({
      deviceCode,
      name,
      deviceSecret,
      modelId,
    }),
  })
}

export function updateDeviceName(id, name) {
  return apiFetch(`/api/devices/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

export function updateDeviceGroup(id, groupName) {
  return apiFetch(`/api/devices/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ groupName }),
  })
}

export function updateDeviceLocation(id, data) {
  return apiFetch(`/api/devices/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      latitude: data.latitude,
      longitude: data.longitude,
      mapUrl: data.mapUrl,
    }),
  })
}

export function deleteDevice(id) {
  return apiFetch(`/api/devices/${id}`, {
    method: 'DELETE',
  })
}

export function resetDeviceSecret(id) {
  return apiFetch(`/api/devices/${id}/reset-secret`, {
    method: 'POST',
  })
}

export function getHistory(deviceId, from, to, metricKey) {
  const params = new URLSearchParams()

  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (metricKey) params.set('metricKey', metricKey)

  const query = params.toString()

  return apiFetch(`/api/devices/${deviceId}/history${query ? `?${query}` : ''}`)
}

export function getDeviceHistory(deviceId, from, to, metricKey) {
  return getHistory(deviceId, from, to, metricKey)
}

export function getDeviceMetrics(deviceId) {
  return apiFetch(`/api/devices/${deviceId}/metrics`)
}

export function saveDeviceMetrics(deviceId, metrics) {
  return apiFetch(`/api/devices/${deviceId}/metrics`, {
    method: 'PUT',
    body: JSON.stringify({ metrics }),
  })
}

export function resetDeviceMetrics(deviceId) {
  return apiFetch(`/api/devices/${deviceId}/metrics/reset`, {
    method: 'POST',
  })
}

export function getAlarms() {
  return apiFetch('/api/alarms')
}

export function acknowledgeAlarm(id) {
  return apiFetch(`/api/alarms/${id}/acknowledge`, {
    method: 'POST',
  })
}

export function getAlarmRules() {
  return apiFetch('/api/alarm-rules')
}

export function createAlarmRule(data) {
  return apiFetch('/api/alarm-rules', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAlarmRule(id, data) {
  return apiFetch(`/api/alarm-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteAlarmRule(id) {
  return apiFetch(`/api/alarm-rules/${id}`, {
    method: 'DELETE',
  })
}
