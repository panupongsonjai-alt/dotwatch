import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const panel = read(
  'apps/dashboard/src/components/devices/SelectedDevicePanel.jsx'
)
const api = read('apps/dashboard/src/services/api.js')
const routes = read('services/backend/src/routes/devices.routes.js')
const middleware = read(
  'services/backend/src/middlewares/requireRecentAuthentication.js'
)
const styles = read('apps/dashboard/src/styles/devices.css')

assert(
  !panel.includes('<span>Device ID</span>'),
  'Selected Device Security must not render Device ID'
)
assert(
  !panel.includes('<span>Secret Status</span>'),
  'Selected Device Security must not render Secret Status'
)
assert(
  !panel.includes('<span>View Device Secret</span>'),
  'Inline View Device Secret password form must be removed'
)
assert(
  panel.includes('devices-v3-device-code-plain'),
  'Device Code borderless class is missing'
)
assert(
  panel.includes("openPasswordDialog('reveal')"),
  'Hidden Device Secret must open the password dialog'
)
assert(
  panel.includes("openPasswordDialog('reset')"),
  'Reset Secret must open the password dialog first'
)
assert(
  panel.includes('await reauthenticateCurrentUser(passwordDialogPassword)'),
  'Firebase password re-authentication is missing'
)
assert(
  panel.includes('await onResetSecret(selectedDevice)'),
  'Reset flow must continue to the second typed confirmation'
)
assert(
  api.match(/resetDeviceSecret[\s\S]*?forceAuthRefresh:\s*true/),
  'Reset Secret API must force-refresh the Firebase ID token'
)
assert(
  api.match(/getDeviceSecret[\s\S]*?forceAuthRefresh:\s*true/),
  'Get Secret API must force-refresh the Firebase ID token'
)
assert(
  (routes.match(/requireRecentAuthentication/g) || []).length >= 3,
  'Recent-authentication middleware must protect both secret routes'
)
assert(
  middleware.includes('DEFAULT_MAX_AUTH_AGE_SECONDS = 5 * 60'),
  'Recent-authentication window must be five minutes'
)
assert(
  middleware.includes("code: 'RECENT_AUTH_REQUIRED'"),
  'Recent-authentication rejection code is missing'
)
assert(
  styles.match(/\.devices-v3-device-code-plain[\s\S]*?border:\s*0/),
  'Device Code border removal CSS is missing'
)

console.log('Selected Device Security verification passed.')
console.log('- Device ID and Secret Status removed')
console.log('- Device Code rendered without frame')
console.log('- Secret reveal requires password modal')
console.log('- Reset requires password modal and typed confirmation')
console.log('- Backend requires recent Firebase authentication')
