import { auth } from './firebase'
import {
  MOCK_ADMIN_DEVICES,
  MOCK_ADMIN_PLANS,
  MOCK_ADMIN_USERS,
  MOCK_AUDIT_LOGS,
} from '../data/adminMockData'

const API_URL = normalizeApiUrl(
  import.meta.env.VITE_API_URL || 'http://localhost:4000'
)
const USE_MOCK_ADMIN_API = import.meta.env.VITE_USE_MOCK_ADMIN_API === 'true'
const DEFAULT_ADMIN_REQUEST_TIMEOUT_MS = 20000
const ADMIN_REQUEST_TIMEOUT_MS = Math.max(
  Number(
    import.meta.env.VITE_ADMIN_REQUEST_TIMEOUT_MS ||
      DEFAULT_ADMIN_REQUEST_TIMEOUT_MS
  ),
  15000
)

async function delay(ms = 200) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function normalizeApiUrl(value) {
  const rawValue = String(value || '').trim().replace(/\/$/, '')

  if (!rawValue) {
    throw new Error('Missing VITE_API_URL')
  }

  if (!/^https?:\/\//.test(rawValue)) {
    throw new Error('VITE_API_URL must start with http:// or https://')
  }

  if (
    window.location.protocol === 'https:' &&
    rawValue.startsWith('http://') &&
    !rawValue.includes('localhost') &&
    !rawValue.includes('127.0.0.1')
  ) {
    throw new Error('Insecure admin API URL is blocked on HTTPS pages')
  }

  return rawValue
}

function assertAdminApiPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/admin/')) {
    throw new Error('Invalid admin API path')
  }

  if (/^https?:\/\//i.test(path)) {
    throw new Error('Absolute admin API paths are not allowed')
  }
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `dw-admin-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function getToken({ forceRefresh = false } = {}) {
  if (!auth) {
    throw new Error('Firebase Admin Auth is not configured. Please check apps/admin/.env.local')
  }

  const user = auth.currentUser

  if (!user) {
    throw new Error('Admin user not logged in')
  }

  return user.getIdToken(forceRefresh)
}

async function parseResponseBody(response) {
  const text = await response.text()

  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function dispatchAdminApiEvent(name, detail) {
  window.dispatchEvent(
    new CustomEvent(name, {
      detail,
    })
  )
}

async function adminFetch(path, options = {}) {
  assertAdminApiPath(path)

  const controller = new AbortController()
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    ADMIN_REQUEST_TIMEOUT_MS
  )

  async function sendRequest({ forceRefresh = false } = {}) {
    const token = await getToken({ forceRefresh })
    const headers = new Headers(options.headers || {})

    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json')
    }

    headers.set('Accept', 'application/json')
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('X-dotWatch-Client', 'admin')
    headers.set('X-Request-ID', createRequestId())

    return fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'omit',
      cache: 'no-store',
      headers,
      signal: controller.signal,
    })
  }

  try {
    let response = await sendRequest()
    let data = await parseResponseBody(response)

    if (response.status === 401) {
      response = await sendRequest({ forceRefresh: true })
      data = await parseResponseBody(response)
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        dispatchAdminApiEvent('dotwatchAdminApiAuthError', {
          status: response.status,
          message: data?.message || data?.error || 'Admin authentication error',
        })
      }

      throw new Error(
        data?.message || data?.error || `Admin API failed: ${response.status}`
      )
    }

    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      dispatchAdminApiEvent('dotwatchAdminApiTimeout', {
        path,
        timeout: ADMIN_REQUEST_TIMEOUT_MS,
        message:
          'Admin backend ตอบช้ากว่าที่กำหนด กรุณาตรวจสอบ backend หรือกด Refresh อีกครั้ง',
      })

      throw new Error(
        `Admin API timeout after ${Math.round(
          ADMIN_REQUEST_TIMEOUT_MS / 1000
        )} seconds`
      )
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function getAdminMe() {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    return {
      id: 999,
      email: auth.currentUser?.email || 'admin@dotwatch.local',
      name: 'Super Admin',
      role: 'super_admin',
      status: 'active',
    }
  }

  return adminFetch('/api/admin/me')
}

export async function getAdminStats() {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    const totalUsers = MOCK_ADMIN_USERS.length
    const activeUsers = MOCK_ADMIN_USERS.filter(
      (user) => user.status === 'active'
    ).length
    const overdueUsers = MOCK_ADMIN_USERS.filter(
      (user) => user.status === 'overdue'
    ).length
    const suspendedUsers = MOCK_ADMIN_USERS.filter(
      (user) => user.status === 'suspended'
    ).length
    const totalDevices = MOCK_ADMIN_DEVICES.length
    const onlineDevices = MOCK_ADMIN_DEVICES.filter(
      (device) => device.status === 'online'
    ).length
    const offlineDevices = MOCK_ADMIN_DEVICES.filter(
      (device) => device.status === 'offline'
    ).length

    return {
      totalUsers,
      activeUsers,
      overdueUsers,
      suspendedUsers,
      totalDevices,
      onlineDevices,
      offlineDevices,
    }
  }

  return adminFetch('/api/admin/stats')
}

export async function getAdminCommercialSummary() {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    return {
      plans: MOCK_ADMIN_PLANS.map((plan) => ({
        ...plan,
        subscriberCount: MOCK_ADMIN_USERS.filter(
          (user) => user.plan === plan.planKey
        ).length,
      })),
      usage: {
        usersAtDeviceLimit: 0,
        usersNearDeviceLimit: 1,
        totalAssignedDevices: MOCK_ADMIN_USERS.reduce(
          (sum, user) => sum + Number(user.deviceCount || 0),
          0
        ),
        totalDeviceCapacity: MOCK_ADMIN_USERS.reduce(
          (sum, user) => sum + Number(user.deviceLimit || 0),
          0
        ),
      },
      subscriptionsByStatus: [{ status: 'active', count: MOCK_ADMIN_USERS.length }],
    }
  }

  return adminFetch('/api/admin/commercial-summary')
}

export async function getAdminPlans() {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)
    return MOCK_ADMIN_PLANS
  }

  return adminFetch('/api/admin/plans')
}

export async function getAdminUsers() {
  if (USE_MOCK_ADMIN_API) {
    await delay()
    return MOCK_ADMIN_USERS
  }

  return adminFetch('/api/admin/users')
}

export async function getAdminDevices() {
  if (USE_MOCK_ADMIN_API) {
    await delay()
    return MOCK_ADMIN_DEVICES
  }

  return adminFetch('/api/admin/devices')
}

export async function getAdminAuditLogs() {
  if (USE_MOCK_ADMIN_API) {
    await delay()
    return MOCK_AUDIT_LOGS
  }

  return adminFetch('/api/admin/audit-logs')
}

export async function updateAdminUserStatus(userId, status) {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    const user = MOCK_ADMIN_USERS.find(
      (item) => String(item.id) === String(userId)
    )

    return {
      ...user,
      status,
    }
  }

  return adminFetch(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function updateAdminUserPlan(userId, data) {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)

    const user = MOCK_ADMIN_USERS.find(
      (item) => String(item.id) === String(userId)
    )
    const plan = MOCK_ADMIN_PLANS.find((item) => item.planKey === data.plan)

    return {
      ...user,
      ...data,
      plan: data.plan,
      deviceLimit: data.deviceLimit ?? plan?.deviceLimit ?? user?.deviceLimit,
      siteLimit: plan?.siteLimit ?? user?.siteLimit,
      userLimit: plan?.userLimit ?? user?.userLimit,
      retentionDays: plan?.retentionDays ?? user?.retentionDays,
    }
  }

  return adminFetch(`/api/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}


export async function getAdminDeviceModels() {
  if (USE_MOCK_ADMIN_API) {
    await delay()

    return [
      {
        id: 1,
        modelKey: 'dw_2ch',
        modelName: 'DW2CH',
        metricCount: 2,
        description: 'ESP / 2 Channels เช่น Temperature และ Humidity',
        isActive: true,
        deviceCount: 0,
        metrics: [
          { metricKey: 'metric_1', defaultName: 'Temperature', defaultType: 'temperature', defaultUnit: '°C', defaultIcon: 'Thermometer', sortOrder: 0 },
          { metricKey: 'metric_2', defaultName: 'Humidity', defaultType: 'humidity', defaultUnit: '%', defaultIcon: 'Droplets', sortOrder: 1 },
        ],
      },
      {
        id: 3,
        modelKey: 'dw_20ch',
        modelName: 'DW20CH',
        metricCount: 20,
        description: 'Raspberry Pi / 20 Channels Gateway',
        isActive: true,
        deviceCount: 1,
        metrics: [],
      },
      {
        id: 5,
        modelKey: 'esp32_dht3',
        modelName: 'dot-TH-W1',
        metricCount: 2,
        description: 'ESP32 Wi-Fi model with fixed Temperature and Humidity values',
        isActive: true,
        deviceCount: 0,
        metrics: [
          { metricKey: 'metric_1', defaultName: 'Temperature', defaultType: 'temperature', defaultUnit: '°C', defaultIcon: 'Thermometer', sortOrder: 0 },
          { metricKey: 'metric_2', defaultName: 'Humidity', defaultType: 'humidity', defaultUnit: '%RH', defaultIcon: 'Droplets', sortOrder: 1 },
        ],
      },
      {
        id: 6,
        modelKey: 'weather_api_demo',
        modelName: 'dot-WT-W1',
        metricCount: 2,
        description: 'Backend virtual weather device with fixed Temperature and Humidity values',
        isActive: true,
        deviceCount: 0,
        metrics: [
          { metricKey: 'temperature', defaultName: 'Temperature', defaultType: 'temperature', defaultUnit: '°C', defaultIcon: 'Thermometer', sortOrder: 0 },
          { metricKey: 'humidity', defaultName: 'Humidity', defaultType: 'humidity', defaultUnit: '%RH', defaultIcon: 'Droplets', sortOrder: 1 },
        ],
      },
    ]
  }

  return adminFetch('/api/admin/device-models?includeInactive=true')
}

export async function createAdminDeviceModel(data) {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)
    return { id: Date.now(), ...data, isActive: true, deviceCount: 0 }
  }

  return adminFetch('/api/admin/device-models', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateAdminDeviceModel(modelId, data) {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)
    return { id: modelId, ...data }
  }

  return adminFetch(`/api/admin/device-models/${modelId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteAdminDeviceModel(modelId) {
  if (USE_MOCK_ADMIN_API) {
    await delay(150)
    return { id: modelId, isActive: false }
  }

  return adminFetch(`/api/admin/device-models/${modelId}`, {
    method: 'DELETE',
  })
}
