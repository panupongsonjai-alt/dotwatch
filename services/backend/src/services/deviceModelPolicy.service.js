const DEFAULT_DECIMAL_PLACES = 2

export const LOCKED_DEVICE_MODEL_POLICIES = Object.freeze({
  esp32_dht3: Object.freeze({
    modelKey: 'esp32_dht3',
    modelName: 'dot-TH-W1',
    metrics: Object.freeze([
      Object.freeze({
        metricKey: 'metric_1',
        defaultName: 'Temperature',
        defaultType: 'temperature',
        defaultUnit: '°C',
        defaultIcon: 'Thermometer',
        sortOrder: 0,
      }),
      Object.freeze({
        metricKey: 'metric_2',
        defaultName: 'Humidity',
        defaultType: 'humidity',
        defaultUnit: '%RH',
        defaultIcon: 'Droplets',
        sortOrder: 1,
      }),
    ]),
  }),
  weather_api_demo: Object.freeze({
    modelKey: 'weather_api_demo',
    modelName: 'dot-WT-W1',
    metrics: Object.freeze([
      Object.freeze({
        metricKey: 'temperature',
        defaultName: 'Temperature',
        defaultType: 'temperature',
        defaultUnit: '°C',
        defaultIcon: 'Thermometer',
        sortOrder: 0,
      }),
      Object.freeze({
        metricKey: 'humidity',
        defaultName: 'Humidity',
        defaultType: 'humidity',
        defaultUnit: '%RH',
        defaultIcon: 'Droplets',
        sortOrder: 1,
      }),
    ]),
  }),
})

function normalizeModelKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeDecimalPlaces(value) {
  const numericValue = Number(value)

  if (!Number.isInteger(numericValue)) return DEFAULT_DECIMAL_PLACES
  return Math.min(6, Math.max(0, numericValue))
}

export function getLockedDeviceModelPolicy(modelKey = '') {
  return LOCKED_DEVICE_MODEL_POLICIES[normalizeModelKey(modelKey)] || null
}

export function isLockedDeviceModel(modelKey = '') {
  return Boolean(getLockedDeviceModelPolicy(modelKey))
}

export function enforceLockedAdminModelPayload(modelKey, payload = {}) {
  const policy = getLockedDeviceModelPolicy(modelKey)
  if (!policy) return payload

  return {
    ...payload,
    modelKey: policy.modelKey,
    modelName: policy.modelName,
    metricCount: policy.metrics.length,
    metrics: policy.metrics.map((definition) => {
      return {
        metricKey: definition.metricKey,
        defaultName: definition.defaultName,
        defaultType: definition.defaultType,
        defaultUnit: definition.defaultUnit,
        defaultIcon: definition.defaultIcon,
        sortOrder: definition.sortOrder,
      }
    }),
  }
}

export function enforceLockedDeviceMetrics(modelKey, metrics = []) {
  const policy = getLockedDeviceModelPolicy(modelKey)
  if (!policy) return metrics

  const incomingMetrics = Array.isArray(metrics) ? metrics : []

  return policy.metrics.map((definition, index) => {
    const incoming =
      incomingMetrics.find(
        (metric) =>
          String(metric.metric_key || metric.metricKey || '').trim() ===
          definition.metricKey
      ) || incomingMetrics[index] || {}

    return {
      ...incoming,
      metric_key: definition.metricKey,
      source_key: definition.metricKey,
      metric_name: definition.defaultName,
      metric_type: definition.defaultType,
      unit: definition.defaultUnit,
      icon: definition.defaultIcon,
      visible: incoming.visible !== false,
      sort_order: definition.sortOrder,
      decimal_places: normalizeDecimalPlaces(
        incoming.decimal_places ?? incoming.decimalPlaces
      ),
    }
  })
}
