export const DEFAULT_METRICS = [
  {
    metric_key: 'metric_1',
    metric_name: 'Temperature',
    metric_type: 'temperature',
    unit: '°C',
    icon: 'Thermometer',
    visible: true,
    sort_order: 0,
  },
  {
    metric_key: 'metric_2',
    metric_name: 'Humidity',
    metric_type: 'humidity',
    unit: '%',
    icon: 'Droplets',
    visible: true,
    sort_order: 1,
  },
  {
    metric_key: 'metric_3',
    metric_name: 'Signal',
    metric_type: 'signal',
    unit: 'dBm',
    icon: 'Wifi',
    visible: true,
    sort_order: 2,
  },
]

export const METRIC_ICON_OPTIONS = [
  'Activity',
  'Thermometer',
  'Droplets',
  'Gauge',
  'Zap',
  'Battery',
  'Wifi',
  'Wind',
  'Power',
  'Cpu',
]

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
  }
}

export function normalizeMetrics(metrics = []) {
  return metrics.map(normalizeMetric)
}

export function prepareMetricsForSave(metrics = []) {
  return metrics
    .map((metric, index) => ({
      ...metric,

      metric_key: metric.metric_key || `metric_${index + 1}`,

      metric_name: String(metric.metric_name || '').trim(),

      metric_type: String(metric.metric_type || '').trim(),

      sort_order: index,
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

export function formatMetricValue(value, unit = '') {
  if (value == null || value === '') return '--'

  const number = Number(value)

  const displayValue = Number.isFinite(number)
    ? Number.isInteger(number)
      ? String(number)
      : number.toFixed(1)
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
    ? config.metrics
    : DEFAULT_METRICS
}

export function getMetricMeta(metricKey, metricConfigs = []) {
  const allMetrics = [
    ...DEFAULT_METRICS,
    ...metricConfigs.flatMap((config) =>
      Array.isArray(config.metrics) ? config.metrics : []
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
