import { auth } from './firebase'

const API_URL = normalizeApiUrl(
  import.meta.env.VITE_API_URL || 'http://localhost:4000'
)

const DEFAULT_REQUEST_TIMEOUT_MS = 20000
const MIN_REQUEST_TIMEOUT_MS = 15000

const REQUEST_TIMEOUT_MS = Math.max(
  Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS),
  MIN_REQUEST_TIMEOUT_MS
)

const DEFAULT_GET_CACHE_TTL_MS = 6000
const SLOW_GET_CACHE_TTL_MS = 12000

const GET_CACHE_TTL_MS = Math.max(
  Number(import.meta.env.VITE_API_CACHE_TTL_MS || DEFAULT_GET_CACHE_TTL_MS),
  1000
)

const GET_SLOW_CACHE_TTL_MS = Math.max(
  Number(
    import.meta.env.VITE_API_SLOW_CACHE_TTL_MS || SLOW_GET_CACHE_TTL_MS
  ),
  GET_CACHE_TTL_MS
)

const responseCache = new Map()
const inFlightRequests = new Map()

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
    throw new Error('Insecure API URL is blocked on HTTPS pages')
  }

  return rawValue
}

function assertApiPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new Error('Invalid API path')
  }

  if (/^https?:\/\//i.test(path)) {
    throw new Error('Absolute API paths are not allowed')
  }
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `dw-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function dispatchAuthError(status, data) {
  window.dispatchEvent(
    new CustomEvent('dotwatchApiAuthError', {
      detail: {
        status,
        message: data?.message || data?.error || 'Authentication error',
      },
    })
  )

  if (status === 401) {
    window.dispatchEvent(
      new CustomEvent('dotwatchUnauthorized', {
        detail: {
          status,
          message: data?.message || data?.error || 'Unauthorized',
        },
      })
    )
  }
}

function getRequestMethod(options = {}) {
  return String(options.method || 'GET').toUpperCase()
}

function cloneData(data) {
  if (data == null) return data

  try {
    return structuredClone(data)
  } catch {
    try {
      return JSON.parse(JSON.stringify(data))
    } catch {
      return data
    }
  }
}

function canUseMemoryCache(path, options = {}) {
  const method = getRequestMethod(options)

  if (method !== 'GET') return false
  if (options.body) return false

  // ห้าม cache secret โดยเด็ดขาด
  if (path.includes('/secret')) return false

  return true
}

function getMemoryCacheKey(path, options = {}) {
  return `${getRequestMethod(options)}:${path}`
}

function getMemoryCacheTtl(path) {
  if (
    path.includes('/history') ||
    path.includes('/activity') ||
    path.includes('/alarms') ||
    path.includes('/alarm-rules')
  ) {
    return GET_SLOW_CACHE_TTL_MS
  }

  return GET_CACHE_TTL_MS
}

function readMemoryCache(cacheKey) {
  const entry = responseCache.get(cacheKey)

  if (!entry) return null

  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey)
    return null
  }

  return cloneData(entry.data)
}

function writeMemoryCache(cacheKey, data, ttl) {
  responseCache.set(cacheKey, {
    data: cloneData(data),
    expiresAt: Date.now() + ttl,
  })
}

export function clearApiCache() {
  responseCache.clear()
  inFlightRequests.clear()
}

if (typeof window !== 'undefined') {
  window.addEventListener('dotwatchUnauthorized', clearApiCache)
}

async function getToken({ forceRefresh = false } = {}) {
  const user = auth.currentUser

  if (!user) {
    throw new Error('User not logged in')
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

async function performApiRequest(path, options = {}) {
  const controller = new AbortController()
  const timeout = Number.isFinite(REQUEST_TIMEOUT_MS)
    ? REQUEST_TIMEOUT_MS
    : DEFAULT_REQUEST_TIMEOUT_MS

  const timeoutId = setTimeout(() => controller.abort(), timeout)

  async function sendRequest({ forceRefresh = false } = {}) {
    const token = await getToken({ forceRefresh })
    const headers = new Headers(options.headers || {})

    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json')
    }

    headers.set('Accept', 'application/json')
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('X-dotWatch-Client', 'dashboard')
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
        dispatchAuthError(response.status, data)
      }

      if (import.meta.env.DEV) {
        console.error('API ERROR:', {
          path,
          status: response.status,
          data,
        })
      }

      throw new Error(
        data?.message || data?.error || `API request failed: ${response.status}`
      )
    }

    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      window.dispatchEvent(
        new CustomEvent('dotwatchApiTimeout', {
          detail: {
            path,
            timeout,
            message:
              'Backend ตอบช้ากว่าที่กำหนด กรุณาตรวจสอบ backend หรือกด Refresh อีกครั้ง',
          },
        })
      )

      throw new Error(
        `Backend response timeout after ${Math.round(timeout / 1000)} seconds`
      )
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function apiFetch(path, options = {}) {
  assertApiPath(path)

  const method = getRequestMethod(options)
  const useCache = canUseMemoryCache(path, options)
  const cacheKey = useCache ? getMemoryCacheKey(path, options) : ''

  if (useCache) {
    const cachedData = readMemoryCache(cacheKey)

    if (cachedData !== null) {
      return cachedData
    }

    const pendingRequest = inFlightRequests.get(cacheKey)

    if (pendingRequest) {
      return cloneData(await pendingRequest)
    }
  }

  const requestPromise = performApiRequest(path, options)

  if (useCache) {
    inFlightRequests.set(cacheKey, requestPromise)
  }

  try {
    const data = await requestPromise

    if (useCache) {
      writeMemoryCache(cacheKey, data, getMemoryCacheTtl(path))
    } else if (method !== 'GET') {
      clearApiCache()
    }

    return cloneData(data)
  } finally {
    if (useCache) {
      inFlightRequests.delete(cacheKey)
    }
  }
}

export function getDevices() {
  return apiFetch('/api/devices')
}

export function getDeviceModels() {
  return apiFetch('/api/device-models')
}

export function getDevice(id) {
  return apiFetch(`/api/devices/${encodeURIComponent(id)}`)
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
  return apiFetch(`/api/devices/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

export function updateDeviceGroup(id, groupName) {
  return apiFetch(`/api/devices/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ groupName }),
  })
}

export function deleteDevice(id) {
  return apiFetch(`/api/devices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function resetDeviceSecret(id) {
  return apiFetch(`/api/devices/${encodeURIComponent(id)}/reset-secret`, {
    method: 'POST',
  })
}

export function getDeviceSecret(id) {
  return apiFetch(`/api/devices/${encodeURIComponent(id)}/secret`)
}

export function updateDeviceLocation(id, data) {
  return apiFetch(`/api/devices/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      latitude: data.latitude,
      longitude: data.longitude,
      mapUrl: data.mapUrl,
    }),
  })
}

export function getHistory(deviceId, from, to, metricKey, options = {}) {
  const params = new URLSearchParams()

  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (metricKey) params.set('metricKey', metricKey)
  if (options.resolution) params.set('resolution', options.resolution)
  if (options.limit) params.set('limit', options.limit)

  const query = params.toString()

  return apiFetch(
    `/api/devices/${encodeURIComponent(deviceId)}/history${
      query ? `?${query}` : ''
    }`
  )
}

export function getDeviceHistory(deviceId, from, to, metricKey, options = {}) {
  return getHistory(deviceId, from, to, metricKey, options)
}

export function getHistoryByDate(deviceId, date, metricKey, options = {}) {
  const params = new URLSearchParams()

  if (date) params.set('date', date)
  if (metricKey) params.set('metricKey', metricKey)
  if (options.resolution) params.set('resolution', options.resolution)
  if (options.limit) params.set('limit', options.limit)

  const query = params.toString()

  return apiFetch(
    `/api/devices/${encodeURIComponent(deviceId)}/history${
      query ? `?${query}` : ''
    }`
  )
}

export function getDeviceHistoryByDate(deviceId, date, metricKey, options = {}) {
  return getHistoryByDate(deviceId, date, metricKey, options)
}

export function clearHistoryByDate(deviceId, date, metricKey = '') {
  const params = new URLSearchParams()

  if (date) params.set('date', date)
  if (metricKey) params.set('metricKey', metricKey)

  const query = params.toString()

  return apiFetch(
    `/api/devices/${encodeURIComponent(deviceId)}/history${
      query ? `?${query}` : ''
    }`,
    { method: 'DELETE' }
  )
}

export function getDeviceMetrics(deviceId) {
  return apiFetch(`/api/devices/${encodeURIComponent(deviceId)}/metrics`)
}

export function saveDeviceMetrics(deviceId, metrics) {
  return apiFetch(`/api/devices/${encodeURIComponent(deviceId)}/metrics`, {
    method: 'PUT',
    body: JSON.stringify({ metrics }),
  })
}

export function resetDeviceMetrics(deviceId) {
  return apiFetch(`/api/devices/${encodeURIComponent(deviceId)}/metrics/reset`, {
    method: 'POST',
  })
}

export function getAlarms() {
  return apiFetch('/api/alarms')
}

export function acknowledgeAlarm(id) {
  return apiFetch(`/api/alarms/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
  })
}

export function getActiveAlarms(limit = 50) {
  const params = new URLSearchParams()

  if (limit) params.set('limit', String(limit))

  const query = params.toString()

  return apiFetch(`/api/alarms/active${query ? `?${query}` : ''}`)
}

export function getAlarmSummary() {
  return apiFetch('/api/alarms/summary')
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

export function saveAlarmRulesForDevice(deviceId, rules = []) {
  return apiFetch('/api/alarm-rules/save-all', {
    method: 'POST',
    body: JSON.stringify({
      device_id: deviceId,
      rules,
    }),
  })
}

export function updateAlarmRule(id, data) {
  return apiFetch(`/api/alarm-rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteAlarmRule(id) {
  return apiFetch(`/api/alarm-rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function getDemoTemplates() {
  return apiFetch('/api/demo/templates')
}

export function createDemoTemplate(templateKey) {
  return apiFetch(
    `/api/demo/templates/${encodeURIComponent(templateKey)}`,
    {
      method: 'POST',
    }
  )
}

export function deleteDemoData() {
  return apiFetch('/api/demo/data', {
    method: 'DELETE',
  })
}

export function getDemoStatistics() {
  return apiFetch('/api/demo/statistics')
}

export function getDemoGeneratorConfig() {
  return apiFetch('/api/demo-generator')
}

export function saveDemoGeneratorConfig(data) {
  return apiFetch('/api/demo-generator', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function generateDemoAlarmNow() {
  return apiFetch('/api/demo/actions/alarm-now', {
    method: 'POST',
  })
}

export function generateDemoOfflineNow() {
  return apiFetch('/api/demo/actions/offline-now', {
    method: 'POST',
  })
}

export function generateDemoHistoryNow() {
  return apiFetch('/api/demo/actions/history-now', {
    method: 'POST',
  })
}

export function getActivityLogs({ deviceId, limit } = {}) {
  const params = new URLSearchParams()

  if (deviceId) params.set('deviceId', deviceId)
  if (limit) params.set('limit', String(limit))

  const query = params.toString()

  return apiFetch(`/api/activity${query ? `?${query}` : ''}`)
}
