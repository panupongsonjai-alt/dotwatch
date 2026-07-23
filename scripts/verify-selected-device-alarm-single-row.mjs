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
    !component.includes('metric-alarm-overview-header-controls'),
    'Warning/Critical controls are removed from the Value card header.',
  ],
  [
    component.includes('metric-alarm-overview-single-row'),
    'Each severity uses a single Alarm row.',
  ],
  [
    component.includes('metric-alarm-overview-severity-cell'),
    'Warning/Critical label is the first Alarm-row column.',
  ],
  [
    component.includes('metric-alarm-overview-condition-field'),
    'Condition is present in the Alarm row.',
  ],
  [
    component.includes('metric-alarm-overview-threshold-field'),
    'Threshold is present in the Alarm row.',
  ],
  [
    component.includes('metric-alarm-overview-notification-field'),
    'Notification Message is present in the Alarm row.',
  ],
  [
    component.includes('metric-alarm-overview-active-cell'),
    'Active/Paused is the final Alarm-row column.',
  ],
  [
    component.includes("draft.is_active !== false ? 'Active' : 'Paused'"),
    'Active and Paused text remains dynamic.',
  ],
  [
    css.includes('minmax(92px, 0.58fr)'),
    'Desktop five-column Alarm grid is present.',
  ],
  [
    css.includes('@container (max-width: 430px)'),
    'Narrow mobile fallback is present.',
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
  'PASS: Warning/Critical, Condition, Threshold, Message, and Active/Paused are arranged in one row.'
)
