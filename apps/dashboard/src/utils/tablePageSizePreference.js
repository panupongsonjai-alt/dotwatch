export const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export const TABLE_PAGE_SIZE_STORAGE_KEYS = {
  alarms: 'dotwatch:table-page-size:alarms',
  notifications: 'dotwatch:table-page-size:notifications',
  activity: 'dotwatch:table-page-size:activity',
}

export function readTablePageSize(storageKey, fallback = 20) {
  if (typeof window === 'undefined') return fallback

  try {
    const storedValue = Number(window.localStorage.getItem(storageKey))
    return TABLE_PAGE_SIZE_OPTIONS.includes(storedValue) ? storedValue : fallback
  } catch {
    return fallback
  }
}

export function writeTablePageSize(storageKey, pageSize) {
  if (
    typeof window === 'undefined' ||
    !TABLE_PAGE_SIZE_OPTIONS.includes(Number(pageSize))
  ) {
    return
  }

  try {
    window.localStorage.setItem(storageKey, String(pageSize))
  } catch {
    // Keep the selected value for this session when storage is unavailable.
  }
}
