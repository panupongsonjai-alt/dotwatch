export const ESP32_DHT3_MODEL_KEY = 'esp32_dht3'

export const ESP32_DHT3_METRICS = [
  {
    metric_key: 'metric_1',
    metric_name: 'Temperature',
    short_label: 'Temp',
    metric_type: 'temperature',
    unit: '°C',
    icon: 'Thermometer',
    visible: true,
    sort_order: 0,
  },
  {
    metric_key: 'metric_2',
    metric_name: 'Humidity',
    short_label: 'Hum',
    metric_type: 'humidity',
    unit: '%',
    icon: 'Droplets',
    visible: true,
    sort_order: 1,
  },
]

export function isEsp32Dht3Device(device = {}) {
  const modelKey = String(
    device.model_key ||
      device.modelKey ||
      device.device_model_key ||
      device.model ||
      ''
  ).toLowerCase()

  const modelName = String(device.model_name || device.modelName || '').toLowerCase()

  return modelKey === ESP32_DHT3_MODEL_KEY || modelName.includes('esp32-dht3')
}

export function getEsp32DefaultPinHint(device = {}) {
  const code = String(device.device_code || device.deviceCode || '')
    .replace(/[-_\s]/g, '')
    .trim()

  if (code.length >= 6) {
    return code.slice(-6)
  }

  return '123456'
}

export function getLatestMetrics(device = {}) {
  return {
    ...(device.latest_metrics || {}),
    ...(device.metrics || {}),
    ...(device.latest || {}),
    ...(device.latest_reading || {}),
    ...(device.reading || {}),
  }
}

export function getMetricValueFromAnyShape(device = {}, metricKey) {
  const latestMetrics = getLatestMetrics(device)

  if (latestMetrics[metricKey] != null) return latestMetrics[metricKey]
  if (device[metricKey] != null) return device[metricKey]

  if (metricKey === 'metric_1' && device.temperature != null) {
    return device.temperature
  }

  if (metricKey === 'metric_2' && device.humidity != null) {
    return device.humidity
  }

  return null
}

export function formatEsp32MetricValue(value, unit = '') {
  if (value == null || value === '') return '--'

  const numberValue = Number(value)
  const displayValue = Number.isFinite(numberValue)
    ? Number.isInteger(numberValue)
      ? String(numberValue)
      : numberValue.toFixed(1)
    : String(value)

  return unit ? `${displayValue} ${unit}` : displayValue
}

export function getVisibleMetricsForDevice(device = {}, metrics = []) {
  if (!isEsp32Dht3Device(device)) {
    return Array.isArray(metrics) ? metrics : []
  }

  const incomingMetrics = Array.isArray(metrics) ? metrics : []

  return ESP32_DHT3_METRICS.map((fallbackMetric) => {
    const existing = incomingMetrics.find(
      (metric) => metric.metric_key === fallbackMetric.metric_key
    )

    return {
      ...fallbackMetric,
      ...(existing || {}),
      metric_name:
        existing?.metric_name ||
        existing?.name ||
        fallbackMetric.metric_name,
      metric_type:
        existing?.metric_type ||
        existing?.type ||
        fallbackMetric.metric_type,
      unit: existing?.unit ?? fallbackMetric.unit,
      icon: existing?.icon || fallbackMetric.icon,
      visible: existing?.visible !== false,
    }
  }).filter((metric) => metric.visible !== false)
}

export function getDeviceMetricPills(device = {}, limit = 3) {
  if (isEsp32Dht3Device(device)) {
    return ESP32_DHT3_METRICS.map((metric) => {
      const value = getMetricValueFromAnyShape(device, metric.metric_key)

      return {
        key: metric.metric_key,
        label: metric.short_label || metric.metric_name,
        name: metric.metric_name,
        unit: metric.unit,
        value,
        displayValue: formatEsp32MetricValue(value, metric.unit),
      }
    })
      .filter((metric) => metric.value !== null && metric.value !== undefined)
      .slice(0, limit)
  }

  const latestMetrics = getLatestMetrics(device)

  if (device.temperature != null && latestMetrics.temperature == null) {
    latestMetrics.temperature = device.temperature
  }

  if (device.humidity != null && latestMetrics.humidity == null) {
    latestMetrics.humidity = device.humidity
  }

  return Object.entries(latestMetrics)
    .filter(([metricKey]) => metricKey !== 'rssi' && metricKey !== 'wifi_rssi')
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([keyA], [keyB]) => getFallbackMetricIndex(keyA) - getFallbackMetricIndex(keyB))
    .slice(0, limit)
    .map(([metricKey, value]) => ({
      key: metricKey,
      label: getFallbackMetricLabel(metricKey),
      name: getFallbackMetricLabel(metricKey),
      value,
      displayValue: formatEsp32MetricValue(value),
    }))
}

function getFallbackMetricIndex(metricKey = '') {
  const index = Number(String(metricKey).replace(/[^0-9]/g, ''))

  if (Number.isFinite(index) && index > 0) return index
  if (metricKey === 'temperature') return 1
  if (metricKey === 'humidity') return 2

  return 9999
}

function getFallbackMetricLabel(metricKey = '') {
  if (metricKey === 'temperature') return 'Temp'
  if (metricKey === 'humidity') return 'Hum'

  const index = getFallbackMetricIndex(metricKey)
  return index > 0 && index < 999 ? `M${index}` : metricKey
}
