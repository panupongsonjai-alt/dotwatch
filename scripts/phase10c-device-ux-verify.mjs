import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'apps/dashboard/src/components/devices/DeviceList.jsx',
  'apps/dashboard/src/components/devices/SelectedDevicePanel.jsx',
  'apps/dashboard/src/pages/Devices.jsx',
  'apps/dashboard/src/styles/phase10c-device-ux.css',
  'apps/dashboard/src/styles.css',
  'docs/PHASE10C_DASHBOARD_DEVICE_UX.md',
]

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing required file: ${file}`)
}

const styles = read('apps/dashboard/src/styles.css')
assert(
  styles.includes("@import './styles/phase10c-device-ux.css';"),
  'styles.css must import phase10c-device-ux.css as a final stabilizer import'
)

const deviceList = read('apps/dashboard/src/components/devices/DeviceList.jsx')
assert(deviceList.includes('getSignalQuality'), 'DeviceList should include signal quality helper')
assert(deviceList.includes('Search name, code, model'), 'DeviceList search placeholder should be easier to understand')
assert(!deviceList.includes('à¸'), 'DeviceList still contains mojibake text')
assert(deviceList.includes('ยังไม่มี Device'), 'DeviceList Thai empty state text is missing')

const selectedPanel = read('apps/dashboard/src/components/devices/SelectedDevicePanel.jsx')
assert(selectedPanel.includes('DeviceQuickStatusPanel'), 'SelectedDevicePanel should include DeviceQuickStatusPanel')
assert(selectedPanel.includes('Live Device Snapshot'), 'SelectedDevicePanel should show the easy live snapshot')
assert(selectedPanel.includes('getDeviceMetricPills'), 'SelectedDevicePanel should reuse ESP32 metric display helper')
assert(!selectedPanel.includes("{metricUnit ? ` • ${metricUnit}` : ''}\n                    {metricUnit ? ` • ${metricUnit}` : ''}"), 'Duplicate metric unit rendering still exists')

const devicesPage = read('apps/dashboard/src/pages/Devices.jsx')
assert(devicesPage.includes('Device Center'), 'Devices page should use the easier Device Center title')

const css = read('apps/dashboard/src/styles/phase10c-device-ux.css')
for (const marker of [
  '.devices-v4-quick-panel',
  '.devices-v4-quick-grid',
  '.devices-v3-signal-chip',
  '.devices-v4-esp32-helper',
]) {
  assert(css.includes(marker), `Missing CSS marker: ${marker}`)
}

const packageJson = JSON.parse(read('package.json'))
assert(
  packageJson.scripts?.['verify:phase10c:device-ux'] === 'node scripts/phase10c-device-ux-verify.mjs',
  'package.json missing verify:phase10c:device-ux script'
)

console.log('Phase 10C Device UX verify: OK')
