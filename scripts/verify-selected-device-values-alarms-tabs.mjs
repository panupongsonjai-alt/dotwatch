import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()

function read(relativePath) {
  const filePath = path.join(repoRoot, relativePath)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${relativePath}`)
  }
  return fs.readFileSync(filePath, 'utf8')
}

function requireText(content, token, label) {
  if (!content.includes(token)) {
    throw new Error(`Missing ${label}: ${token}`)
  }
}

function forbidText(content, token, label) {
  if (content.includes(token)) {
    throw new Error(`Unexpected ${label}: ${token}`)
  }
}

const selectedDevicePanel = read(
  'apps/dashboard/src/components/devices/SelectedDevicePanel.jsx'
)
const metricConfigPanel = read(
  'apps/dashboard/src/components/MetricConfigPanel.jsx'
)
const main = read('apps/dashboard/src/main.jsx')
const css = read(
  'apps/dashboard/src/styles/selected-device-values-alarms-tabs.css'
)

requireText(
  selectedDevicePanel,
  "{ key: 'values', label: 'Values' }",
  'Values tab'
)
requireText(
  selectedDevicePanel,
  "{ key: 'alarms', label: 'Alarms' }",
  'Alarms tab'
)
requireText(
  selectedDevicePanel,
  "activeTab === 'values'",
  'Values tab panel'
)
requireText(
  selectedDevicePanel,
  "activeTab === 'alarms'",
  'Alarms tab panel'
)
requireText(selectedDevicePanel, 'mode="values"', 'Values panel mode')
requireText(selectedDevicePanel, 'mode="alarms"', 'Alarms panel mode')
requireText(
  selectedDevicePanel,
  'แสดงทุก Value จากแท็บ Values',
  'Alarm source description'
)
forbidText(
  selectedDevicePanel,
  "{ key: 'metrics', label: 'Values & Alarms' }",
  'combined Values & Alarms tab'
)
forbidText(
  selectedDevicePanel,
  "activeTab === 'metrics'",
  'combined metrics tab panel'
)

requireText(metricConfigPanel, "mode = 'values'", 'mode prop default')
requireText(
  metricConfigPanel,
  "const isAlarmMode = mode === 'alarms'",
  'Alarm mode switch'
)
requireText(
  metricConfigPanel,
  'draftMetrics.map(renderValueSettings)',
  'Values rendering from device metrics'
)
requireText(
  metricConfigPanel,
  'draftMetrics.map(renderAlarmRules)',
  'Alarms rendering for every device Value'
)
requireText(
  metricConfigPanel,
  'Alarm ทั้งหมดอ้างอิงจาก',
  'Alarm source note'
)
requireText(
  metricConfigPanel,
  'handleSaveValues',
  'separate Values save flow'
)
requireText(
  metricConfigPanel,
  'handleSaveAlarms',
  'separate Alarms save flow'
)
requireText(
  metricConfigPanel,
  "? 'Save Alarms'",
  'Alarms save button'
)
requireText(
  metricConfigPanel,
  ": 'Save Values'",
  'Values save button'
)
forbidText(
  metricConfigPanel,
  'draftMetrics.filter((metric) => metric.visible !== false)',
  'filter that would hide Values from Alarms'
)

requireText(
  main,
  "import './styles/selected-device-values-alarms-tabs.css'",
  'split-tabs stylesheet import'
)
requireText(css, '.metric-config-panel--values', 'Values mode styles')
requireText(css, '.metric-config-panel--alarms', 'Alarms mode styles')
requireText(css, '.metric-alarm-value-reference', 'Alarm Value reference card')
requireText(css, '.devices-v3-values-panel', 'Values panel layout')
requireText(css, '.devices-v3-alarms-panel', 'Alarms panel layout')

console.log('PASS: Selected Device uses separate Values and Alarms tabs.')
console.log('PASS: Alarms renders every Value from the shared device metric source.')
console.log('PASS: Values and Alarms have independent save/reset flows.')
console.log('PASS: Split-tab responsive styles and stylesheet import are present.')
