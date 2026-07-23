import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const metricPanelPath = path.join(
  repoRoot,
  'apps/dashboard/src/components/MetricConfigPanel.jsx'
)
const selectedPanelPath = path.join(
  repoRoot,
  'apps/dashboard/src/components/devices/SelectedDevicePanel.jsx'
)
const stylePath = path.join(
  repoRoot,
  'apps/dashboard/src/styles/selected-device-values-alarms-tabs.css'
)

function readRequiredFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${path.relative(repoRoot, filePath)}`)
  }

  return fs.readFileSync(filePath, 'utf8')
}

function assertContains(source, token, description) {
  if (!source.includes(token)) {
    throw new Error(`FAIL: ${description}`)
  }
}

function assertNotContains(source, token, description) {
  if (source.includes(token)) {
    throw new Error(`FAIL: ${description}`)
  }
}

const metricPanel = readRequiredFile(metricPanelPath)
const selectedPanel = readRequiredFile(selectedPanelPath)
const styles = readRequiredFile(stylePath)

assertContains(
  metricPanel,
  'metric-values-overview-card',
  'Values must render as overview-style cards.'
)
assertContains(
  metricPanel,
  'metric-values-overview-list-item',
  'Each Value field must render as an overview-style row.'
)
assertContains(
  metricPanel,
  'metric-values-overview-card-header',
  'Each Value card must include its Value identity header.'
)
assertContains(
  metricPanel,
  'metric-values-overview-table',
  'Values mode must use the overview-style table wrapper.'
)
assertNotContains(
  metricPanel,
  '<div className="metric-alarm-config-head" aria-hidden="true">',
  'The old desktop table header must be removed from Values mode.'
)
assertContains(
  metricPanel,
  "draftMetrics.length > 3 ? 'metric-alarm-config-body--scrollable' : ''",
  'Scrollbar behavior for more than three Values must remain enabled.'
)
assertContains(
  metricPanel,
  "isAlarmMode\n      ? 'metric-config-panel--alarms'",
  'The separate Alarms mode must remain intact.'
)
assertContains(
  selectedPanel,
  'แสดงและจัดการข้อมูล Value ในรูปแบบเดียวกับ Overview',
  'The Values tab description must match the new presentation.'
)

for (const requiredSelector of [
  '.metric-values-overview-card-header',
  '.metric-values-overview-list-item',
  '.metric-values-overview-list-copy > span',
  '.metric-values-overview-list-control',
  '.metric-values-overview-card-footer',
]) {
  assertContains(styles, requiredSelector, `Missing selector ${requiredSelector}`)
}

assertContains(
  styles,
  'grid-template-columns: minmax(150px, 0.35fr) minmax(0, 1fr);',
  'Value rows must use the same column proportion as Overview.'
)
assertContains(
  styles,
  'min-height: 72px;',
  'Value rows must use the same minimum row height as Overview.'
)
assertContains(
  styles,
  'border-radius: 16px !important;',
  'Value cards must use the same radius as Overview.'
)

console.log('PASS: Values tab renders editable Value data in Overview-style cards.')
console.log('PASS: Values and Alarms remain separate and use the same Value source.')
console.log('PASS: More than three Values still activates the existing scrollbar.')
