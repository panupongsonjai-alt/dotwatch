export const DEFAULT_METRICS = [
  {
    metric_key: 'metric_1',
    metric_name: 'Temperature',
    metric_type: 'temperature',
    unit: '°C',
    icon: 'Thermometer',
    visible: true,
    sort_order: 0,
    decimal_places: 2,
  },
  {
    metric_key: 'metric_2',
    metric_name: 'Humidity',
    metric_type: 'humidity',
    unit: '%',
    icon: 'Droplets',
    visible: true,
    sort_order: 1,
    decimal_places: 2,
  },
]

export { METRIC_ICON_OPTIONS } from './metricIcons.jsx'


export function isWifiRssiMetricConfig(metric = {}) {
  const metricKey = String(
    metric.metric_key || metric.metricKey || metric.source_key || metric.key || ''
  ).trim().toLowerCase()
  const metricName = String(metric.metric_name || metric.name || '').trim().toLowerCase()
  const metricType = String(metric.metric_type || metric.type || '').trim().toLowerCase()
  const unit = String(metric.unit || '').trim().toLowerCase()
  const icon = String(metric.icon || '').trim().toLowerCase()

  return (
    metricKey === 'rssi' ||
    metricKey === 'wifi_rssi' ||
    metricName.includes('wifi rssi') ||
    metricName === 'rssi' ||
    (metricType === 'signal' && unit === 'dbm') ||
    (icon === 'wifi' && unit === 'dbm')
  )
}

export function normalizeMetricKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function normalizeMetricType(value = '') {
  return normalizeMetricKey(value)
}

export function createBlankMetric(index = 0) {
  return {
    metric_key: `metric_${index + 1}`,
    metric_name: '',
    metric_type: '',
    unit: '',
    icon: 'Activity',
    visible: true,
    sort_order: index,
    decimal_places: 2,
  }
}

export function normalizeMetric(metric, index = 0) {
  return {
    id: metric.id,
    metric_key: metric.metric_key || metric.key || `metric_${index + 1}`,

    metric_name: String(metric.metric_name || metric.name || '').trim(),

    metric_type: String(metric.metric_type || metric.type || '').trim(),

    unit: String(metric.unit || '').trim(),

    icon: String(metric.icon || 'Activity').trim(),

    visible: metric.visible !== false,

    sort_order: Number.isFinite(Number(metric.sort_order))
      ? Number(metric.sort_order)
      : index,

    decimal_places: Number.isInteger(Number(metric.decimal_places ?? metric.decimalPlaces))
      ? Math.min(6, Math.max(0, Number(metric.decimal_places ?? metric.decimalPlaces)))
      : 2,
  }
}

export function normalizeMetrics(metrics = []) {
  return metrics
    .filter((metric) => !isWifiRssiMetricConfig(metric))
    .map(normalizeMetric)
}

export function prepareMetricsForSave(metrics = []) {
  return metrics
    .filter((metric) => !isWifiRssiMetricConfig(metric))
    .map((metric, index) => ({
      ...metric,

      metric_key: metric.metric_key || `metric_${index + 1}`,

      metric_name: String(metric.metric_name || '').trim(),

      metric_type: String(metric.metric_type || '').trim(),

      sort_order: index,

      decimal_places: Number.isInteger(Number(metric.decimal_places))
        ? Math.min(6, Math.max(0, Number(metric.decimal_places)))
        : 2,
    }))
    .filter((metric) => metric.metric_name && metric.metric_key)
}

export function getVisibleMetrics(metrics = []) {
  return normalizeMetrics(metrics)
    .filter((metric) => metric.visible)
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function getMetricValue(device, metric) {
  if (!device || !metric) return null

  const key = metric.metric_key

  if (device[key] != null) return device[key]

  if (device.latest?.[key] != null) return device.latest[key]

  if (device.reading?.[key] != null) return device.reading[key]

  if (device.latest_reading?.[key] != null) return device.latest_reading[key]

  return null
}

export function normalizeDecimalPlaces(value, fallback = 2) {
  const decimals = Number(value)

  if (!Number.isInteger(decimals)) return fallback

  return Math.min(6, Math.max(0, decimals))
}

export function formatMetricValue(value, unit = '', decimalPlaces = 2) {
  if (value == null || value === '') return '--'

  const number = Number(value)
  const decimals = normalizeDecimalPlaces(decimalPlaces)
  const displayValue = Number.isFinite(number)
    ? number.toFixed(decimals)
    : String(value)

  return unit ? `${displayValue} ${unit}` : displayValue
}

export function getDeviceMetricConfig(device, metricConfigs = []) {
  const deviceId = device?.id || device?.device_id || device?.device_code

  if (!deviceId) return DEFAULT_METRICS

  const config = metricConfigs.find(
    (item) =>
      String(item.device_id) === String(deviceId) ||
      String(item.deviceId) === String(deviceId)
  )

  return Array.isArray(config?.metrics) && config.metrics.length > 0
    ? normalizeMetrics(config.metrics)
    : DEFAULT_METRICS
}

export function getMetricMeta(metricKey, metricConfigs = []) {
  const allMetrics = [
    ...DEFAULT_METRICS,
    ...metricConfigs.flatMap((config) =>
      Array.isArray(config.metrics) ? normalizeMetrics(config.metrics) : []
    ),
  ]

  return (
    allMetrics.find((metric) => metric.metric_key === metricKey) || {
      metric_key: metricKey,
      metric_name: metricKey,
      metric_type: '',
      unit: '',
      icon: 'Activity',
      visible: true,
      sort_order: 999,
    }
  )
}
