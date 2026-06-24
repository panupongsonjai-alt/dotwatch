export function formatDate(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

export function formatShortTime(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '--'
  }
}

export function getStatusLabel(status) {
  if (status === 'online') return 'Online'
  if (status === 'warning') return 'Warning'
  if (status === 'critical') return 'Critical'
  return 'Offline'
}

export function getDeviceHealthLabel(status) {
  if (status === 'online') return 'Healthy'
  if (status === 'warning') return 'Warning'
  if (status === 'critical') return 'Critical'
  return 'Offline'
}

export function formatMetricNumber(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '--'

  const numberValue = Number(value)
  return Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(1)
}

export function getMetricValueFromDevice(device, metric) {
  const latestMetrics = device?.latest_metrics || {}
  const metricValues = device?.metrics || {}

  if (latestMetrics[metric.metric_key] != null) {
    return latestMetrics[metric.metric_key]
  }

  if (metricValues[metric.metric_key] != null) {
    return metricValues[metric.metric_key]
  }

  if (device?.[metric.metric_key] != null) {
    return device[metric.metric_key]
  }

  return null
}

export function getMetricIcon(metric) {
  const key = String(metric?.metric_key || '').toLowerCase()
  const type = String(metric?.metric_type || '').toLowerCase()
  const name = String(metric?.metric_name || '').toLowerCase()
  const text = `${key} ${type} ${name}`

  if (text.includes('temp')) return '🌡️'
  if (text.includes('humid')) return '💧'
  if (text.includes('volt')) return '⚡'
  if (text.includes('power') || text.includes('watt')) return '🔌'
  if (text.includes('pressure')) return '⏱️'
  if (text.includes('rssi') || text.includes('signal')) return '📶'
  if (text.includes('battery')) return '🔋'
  return '●'
}
