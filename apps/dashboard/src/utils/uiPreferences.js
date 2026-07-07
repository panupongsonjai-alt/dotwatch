export const UI_PREFERENCE_EVENT = 'dotwatchUiSettingsChanged'

export const UI_PREFERENCE_KEYS = {
  accent: 'dotwatchAccent',
  density: 'dotwatchDensity',
  reduceMotion: 'dotwatchReduceMotion',
  compactCards: 'dotwatchCompactCards',
}

export const ACCENT_OPTIONS = [
  { value: 'blue', label: 'Blue', color: '#2563eb' },
  { value: 'sky', label: 'Sky', color: '#0ea5e9' },
  { value: 'cyan', label: 'Cyan', color: '#06b6d4' },
  { value: 'teal', label: 'Teal', color: '#14b8a6' },
  { value: 'emerald', label: 'Emerald', color: '#10b981' },
  { value: 'lime', label: 'Lime', color: '#84cc16' },
  { value: 'amber', label: 'Amber', color: '#f59e0b' },
  { value: 'orange', label: 'Orange', color: '#f97316' },
  { value: 'red', label: 'dotWatch Red', color: '#ef4444' },
  { value: 'rose', label: 'Rose', color: '#f43f5e' },
  { value: 'pink', label: 'Pink', color: '#ec4899' },
  { value: 'violet', label: 'Violet', color: '#8b5cf6' },
  { value: 'indigo', label: 'Indigo', color: '#6366f1' },
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

export const DEFAULT_UI_PREFERENCES = {
  accent: 'blue',
  density: 'comfortable',
  reduceMotion: false,
  compactCards: false,
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
    // Ignore private browsing / quota errors. UI still updates for this session.
  }
}

function parseBooleanPreference(value, fallback = false) {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function normalizeUiPreferences(preferences = {}) {
  const nextAccent = ACCENT_VALUES.has(preferences.accent)
    ? preferences.accent
    : DEFAULT_UI_PREFERENCES.accent

  const nextDensity = DENSITY_VALUES.has(preferences.density)
    ? preferences.density
    : DEFAULT_UI_PREFERENCES.density

  return {
    accent: nextAccent,
    density: nextDensity,
    reduceMotion: Boolean(preferences.reduceMotion),
    compactCards: Boolean(preferences.compactCards),
  }
}

export function readUiPreferences() {
  return normalizeUiPreferences({
    accent: getStoredValue(UI_PREFERENCE_KEYS.accent) || DEFAULT_UI_PREFERENCES.accent,
    density: getStoredValue(UI_PREFERENCE_KEYS.density) || DEFAULT_UI_PREFERENCES.density,
    reduceMotion: parseBooleanPreference(
      getStoredValue(UI_PREFERENCE_KEYS.reduceMotion),
      DEFAULT_UI_PREFERENCES.reduceMotion
    ),
    compactCards: parseBooleanPreference(
      getStoredValue(UI_PREFERENCE_KEYS.compactCards),
      DEFAULT_UI_PREFERENCES.compactCards
    ),
  })
}

export function writeUiPreferences(preferences = {}) {
  const normalizedPreferences = normalizeUiPreferences({
    ...readUiPreferences(),
    ...preferences,
  })

  setStoredValue(UI_PREFERENCE_KEYS.accent, normalizedPreferences.accent)
  setStoredValue(UI_PREFERENCE_KEYS.density, normalizedPreferences.density)
  setStoredValue(
    UI_PREFERENCE_KEYS.reduceMotion,
    String(normalizedPreferences.reduceMotion)
  )
  setStoredValue(
    UI_PREFERENCE_KEYS.compactCards,
    String(normalizedPreferences.compactCards)
  )

  return normalizedPreferences
}

export function applyUiPreferences(preferences = readUiPreferences()) {
  if (typeof document === 'undefined') {
    return normalizeUiPreferences(preferences)
  }

  const normalizedPreferences = normalizeUiPreferences(preferences)
  const root = document.documentElement

  root.setAttribute('data-accent', normalizedPreferences.accent)
  root.setAttribute('data-density', normalizedPreferences.density)
  root.setAttribute(
    'data-reduce-motion',
    normalizedPreferences.reduceMotion ? 'true' : 'false'
  )
  root.setAttribute(
    'data-compact-cards',
    normalizedPreferences.compactCards ? 'true' : 'false'
  )

  return normalizedPreferences
}

export function broadcastUiPreferencesChanged(detail = readUiPreferences()) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent(UI_PREFERENCE_EVENT, {
      detail: normalizeUiPreferences(detail),
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
