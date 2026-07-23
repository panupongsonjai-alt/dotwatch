import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const componentPath = path.join(
  repoRoot,
  'apps/dashboard/src/components/MetricConfigPanel.jsx'
)
const cssPath = path.join(repoRoot, 'apps/dashboard/src/styles/devices.css')

function read(relativePath) {
  if (!fs.existsSync(relativePath)) {
    throw new Error(`Required file not found: ${relativePath}`)
  }

  return fs.readFileSync(relativePath, 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`PASS: ${message}`)
}

const component = read(componentPath)
const css = read(cssPath)

assert(
  !component.includes('<span className="page-eyebrow">Value Configuration</span>'),
  'The duplicate Value Configuration eyebrow is removed.'
)
assert(
  !component.includes('<h3>Display Fields & Alarm Rules</h3>'),
  'The duplicate Display Fields & Alarm Rules title is removed.'
)
assert(
  !component.includes('metric-config-toolbar-summary'),
  'The duplicated Values, Visible, and Active Rules summary is removed.'
)
assert(
  !component.includes('Fixed 2 Values'),
  'The duplicated Fixed 2 Values chip is removed from this panel.'
)
assert(
  component.includes('!lockedDefinition ? (') &&
    component.includes('className="metric-config-compact-actions"') &&
    component.includes('Add Value'),
  'Editable models retain a compact Add Value action.'
)
assert(
  component.includes("draftMetrics.length > 3") &&
    component.includes("'metric-alarm-config-body--scrollable'"),
  'The scrollbar behavior for more than three Values is preserved.'
)
assert(
  component.includes('Save All Settings') && component.includes('Reset'),
  'Reset and Save All Settings actions are preserved.'
)
assert(
  css.includes('.metric-alarm-reference-layout .metric-config-compact-actions'),
  'Compact Add Value action styling is present.'
)
assert(
  css.includes('.metric-alarm-config-body--scrollable') &&
    css.includes('overflow-y: auto !important'),
  'Scrollable Value list styling is preserved.'
)

console.log('PASS: Values & Alarms now starts directly with the configuration list.')
