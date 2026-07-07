import { ACCENT_OPTIONS, DENSITY_OPTIONS } from './uiPreferences'

const SENSITIVE_KEY_PATTERNS = [
  /secret/i,
  /password/i,
  /private[_-]?key/i,
  /api[_-]?key/i,
  /bearer/i,
  /authorization/i,
]

const SAFE_FIREBASE_PREFIXES = ['firebase:', 'firebaseui::']

const DOTWATCH_SENSITIVE_KEYS = [
  'dotwatchSelectedDeviceSecret',
  'dotwatchDeviceSecret',
  'dotwatchPendingSecret',
  'dotwatchCreateDeviceSecret',
  'dotwatchLastDeviceSecret',
  'dotwatchApiToken',
  'dotwatchAuthToken',
  'dotwatchResetSecret',
]

const DOTWATCH_SESSION_KEYS = [
  'dotwatchActivePage',
  'dotwatchSelectedDeviceId',
]

function isFirebaseInternalKey(key) {
  return SAFE_FIREBASE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

function isSensitiveStorageKey(key) {
  if (!key || isFirebaseInternalKey(key)) return false

  if (DOTWATCH_SENSITIVE_KEYS.includes(key)) return true

  return key.startsWith('dotwatch') &&
    SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

export function removeSensitiveLocalStorage() {
  const keysToRemove = []

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)

    if (isSensitiveStorageKey(key)) {
      keysToRemove.push(key)
    }
  }

  DOTWATCH_SENSITIVE_KEYS.forEach((key) => {
    if (!keysToRemove.includes(key)) {
      keysToRemove.push(key)
    }
  })

  keysToRemove.forEach((key) => localStorage.removeItem(key))

  return keysToRemove
}

export function clearSensitiveWorkspaceState() {
  DOTWATCH_SESSION_KEYS.forEach((key) => localStorage.removeItem(key))
  return removeSensitiveLocalStorage()
}

export function sanitizeStoredPreferences() {
  removeSensitiveLocalStorage()

  const knownBooleanKeys = [
    'dotwatchReduceMotion',
    'dotwatchCompactCards',
    'showDataOverview',
    'showDeviceOverview',
    'showDeviceMap',
    'showLatestActiveAlarms',
  ]

  knownBooleanKeys.forEach((key) => {
    const value = localStorage.getItem(key)

    if (value == null) return

    if (value !== 'true' && value !== 'false') {
      localStorage.removeItem(key)
    }
  })

  const accent = localStorage.getItem('dotwatchAccent')
  const allowedAccents = ACCENT_OPTIONS.map((option) => option.value)

  if (accent && !allowedAccents.includes(accent)) {
    localStorage.setItem('dotwatchAccent', 'blue')
  }

  const density = localStorage.getItem('dotwatchDensity')
  const allowedDensity = DENSITY_OPTIONS.map((option) => option.value)

  if (density && !allowedDensity.includes(density)) {
    localStorage.setItem('dotwatchDensity', 'comfortable')
  }
}

export function installClientSecurityGuards() {
  sanitizeStoredPreferences()

  function handleStorage(event) {
    if (event.key === 'dotwatchSecurityReset') {
      clearSensitiveWorkspaceState()
    }
  }

  function handlePageHide() {
    removeSensitiveLocalStorage()
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener('pagehide', handlePageHide)

  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener('pagehide', handlePageHide)
  }
}

export function broadcastSecurityReset(reason = 'manual') {
  localStorage.setItem(
    'dotwatchSecurityReset',
    JSON.stringify({
      reason,
      time: new Date().toISOString(),
    })
  )

  clearSensitiveWorkspaceState()

  window.dispatchEvent(
    new CustomEvent('dotwatchSecurityReset', {
      detail: { reason },
    })
  )
}
