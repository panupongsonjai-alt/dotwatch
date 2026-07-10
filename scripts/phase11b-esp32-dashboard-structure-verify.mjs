import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

function exists(file) {
  return fs.existsSync(path.join(root, file))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const firmwareFiles = [
  'esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp',
  'esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_esp32_dht3_tls_hardened.ino',
]

for (const file of firmwareFiles) {
  assert(exists(file), `Missing ESP32 firmware file: ${file}`)
}

const main = read(firmwareFiles[0])
const ino = read(firmwareFiles[1])
assert(main === ino, 'ESP32 Arduino IDE sketch must stay synchronized with PlatformIO src/main.cpp')

const requiredMarkers = [
  '#define FIRMWARE_VERSION "esp32-dht3-security-0.9.0"',
  'String pageShell(const String &title, const String &body)',
  'app-shell',
  'portal-frame',
  'portal-sidebar',
  'portal-main',
  'side-nav',
  'page-hero',
  'section-card',
  'stat-grid',
  'form-section',
  'Live Device Snapshot',
  "id='overview'",
  "id='network'",
  "id='security'",
  "id='device'",
  "id='sensor'",
  "id='operations'",
  'ESP32 จะจำ Wi‑Fi',
  'Root CA Certificate',
  'metric_1 = Temperature, metric_2 = Humidity, metric_3 = Wi-Fi RSSI',
  'Factory Reset Config',
]

for (const marker of requiredMarkers) {
  assert(main.includes(marker), `ESP32 dashboard-like local portal missing marker: ${marker}`)
}

const criticalRuntimeMarkers = [
  'server.on("/", HTTP_GET, handleRoot)',
  'server.on("/save", HTTP_POST, handleSave)',
  'server.on("/reset", HTTP_POST, handleReset)',
  'server.on("/json", HTTP_GET, handleJson)',
  'server.on("/test", HTTP_GET, handleTest)',
  'bool postIngest(float temperature, float humidity, int rssi)',
  'http.addHeader("x-device-code", cfg.deviceCode)',
  'http.addHeader("x-device-secret", cfg.deviceSecret)',
  'metrics["metric_1"]',
  'metrics["metric_2"]',
  'metrics["metric_3"]',
  'DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK',
  'hasEffectiveTlsCaCert()',
  'rememberWiFiProfile',
  'knownWiFiProfileSummary',
]

for (const marker of criticalRuntimeMarkers) {
  assert(main.includes(marker), `ESP32 critical runtime behavior was accidentally removed: ${marker}`)
}

assert(!main.includes('apps/dashboard'), 'ESP32 portal must not import or reference Dashboard app internals')
assert(!main.includes('fetch('), 'ESP32 local portal should remain firmware-rendered, not browser-fetch based')
assert(!main.includes('localStorage'), 'ESP32 local portal should not depend on browser localStorage')

const pkg = JSON.parse(read('package.json'))
assert(
  pkg.scripts?.['verify:phase11b:esp32-structure'] === 'node scripts/phase11b-esp32-dashboard-structure-verify.mjs',
  'Root package.json missing verify:phase11b:esp32-structure script'
)

assert(exists('docs/PHASE11B_ESP32_DASHBOARD_STRUCTURE.md'), 'Missing Phase 11B ESP32 structure document')
assert(exists('docs/PHASE11B_ESP32_STRUCTURE_ANALYSIS.md'), 'Missing Phase 11B ESP32 analysis document')

console.log('Phase 11B ESP32/Dashboard structure verify: OK')
