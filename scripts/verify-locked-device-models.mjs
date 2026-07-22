import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  enforceLockedAdminModelPayload,
  enforceLockedDeviceMetrics,
  getLockedDeviceModelPolicy,
} from '../services/backend/src/services/deviceModelPolicy.service.js'

const expectedModels = [
  {
    modelKey: 'esp32_dht3',
    modelName: 'dot-TH-W1',
    metricKeys: ['metric_1', 'metric_2'],
    icons: ['Thermometer', 'Droplets'],
  },
  {
    modelKey: 'weather_api_demo',
    modelName: 'dot-WT-W1',
    metricKeys: ['temperature', 'humidity'],
    icons: ['Thermometer', 'Droplets'],
  },
]

for (const expected of expectedModels) {
  const policy = getLockedDeviceModelPolicy(expected.modelKey)
  assert.ok(policy, `Missing policy for ${expected.modelKey}`)
  assert.equal(policy.modelName, expected.modelName)
  assert.equal(policy.metrics.length, 2)
  assert.deepEqual(
    policy.metrics.map((metric) => metric.metricKey),
    expected.metricKeys
  )
  assert.deepEqual(
    policy.metrics.map((metric) => metric.defaultName),
    ['Temperature', 'Humidity']
  )
  assert.deepEqual(
    policy.metrics.map((metric) => metric.defaultUnit),
    ['°C', '%RH']
  )
  assert.deepEqual(
    policy.metrics.map((metric) => metric.defaultIcon),
    expected.icons
  )

  const adminPayload = enforceLockedAdminModelPayload(expected.modelKey, {
    modelKey: 'attempted_change',
    modelName: 'Attempted Change',
    metricCount: 9,
    metrics: [
      { metricKey: 'bad_1', defaultName: 'Changed', defaultUnit: 'X', defaultIcon: 'Gauge' },
      { metricKey: 'bad_2', defaultName: 'Changed', defaultUnit: 'Y', defaultIcon: 'Gauge' },
      { metricKey: 'bad_3', defaultName: 'Extra', defaultUnit: 'Z' },
    ],
  })

  assert.equal(adminPayload.modelKey, expected.modelKey)
  assert.equal(adminPayload.modelName, expected.modelName)
  assert.equal(adminPayload.metricCount, 2)
  assert.equal(adminPayload.metrics.length, 2)
  assert.deepEqual(
    adminPayload.metrics.map((metric) => metric.defaultName),
    ['Temperature', 'Humidity']
  )
  assert.deepEqual(
    adminPayload.metrics.map((metric) => metric.defaultUnit),
    ['°C', '%RH']
  )
  assert.deepEqual(
    adminPayload.metrics.map((metric) => metric.defaultIcon),
    expected.icons
  )

  const deviceMetrics = enforceLockedDeviceMetrics(expected.modelKey, [
    {
      metric_key: 'bad_1',
      metric_name: 'Changed',
      unit: 'X',
      icon: 'Gauge',
      visible: false,
      decimal_places: 3,
    },
    {
      metric_key: 'bad_2',
      metric_name: 'Changed',
      unit: 'Y',
      icon: 'Gauge',
      visible: true,
      decimal_places: 1,
    },
    {
      metric_key: 'bad_3',
      metric_name: 'Extra',
      unit: 'Z',
    },
  ])

  assert.equal(deviceMetrics.length, 2)
  assert.deepEqual(
    deviceMetrics.map((metric) => metric.metric_key),
    expected.metricKeys
  )
  assert.deepEqual(
    deviceMetrics.map((metric) => metric.metric_name),
    ['Temperature', 'Humidity']
  )
  assert.deepEqual(
    deviceMetrics.map((metric) => metric.unit),
    ['°C', '%RH']
  )
  assert.deepEqual(
    deviceMetrics.map((metric) => metric.icon),
    expected.icons
  )
}

const requiredTextChecks = [
  ['services/backend/migrations/run.js', "027_locked_temperature_humidity_models.sql"],
  ['services/backend/migrations/run.js', "028_lock_temperature_humidity_icons.sql"],
  ['services/backend/migrations/028_lock_temperature_humidity_icons.sql', "THEN 'Thermometer'"],
  ['services/backend/migrations/028_lock_temperature_humidity_icons.sql', "THEN 'Droplets'"],
  ['services/backend/migrations/027_locked_temperature_humidity_models.sql', "model_name = 'dot-TH-W1'"],
  ['services/backend/migrations/027_locked_temperature_humidity_models.sql', "model_name = 'dot-WT-W1'"],
  ['apps/dashboard/src/components/MetricConfigPanel.jsx', 'Fixed 2 Values'],
  ['apps/admin/src/pages/AdminModels.jsx', 'Fixed 2 Values'],
  ['esp32/dotwatch_esp32_product/include/FirmwareVersion.h', '#define DOTWATCH_MODEL_NAME "dot-TH-W1"'],
]

for (const [filePath, expectedText] of requiredTextChecks) {
  const content = readFileSync(filePath, 'utf8')
  assert.ok(
    content.includes(expectedText),
    `${filePath} does not contain required text: ${expectedText}`
  )
}

const syntaxTargets = [
  'services/backend/src/services/deviceModelPolicy.service.js',
  'services/backend/src/controllers/admin.controller.js',
  'services/backend/src/controllers/deviceMetricsController.js',
  'services/backend/src/controllers/deviceModelsController.js',
  'services/backend/src/controllers/devices.controller.js',
  'services/backend/migrations/run.js',
  'apps/admin/src/services/adminApi.js',
]

for (const filePath of syntaxTargets) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8',
  })

  assert.equal(
    result.status,
    0,
    `Syntax check failed for ${filePath}:\n${result.stderr || result.stdout}`
  )
}

console.log('PASS: dot-TH-W1 and dot-WT-W1 are fixed to exactly two values.')
console.log('PASS: Value names, units, and icons are canonicalized by the backend.')
console.log('PASS: Dashboard/Admin lock controls and migration wiring are present.')
console.log('PASS: Modified backend JavaScript files pass node --check.')
