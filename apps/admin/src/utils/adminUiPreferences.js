export const ADMIN_SETTINGS_EVENT = 'dotwatchAdminSettingsChanged'

export const ADMIN_UI_PREFERENCE_KEYS = {
  accent: 'dotwatchAdminAccent',
  density: 'dotwatchAdminDensity',
  reduceMotion: 'dotwatchAdminReduceMotion',
  compactCards: 'dotwatchAdminCompactCards',
}

export const ADMIN_OVERVIEW_PREFERENCE_KEYS = {
  showSummaryCards: 'dotwatchAdminShowSummaryCards',
  showRecentUsers: 'dotwatchAdminShowRecentUsers',
  showLatestDevices: 'dotwatchAdminShowLatestDevices',
}

export const ACCENT_OPTIONS = [
  { value: 'blue', label: 'Blue', color: '#2563eb', hover: '#1d4ed8' },
  { value: 'sky', label: 'Sky', color: '#0ea5e9', hover: '#0284c7' },
  { value: 'cyan', label: 'Cyan', color: '#06b6d4', hover: '#0891b2' },
  { value: 'teal', label: 'Teal', color: '#14b8a6', hover: '#0f766e' },
  { value: 'emerald', label: 'Emerald', color: '#10b981', hover: '#059669' },
  { value: 'lime', label: 'Lime', color: '#84cc16', hover: '#65a30d' },
  { value: 'amber', label: 'Amber', color: '#f59e0b', hover: '#d97706' },
  { value: 'orange', label: 'Orange', color: '#f97316', hover: '#ea580c' },
  { value: 'red', label: 'dotWatch Red', color: '#ef4444', hover: '#dc2626' },
  { value: 'rose', label: 'Rose', color: '#f43f5e', hover: '#e11d48' },
  { value: 'pink', label: 'Pink', color: '#ec4899', hover: '#db2777' },
  { value: 'violet', label: 'Violet', color: '#8b5cf6', hover: '#7c3aed' },
  { value: 'indigo', label: 'Indigo', color: '#6366f1', hover: '#4f46e5' },
]

export const DENSITY_OPTIONS = [
  {
    value: 'comfortable',
    label: 'Comfortable',
    description: 'ระยะห่างมาตรฐาน อ่านง่าย เหมาะกับการใช้งานทั่วไป',
  },
  {
    value: 'compact',
    label: 'Compact',
    description: 'ลดระยะห่าง เพื่อแสดงข้อมูลได้มากขึ้นในหน้าจอเดียว',
  },
  {
    value: 'spacious',
    label: 'Spacious',
    description: 'เพิ่มพื้นที่หายใจ เหมาะกับจอใหญ่หรือหน้า Monitor TV',
  },
]

export const DEFAULT_ADMIN_UI_PREFERENCES = {
  accent: 'red',
  density: 'comfortable',
  reduceMotion: false,
  compactCards: false,
}

export const DEFAULT_ADMIN_OVERVIEW_PREFERENCES = {
  showSummaryCards: true,
  showRecentUsers: true,
  showLatestDevices: true,
}

const ACCENT_VALUES = new Set(ACCENT_OPTIONS.map((option) => option.value))
const DENSITY_VALUES = new Set(DENSITY_OPTIONS.map((option) => option.value))

function hasBrowserStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function getStoredValue(key) {
  if (!hasBrowserStorage()) return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function setStoredValue(key, value) {
  if (!hasBrowserStorage()) return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private browsing or storage quota errors must not break the Admin UI.
  }
}

function parseBooleanPreference(value, fallback) {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function normalizeAdminUiPreferences(preferences = {}) {
  return {
    accent: ACCENT_VALUES.has(preferences.accent)
      ? preferences.accent
      : DEFAULT_ADMIN_UI_PREFERENCES.accent,
    density: DENSITY_VALUES.has(preferences.density)
      ? preferences.density
      : DEFAULT_ADMIN_UI_PREFERENCES.density,
    reduceMotion: Boolean(preferences.reduceMotion),
    compactCards: Boolean(preferences.compactCards),
  }
}

export function normalizeAdminOverviewPreferences(preferences = {}) {
  return {
    showSummaryCards:
      preferences.showSummaryCards === undefined
        ? DEFAULT_ADMIN_OVERVIEW_PREFERENCES.showSummaryCards
        : Boolean(preferences.showSummaryCards),
    showRecentUsers:
      preferences.showRecentUsers === undefined
        ? DEFAULT_ADMIN_OVERVIEW_PREFERENCES.showRecentUsers
        : Boolean(preferences.showRecentUsers),
    showLatestDevices:
      preferences.showLatestDevices === undefined
        ? DEFAULT_ADMIN_OVERVIEW_PREFERENCES.showLatestDevices
        : Boolean(preferences.showLatestDevices),
  }
}

export function readAdminUiPreferences() {
  return normalizeAdminUiPreferences({
    accent:
      getStoredValue(ADMIN_UI_PREFERENCE_KEYS.accent) ||
      DEFAULT_ADMIN_UI_PREFERENCES.accent,
    density:
      getStoredValue(ADMIN_UI_PREFERENCE_KEYS.density) ||
      DEFAULT_ADMIN_UI_PREFERENCES.density,
    reduceMotion: parseBooleanPreference(
      getStoredValue(ADMIN_UI_PREFERENCE_KEYS.reduceMotion),
      DEFAULT_ADMIN_UI_PREFERENCES.reduceMotion
    ),
    compactCards: parseBooleanPreference(
      getStoredValue(ADMIN_UI_PREFERENCE_KEYS.compactCards),
      DEFAULT_ADMIN_UI_PREFERENCES.compactCards
    ),
  })
}

export function readAdminOverviewPreferences() {
  return normalizeAdminOverviewPreferences({
    showSummaryCards: parseBooleanPreference(
      getStoredValue(ADMIN_OVERVIEW_PREFERENCE_KEYS.showSummaryCards),
      DEFAULT_ADMIN_OVERVIEW_PREFERENCES.showSummaryCards
    ),
    showRecentUsers: parseBooleanPreference(
      getStoredValue(ADMIN_OVERVIEW_PREFERENCE_KEYS.showRecentUsers),
      DEFAULT_ADMIN_OVERVIEW_PREFERENCES.showRecentUsers
    ),
    showLatestDevices: parseBooleanPreference(
      getStoredValue(ADMIN_OVERVIEW_PREFERENCE_KEYS.showLatestDevices),
      DEFAULT_ADMIN_OVERVIEW_PREFERENCES.showLatestDevices
    ),
  })
}

export function writeAdminUiPreferences(preferences = {}) {
  const normalized = normalizeAdminUiPreferences({
    ...readAdminUiPreferences(),
    ...preferences,
  })

  setStoredValue(ADMIN_UI_PREFERENCE_KEYS.accent, normalized.accent)
  setStoredValue(ADMIN_UI_PREFERENCE_KEYS.density, normalized.density)
  setStoredValue(
    ADMIN_UI_PREFERENCE_KEYS.reduceMotion,
    String(normalized.reduceMotion)
  )
  setStoredValue(
    ADMIN_UI_PREFERENCE_KEYS.compactCards,
    String(normalized.compactCards)
  )

  return normalized
}

export function writeAdminOverviewPreferences(preferences = {}) {
  const normalized = normalizeAdminOverviewPreferences({
    ...readAdminOverviewPreferences(),
    ...preferences,
  })

  setStoredValue(
    ADMIN_OVERVIEW_PREFERENCE_KEYS.showSummaryCards,
    String(normalized.showSummaryCards)
  )
  setStoredValue(
    ADMIN_OVERVIEW_PREFERENCE_KEYS.showRecentUsers,
    String(normalized.showRecentUsers)
  )
  setStoredValue(
    ADMIN_OVERVIEW_PREFERENCE_KEYS.showLatestDevices,
    String(normalized.showLatestDevices)
  )

  return normalized
}

export function applyAdminUiPreferences(
  preferences = readAdminUiPreferences()
) {
  const normalized = normalizeAdminUiPreferences(preferences)

  if (typeof document === 'undefined') return normalized

  const root = document.documentElement
  root.setAttribute('data-accent', normalized.accent)
  root.setAttribute('data-density', normalized.density)
  root.setAttribute(
    'data-reduce-motion',
    normalized.reduceMotion ? 'true' : 'false'
  )
  root.setAttribute(
    'data-compact-cards',
    normalized.compactCards ? 'true' : 'false'
  )

  return normalized
}

export function broadcastAdminSettingsChanged({
  ui = readAdminUiPreferences(),
  overview = readAdminOverviewPreferences(),
} = {}) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent(ADMIN_SETTINGS_EVENT, {
      detail: {
        ui: normalizeAdminUiPreferences(ui),
        overview: normalizeAdminOverviewPreferences(overview),
      },
    })
  )
}

export function getAccentLabel(value) {
  return (
    ACCENT_OPTIONS.find((option) => option.value === value)?.label ||
    ACCENT_OPTIONS[0].label
  )
}

export function getDensityLabel(value) {
  return (
    DENSITY_OPTIONS.find((option) => option.value === value)?.label ||
    DENSITY_OPTIONS[0].label
  )
}
