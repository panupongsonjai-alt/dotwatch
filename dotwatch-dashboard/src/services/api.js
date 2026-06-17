import { auth } from './firebase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function getToken() {
  const user = auth.currentUser
  if (!user) throw new Error('User not logged in')
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

export function getDevices() {
  return apiFetch('/api/devices')
}

export function addDevice({ deviceCode, name, deviceSecret }) {
  return apiFetch('/api/devices', {
    method: 'POST',
    body: JSON.stringify({
      deviceCode,
      name,
      deviceSecret,
    }),
  })
}

export function updateDeviceName(id, name) {
  return apiFetch(`/api/devices/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

export function deleteDevice(id) {
  return apiFetch(`/api/devices/${id}`, {
    method: 'DELETE',
  })
}

export function getHistory(deviceId, from, to) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  return apiFetch(`/api/devices/${deviceId}/history?${params.toString()}`)
}

export function resetDeviceSecret(id) {
  return apiFetch(`/api/devices/${id}/reset-secret`, {
    method: 'POST',
  })
}