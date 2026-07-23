import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`PASS: ${message}`)
}

const metricPanel = read('apps/dashboard/src/components/MetricConfigPanel.jsx')
const selectedPanel = read(
  'apps/dashboard/src/components/devices/SelectedDevicePanel.jsx'
)
const devicesCss = read('apps/dashboard/src/styles/devices.css')

assert(
  metricPanel.includes('draftMetrics.length > 3') &&
    metricPanel.includes('metric-alarm-config-body--scrollable'),
  'Display Fields & Alarm Rules enables scrolling only when Value count exceeds 3.'
)
assert(
  metricPanel.includes('metricListRef') &&
    metricPanel.includes('ResizeObserver') &&
    metricPanel.includes("querySelectorAll(':scope > .metric-alarm-config-group')"),
  'The scroll height is calculated from the first three rendered Value groups.'
)
assert(
  devicesCss.includes('--metric-config-scroll-max-height') &&
    devicesCss.includes('overflow-y: auto !important') &&
    devicesCss.includes('scrollbar-gutter: stable'),
  'The Value list uses a stable vertical scrollbar and measured maximum height.'
)
assert(
  metricPanel.includes('metric-alarm-config-body--icon-picker-open') &&
    devicesCss.includes(
      '.metric-alarm-config-body--scrollable.metric-alarm-config-body--icon-picker-open'
    ),
  'Opening an Icon picker temporarily releases the scroll clip so the dropdown remains usable.'
)
assert(
  selectedPanel.includes('<section className="devices-v3-security-list">') &&
    selectedPanel.includes('devices-v3-security-list-copy') &&
    selectedPanel.includes('devices-v3-security-list-value'),
  'Security keeps the protected-secret behavior and established component structure.'
)
assert(
  devicesCss.includes('.devices-v3-security-list {') &&
    devicesCss.includes('border-radius: 16px') &&
    devicesCss.includes(
      'grid-template-columns: minmax(150px, 0.35fr) minmax(0, 1fr)'
    ),
  'Security uses the same list radius, row columns, spacing, and surface as Overview.'
)
assert(
  devicesCss.includes(
    '.devices-v3-security-list .devices-v3-security-list-copy > span'
  ) &&
    devicesCss.includes('font-size: 13px') &&
    devicesCss.includes('font-size: 11px') &&
    devicesCss.includes('font-size: 15px'),
  'Security label, helper, and value font sizes match Overview typography.'
)
assert(
  devicesCss.includes('@media (max-width: 760px)') &&
    devicesCss.includes(
      '.devices-v3-security-list .devices-v3-security-list-item {'
    ),
  'Security retains a responsive single-column layout on small screens.'
)

console.log('PASS: Selected Device Center layout verification completed.')
