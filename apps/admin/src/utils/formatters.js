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
