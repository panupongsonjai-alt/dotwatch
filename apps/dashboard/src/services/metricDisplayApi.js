import { auth } from './firebase'
import { recordApiMutation } from './activityTracker'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }

  const user = auth.currentUser

  if (user) {
    headers.Authorization = `Bearer ${await user.getIdToken()}`
  }

  return headers
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(await getAuthHeaders()),
      ...(options.headers || {}),
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || 'API request failed')
  }

  recordApiMutation(path, options.method || 'GET')

  return data
}

export function getDeviceMetrics(deviceId) {
  return request(`/api/devices/${deviceId}/metrics`)
}

export function saveDeviceMetrics(deviceId, metrics, settings) {
  const payload = { metrics }

  if (settings && Object.keys(settings).length > 0) {
    payload.settings = settings
  }

  return request(`/api/devices/${deviceId}/metrics`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getDeviceRecordSettings(deviceId) {
  return request(`/api/devices/${deviceId}/record-settings`)
}

export function updateDeviceRecordSettings(deviceId, recordIntervalSeconds) {
  return request(`/api/devices/${deviceId}/record-settings`, {
    method: 'PUT',
    body: JSON.stringify({
      record_interval_seconds: Number(recordIntervalSeconds),
    }),
  })
}

export function resetDeviceMetrics(deviceId) {
  return request(`/api/devices/${deviceId}/metrics/reset`, {
    method: 'POST',
  })
}

export function deleteDeviceMetric(deviceId, metricId) {
  return request(`/api/devices/${deviceId}/metrics/${metricId}`, {
    method: 'DELETE',
  })
}
