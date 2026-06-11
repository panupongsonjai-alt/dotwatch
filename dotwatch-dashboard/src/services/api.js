import { auth } from './firebase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function getToken() {
  const user = auth.currentUser

  if (!user) {
    throw new Error('User not logged in')
  }

  return user.getIdToken()
}

async function apiFetch(path, options = {}) {
  const token = await getToken()

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || 'API request failed')
  }

  return data
}

function getRangeDate(range = '24h') {
  const now = new Date()
  const from = new Date(now)

  switch (range) {
    case '1h':
      from.setHours(now.getHours() - 1)
      break
    case '6h':
      from.setHours(now.getHours() - 6)
      break
    case '24h':
      from.setHours(now.getHours() - 24)
      break
    case '7d':
      from.setDate(now.getDate() - 7)
      break
    case '30d':
      from.setDate(now.getDate() - 30)
      break
    case '1y':
      from.setFullYear(now.getFullYear() - 1)
      break
    default:
      from.setHours(now.getHours() - 24)
  }

  return {
    from: from.toISOString(),
    to: now.toISOString(),
  }
}

function normalizeHistoryForOldChart(rows) {
  return rows.map((item) => {
    const time = item.bucket_time || item.time || item.created_at

    return {
      time,
      created_at: time,
      temperature:
        item.avg_temperature != null
          ? Number(item.avg_temperature)
          : item.temperature != null
            ? Number(item.temperature)
            : null,
      humidity:
        item.avg_humidity != null
          ? Number(item.avg_humidity)
          : item.humidity != null
            ? Number(item.humidity)
            : null,
      rssi:
        item.avg_rssi != null
          ? Number(item.avg_rssi)
          : item.rssi != null
            ? Number(item.rssi)
            : null,
    }
  })
}

export function getDevices() {
  return apiFetch('/api/devices')
}

export function addDevice({ id, name, deviceKey, deviceCode, deviceSecret }) {
  return apiFetch('/api/devices', {
    method: 'POST',
    body: JSON.stringify({
      id,
      name,
      deviceCode: deviceCode || deviceKey,
      deviceSecret,
    }),
  })
}

export const createDevice = addDevice

export function updateDeviceName(deviceId, name) {
  return apiFetch(`/api/devices/${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

export function deleteDevice(deviceId) {
  return apiFetch(`/api/devices/${deviceId}`, {
    method: 'DELETE',
  })
}

export async function getHistory(deviceId, range = '24h') {
  const { from, to } = getRangeDate(range)
  const params = new URLSearchParams()

  params.set('from', from)
  params.set('to', to)

  const data = await apiFetch(`/api/devices/${deviceId}/history?${params}`)

  return normalizeHistoryForOldChart(Array.isArray(data) ? data : [])
}