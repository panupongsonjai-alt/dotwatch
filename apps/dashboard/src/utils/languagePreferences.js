export const DASHBOARD_LANGUAGE_KEY = 'dotwatchLanguage'
export const DASHBOARD_LANGUAGE_EVENT = 'dotwatchLanguageChanged'

export const LANGUAGE_OPTIONS = [
  { value: 'th', label: 'ไทย (TH)' },
  { value: 'en', label: 'English (EN)' },
]

export function normalizeLanguage(value) {
  return value === 'en' ? 'en' : 'th'
}

export function readLanguage() {
  if (typeof window === 'undefined') return 'th'
  try {
    return normalizeLanguage(window.localStorage.getItem(DASHBOARD_LANGUAGE_KEY))
  } catch {
    return 'th'
  }
}

export function applyLanguage(value) {
  const language = normalizeLanguage(value)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
    document.documentElement.setAttribute('data-language', language)
  }
  return language
}

export function writeLanguage(value) {
  const language = applyLanguage(value)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DASHBOARD_LANGUAGE_KEY, language)
    } catch {
      // Storage can be unavailable in private browsing. Keep the session usable.
    }
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_LANGUAGE_EVENT, { detail: { language } })
    )
  }
  return language
}

export function languageText(language, th, en) {
  return normalizeLanguage(language) === 'en' ? en : th
}
