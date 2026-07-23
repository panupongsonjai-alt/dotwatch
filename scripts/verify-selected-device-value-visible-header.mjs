import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const componentPath = path.join(
  root,
  'apps/dashboard/src/components/MetricConfigPanel.jsx'
)
const cssPath = path.join(
  root,
  'apps/dashboard/src/styles/selected-device-values-alarms-tabs.css'
)

const component = fs.readFileSync(componentPath, 'utf8')
const css = fs.readFileSync(cssPath, 'utf8')

const assertions = [
  [
    component.includes('metric-values-overview-header-toggle active'),
    'Visible toggle is rendered in the Value card header.',
  ],
  [
    component.includes("aria-label={`${metricLabel} display visibility`}"),
    'Header visibility control has an accessible label.',
  ],
  [
    !component.includes('<span>Display</span>'),
    'The duplicate Display row is removed.',
  ],
  [
    css.includes('grid-template-columns: 40px minmax(0, 1fr) auto;'),
    'Value header has icon, value copy, and visibility columns.',
  ],
  [
    css.includes('.metric-values-overview-header-toggle'),
    'Compact header visibility styles are present.',
  ],
  [
    component.includes("updateMetric(index, 'visible', event.target.checked)"),
    'Visible / Hidden still updates the Value draft.',
  ],
]

const failed = assertions.filter(([passed]) => !passed)

if (failed.length > 0) {
  for (const [, message] of failed) {
    console.error(`FAIL: ${message}`)
  }
  process.exit(1)
}

for (const [, message] of assertions) {
  console.log(`PASS: ${message}`)
}

console.log(
  'PASS: Value visibility is placed beside the Value name and the Display row is removed.'
)
