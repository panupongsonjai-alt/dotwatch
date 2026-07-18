export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0))
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(0)}%`
}

export function getDeviceUsagePercent(user) {
  if (!user?.deviceLimit) return 0

  return Math.min(100, (Number(user.deviceCount || 0) / user.deviceLimit) * 100)
}

export function formatDatabaseUsageGb(value) {
  const bytes = Number(value || 0)

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0.000 GB'
  }

  const gigabytes = bytes / 1073741824
  const fractionDigits = gigabytes >= 10 ? 2 : gigabytes >= 1 ? 3 : 6

  return `${gigabytes.toFixed(fractionDigits)} GB`
}

