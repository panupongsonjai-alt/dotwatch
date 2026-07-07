const PROFILE_KEYS = {
  role: 'userRole',
  theme: 'theme',
  language: 'language',
  notifications: 'notifications',
  activities: 'profileActivities',
}

export function getProfileRole() {
  return localStorage.getItem(PROFILE_KEYS.role) || 'Admin'
}

export function saveProfileRole(role) {
  localStorage.setItem(PROFILE_KEYS.role, role)
}

export function getProfileTheme() {
  return localStorage.getItem(PROFILE_KEYS.theme) || 'dark'
}

export function saveProfileTheme(theme) {
  localStorage.setItem(PROFILE_KEYS.theme, theme)
  document.documentElement.setAttribute('data-theme', theme)
}

export function getProfileLanguage() {
  return localStorage.getItem(PROFILE_KEYS.language) || 'th'
}

export function saveProfileLanguage(language) {
  localStorage.setItem(PROFILE_KEYS.language, language)
}

export function getProfileNotifications() {
  const fallback = {
    emailAlerts: true,
    offlineAlerts: true,
    criticalAlerts: true,
    weeklyReport: false,
  }

  try {
    const saved = localStorage.getItem(PROFILE_KEYS.notifications)
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback
  } catch {
    return fallback
  }
}

export function saveProfileNotifications(notifications) {
  localStorage.setItem(
    PROFILE_KEYS.notifications,
    JSON.stringify(notifications)
  )
}

export function getProfileActivities() {
  try {
    const saved = localStorage.getItem(PROFILE_KEYS.activities)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export function addProfileActivity(text) {
  const activities = getProfileActivities()

  const next = [
    {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      text,
      time: new Date().toISOString(),
    },
    ...activities,
  ].slice(0, 10)

  localStorage.setItem(PROFILE_KEYS.activities, JSON.stringify(next))

  return next
}

export function clearProfileActivities() {
  localStorage.removeItem(PROFILE_KEYS.activities)
  return []
}

export function getBrowserName() {
  const agent = navigator.userAgent

  if (agent.includes('Edg')) return 'Microsoft Edge'
  if (agent.includes('Chrome')) return 'Google Chrome'
  if (agent.includes('Firefox')) return 'Firefox'
  if (agent.includes('Safari')) return 'Safari'

  return 'Unknown Browser'
}

export function getOperatingSystem() {
  const agent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  if (agent.includes('android')) return 'Android'
  if (agent.includes('iphone') || agent.includes('ipad')) return 'iOS'
  if (platform.includes('win')) return 'Windows'
  if (platform.includes('mac')) return 'macOS'
  if (platform.includes('linux')) return 'Linux'

  return 'Unknown OS'
}
