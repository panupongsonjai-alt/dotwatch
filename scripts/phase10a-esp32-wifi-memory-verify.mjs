import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp',
  'esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_esp32_dht3_tls_hardened.ino',
  'docs/PHASE10A_ESP32_WIFI_MEMORY.md',
  'services/backend/migrations/run.js',
]

const requiredMarkers = [
  'WIFI_PROFILE_MAX',
  'WIFI_PROFILES_KEY',
  'struct WiFiProfile',
  'rememberWiFiProfile',
  'knownWiFiProfileSummary',
  'Scanning Wi-Fi for remembered networks',
  'persistConnectedWiFiProfile',
  'rememberedWifiProfiles',
  'WiFi.setAutoReconnect(true)',
]

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) fail(`Missing required file: ${file}`)
}

const main = read('esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp')
const ino = read('esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_esp32_dht3_tls_hardened.ino')
const runjs = read('services/backend/migrations/run.js')
const pkg = JSON.parse(read('package.json'))

for (const marker of requiredMarkers) {
  if (!main.includes(marker)) fail(`Missing ESP32 Wi-Fi memory marker in main.cpp: ${marker}`)
  if (!ino.includes(marker)) fail(`Missing ESP32 Wi-Fi memory marker in .ino: ${marker}`)
}

if (!main.includes('#define FIRMWARE_VERSION "esp32-dht3-security-0.7.0"')) {
  fail('Firmware version was not updated to esp32-dht3-security-0.7.0')
}

const duplicateWifiJson = (main.match(/doc\["rememberedWifiProfiles"\]/g) || []).length
if (duplicateWifiJson !== 1) {
  fail(`Expected exactly one full JSON rememberedWifiProfiles field, found ${duplicateWifiJson}`)
}

if (!runjs.includes("020_phase9f_required_nullability_normalization.sql")) {
  fail('Migration runner does not include 020_phase9f_required_nullability_normalization.sql')
}

if (pkg.scripts['verify:phase10a:esp32-wifi'] !== 'node scripts/phase10a-esp32-wifi-memory-verify.mjs') {
  fail('Missing npm script verify:phase10a:esp32-wifi')
}

console.log('Phase 10A ESP32 Wi-Fi Memory verify: OK')
