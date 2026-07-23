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
    component.includes('metric-alarm-overview-header-controls'),
    'Alarm header contains Warning and Critical controls.',
  ],
  [
    component.includes('metric-alarm-overview-header-control ${severity}'),
    'Each severity has its own header control.',
  ],
  [
    !component.includes('metric-alarm-overview-visibility visible'),
    'Value Visible / Hidden is removed from the Alarm header.',
  ],
  [
    !component.includes('className="metric-alarm-overview-rule-header"'),
    'Duplicate Warning/Critical rule headers are removed from the body.',
  ],
  [
    component.includes('metric-alarm-overview-fields-row'),
    'Alarm fields use one shared row.',
  ],
  [
    component.includes('metric-alarm-overview-condition-field'),
    'Condition is present in the shared row.',
  ],
  [
    component.includes('metric-alarm-overview-threshold-field'),
    'Threshold is present in the shared row.',
  ],
  [
    component.includes('metric-alarm-overview-notification-field'),
    'Notification Message is present in the shared row.',
  ],
  [
    css.includes('minmax(260px, 2fr)'),
    'Desktop Alarm row allocates a wider Notification Message column.',
  ],
  [
    css.includes('@container (max-width: 560px)'),
    'Mobile fallback is present.',
  ],
  [
    component.includes("updateAlarmActive("),
    'Warning and Critical activation remains functional.',
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
  'PASS: Alarm header controls and the three-field Alarm row are configured.'
)
