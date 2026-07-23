import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const panelPath = path.join(
  repoRoot,
  'apps/dashboard/src/components/MetricConfigPanel.jsx'
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

function count(source, token) {
  return source.split(token).length - 1
}

const panel = readRequiredFile(panelPath)
const styles = readRequiredFile(stylePath)

assertContains(
  panel,
  'metric-values-overview-list-item metric-values-overview-list-item--paired',
  'Values must use paired rows.'
)
assertContains(
  panel,
  '<span>Value Name</span>',
  'Value Name field must remain available.'
)
assertContains(
  panel,
  '<span>Unit</span>',
  'Unit field must remain available.'
)
assertContains(
  panel,
  '<span>Decimals</span>',
  'Decimals field must remain available.'
)
assertContains(
  panel,
  '<span>Icon</span>',
  'Icon field must remain available.'
)
assertContains(
  panel,
  '<span>Display</span>',
  'Display row must remain available.'
)

if (count(panel, 'metric-values-overview-list-item--paired') !== 2) {
  throw new Error('FAIL: Exactly two paired rows are required.')
}

for (const token of [
  'updateMetric(index, \'metric_name\'',
  "updateMetric(index, 'unit'",
  "'decimal_places'",
  "updateMetric(index, 'icon'",
  "updateMetric(index, 'visible'",
]) {
  assertContains(panel, token, `Missing update behavior: ${token}`)
}

for (const selector of [
  '.metric-config-panel--values .metric-values-overview-list-item--paired',
  '.metric-values-overview-paired-field',
  '.metric-values-overview-paired-field + .metric-values-overview-paired-field',
  '@container (max-width: 700px)',
]) {
  assertContains(styles, selector, `Missing paired-row style: ${selector}`)
}

assertContains(
  styles,
  'grid-template-columns: repeat(2, minmax(0, 1fr));',
  'Paired rows must use two equal desktop columns.'
)
assertContains(
  styles,
  'grid-template-columns: 1fr;',
  'Paired rows must stack responsively.'
)
assertContains(
  panel,
  "draftMetrics.length > 3 ? 'metric-alarm-config-body--scrollable' : ''",
  'Scrollbar behavior for more than three Values must remain enabled.'
)
assertContains(
  panel,
  'metric-values-overview-card',
  'Overview-style Value cards must remain enabled.'
)

console.log('PASS: Value Name and Unit share the first row.')
console.log('PASS: Decimals and Icon share the second row.')
console.log('PASS: Display remains a separate overview-style row.')
console.log('PASS: Responsive stacking and the >3 Values scrollbar remain enabled.')
