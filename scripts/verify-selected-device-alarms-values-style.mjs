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
    component.includes('metric-alarms-overview-card'),
    'Each Alarm Value uses an overview-style card.',
  ],
  [
    component.includes(
      'metric-values-overview-card-header metric-alarms-overview-card-header'
    ),
    'Alarm card header reuses the Values card header structure.',
  ],
  [
    component.includes('metric-values-overview-card-icon'),
    'Alarm card header shows the Value icon.',
  ],
  [
    component.includes('metric-values-overview-card-copy'),
    'Alarm card header shows the Value name, key, and unit.',
  ],
  [
    component.includes('metric-alarm-overview-visibility visible'),
    'Alarm card keeps the Value visibility reference.',
  ],
  [
    component.includes('metric-alarm-overview-rule warning') ||
      component.includes('className={`metric-alarm-overview-rule ${severity}`}'),
    'Warning and Critical are rendered as sections inside the Value card.',
  ],
  [
    component.includes('metric-alarm-overview-paired-row'),
    'Condition and Threshold share one row.',
  ],
  [
    component.includes('metric-alarm-overview-message-row'),
    'Notification Message uses an overview-style row.',
  ],
  [
    component.includes('metric-alarm-overview-active-toggle'),
    'Active / Paused is placed in each severity header.',
  ],
  [
    component.includes('{draftMetrics.map(renderAlarmRules)}'),
    'Alarms still render every Value from the Values source.',
  ],
  [
    !component.includes('Alarm ทั้งหมดอ้างอิงจาก'),
    'The unique Alarms source note is removed for Values-style parity.',
  ],
  [
    css.includes('.metric-config-panel--alarms .metric-alarms-overview-card'),
    'Alarm card border, radius, background, and spacing styles exist.',
  ],
  [
    css.includes('.metric-alarm-overview-rule-header'),
    'Warning / Critical overview headers are styled.',
  ],
  [
    css.includes('@container (max-width: 700px)'),
    'Paired Alarm fields have responsive behavior.',
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
  'PASS: The Alarms tab now follows the same Value card presentation as the Values tab.'
)
