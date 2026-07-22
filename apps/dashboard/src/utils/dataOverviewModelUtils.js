const COMPACT_DATA_OVERVIEW_MODELS = Object.freeze({
  esp32_dht3: Object.freeze({
    modelKey: 'esp32_dht3',
    modelNames: Object.freeze(['dot-th-w1', 'esp32-dht3']),
    metrics: Object.freeze([
      Object.freeze({
        metric_key: 'metric_1',
        source_key: 'metric_1',
        metric_name: 'Temperature',
        metric_type: 'temperature',
        unit: '°C',
        icon: 'Thermometer',
        sort_order: 0,
        decimal_places: 2,
        visible: true,
      }),
      Object.freeze({
        metric_key: 'metric_2',
        source_key: 'metric_2',
        metric_name: 'Humidity',
        metric_type: 'humidity',
        unit: '%RH',
        icon: 'Droplets',
        sort_order: 1,
        decimal_places: 2,
        visible: true,
      }),
    ]),
  }),
  weather_api_demo: Object.freeze({
    modelKey: 'weather_api_demo',
    modelNames: Object.freeze(['dot-wt-w1', 'weather api demo']),
    metrics: Object.freeze([
      Object.freeze({
        metric_key: 'temperature',
        source_key: 'temperature',
        metric_name: 'Temperature',
        metric_type: 'temperature',
        unit: '°C',
        icon: 'Thermometer',
        sort_order: 0,
        decimal_places: 2,
        visible: true,
      }),
      Object.freeze({
        metric_key: 'humidity',
        source_key: 'humidity',
        metric_name: 'Humidity',
        metric_type: 'humidity',
        unit: '%RH',
        icon: 'Droplets',
        sort_order: 1,
        decimal_places: 2,
        visible: true,
      }),
    ]),
  }),
})

function normalizeValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

function getDeviceModelKey(device = {}) {
  return normalizeValue(
    device.model_key ||
      device.modelKey ||
      device.device_model_key ||
      device.deviceModelKey
  )
}

function getDeviceModelName(device = {}) {
  return normalizeValue(device.model_name || device.modelName)
}

export function getCompactDataOverviewDefinition(device = {}) {
  const modelKey = getDeviceModelKey(device)

  if (COMPACT_DATA_OVERVIEW_MODELS[modelKey]) {
    return COMPACT_DATA_OVERVIEW_MODELS[modelKey]
  }

  const modelName = getDeviceModelName(device)

  return (
    Object.values(COMPACT_DATA_OVERVIEW_MODELS).find((definition) =>
      definition.modelNames.some((name) => modelName.includes(name))
    ) || null
  )
}

export function isCompactDataOverviewModel(device = {}) {
  return Boolean(getCompactDataOverviewDefinition(device))
}

export function mergeCompactDataOverviewMetrics(device = {}, metrics = []) {
  const definition = getCompactDataOverviewDefinition(device)

  if (!definition) return Array.isArray(metrics) ? metrics : []

  const incomingMetrics = Array.isArray(metrics) ? metrics : []

  return definition.metrics.map((fallbackMetric, index) => {
    const existingMetric =
      incomingMetrics.find((metric) => {
        const metricKey = normalizeValue(
          metric.metric_key ||
            metric.metricKey ||
            metric.source_key ||
            metric.key
        )

        return metricKey === fallbackMetric.metric_key
      }) || incomingMetrics[index] || {}

    return {
      ...existingMetric,
      ...fallbackMetric,
      visible: existingMetric.visible !== false,
      decimal_places:
        existingMetric.decimal_places ??
        existingMetric.decimalPlaces ??
        fallbackMetric.decimal_places,
    }
  })
}

export { COMPACT_DATA_OVERVIEW_MODELS }
