import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getCompactDataOverviewDefinition,
  isCompactDataOverviewModel,
  mergeCompactDataOverviewMetrics,
} from '../apps/dashboard/src/utils/dataOverviewModelUtils.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..')
const dashboardPath = path.join(
  repositoryRoot,
  'apps/dashboard/src/pages/Dashboard.jsx'
)
const stylePath = path.join(
  repositoryRoot,
  'apps/dashboard/src/styles/data-overview-combined-card.css'
)

const espDevice = {
  model_key: 'esp32_dht3',
  model_name: 'dot-TH-W1',
}
const weatherDevice = {
  model_key: 'weather_api_demo',
  model_name: 'dot-WT-W1',
}
const legacyEspDevice = { model_name: 'ESP32-DHT3' }
const legacyWeatherDevice = { model_name: 'Weather API Demo' }
const otherDevice = { model_key: 'raspberry_pi' }

assert.equal(isCompactDataOverviewModel(espDevice), true)
assert.equal(isCompactDataOverviewModel(weatherDevice), true)
assert.equal(isCompactDataOverviewModel(legacyEspDevice), true)
assert.equal(isCompactDataOverviewModel(legacyWeatherDevice), true)
assert.equal(isCompactDataOverviewModel(otherDevice), false)
assert.equal(getCompactDataOverviewDefinition(espDevice)?.modelKey, 'esp32_dht3')
assert.equal(
  getCompactDataOverviewDefinition(weatherDevice)?.modelKey,
  'weather_api_demo'
)

const espMetrics = mergeCompactDataOverviewMetrics(espDevice, [])
assert.equal(espMetrics.length, 2)
assert.deepEqual(
  espMetrics.map(({ metric_name, unit, icon }) => ({
    metric_name,
    unit,
    icon,
  })),
  [
    { metric_name: 'Temperature', unit: '°C', icon: 'Thermometer' },
    { metric_name: 'Humidity', unit: '%RH', icon: 'Droplets' },
  ]
)

const dashboardSource = fs.readFileSync(dashboardPath, 'utf8')
const styleSource = fs.readFileSync(stylePath, 'utf8')

assert.match(dashboardSource, /group\.compactOverview/)
assert.match(dashboardSource, /live-metric-device-group--compact-model/)
assert.match(dashboardSource, /live-metric-device-group--full-width/)
assert.match(dashboardSource, /group\.metrics\.map\(\(metric\)/)
assert.doesNotMatch(dashboardSource, /live-metric-overview-card--combined/)
assert.doesNotMatch(dashboardSource, /live-metric-combined-values/)

assert.match(
  styleSource,
  /\.live-metrics-device-groups--compact-models\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s
)
assert.match(
  styleSource,
  /\.live-metric-device-group--compact-model \.live-metrics-overview-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s
)
assert.match(styleSource, /@media \(max-width: 860px\)/)
assert.match(styleSource, /@media \(max-width: 520px\)/)

console.log('Data Overview compact model pair verification passed.')
