import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = [
  'esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp',
  'esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_esp32_dht3_tls_hardened.ino',
  'docs/PHASE11C_ESP32_FRIENDLY_PORTAL.md',
  'docs/PHASE11C_ESP32_FRIENDLY_PORTAL_ANALYSIS.md',
]

const fail = (message) => {
  console.error(`Phase 11C ESP32 friendly portal verify: FAILED - ${message}`)
  process.exit(1)
}

for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing ${file}`)
}

const main = fs.readFileSync(path.join(root, files[0]), 'utf8')
const ino = fs.readFileSync(path.join(root, files[1]), 'utf8')

if (main !== ino) fail('PlatformIO src/main.cpp and Arduino .ino are not identical')

const requiredMarkers = [
  'esp32-dht3-security-0.9.1',
  'ตั้งค่า ESP32 ให้ง่ายเหมือนเปิด Dashboard',
  'quick-steps',
  'readyChecklistText',
  'signalQualityText',
  'friendly-list',
  'advanced-card',
  'Save & Restart ESP32',
  'ตั้งค่าความปลอดภัย / Root CA / Local Admin PIN',
  'ล้างการตั้งค่าอุปกรณ์',
]

for (const marker of requiredMarkers) {
  if (!main.includes(marker)) fail(`missing marker: ${marker}`)
}

const forbiddenMarkers = [
  "import React",
  "from 'react'",
  'apps/dashboard/src',
  'VITE_',
]

for (const marker of forbiddenMarkers) {
  if (main.includes(marker)) fail(`ESP32 firmware should not depend on dashboard/web runtime marker: ${marker}`)
}

const routeMarkers = [
  'server.on("/", HTTP_GET, handleRoot)',
  'server.on("/save", HTTP_POST, handleSave)',
  'server.on("/reset", HTTP_POST, handleReset)',
  'server.on("/json", HTTP_GET, handleJson)',
  'server.on("/test", HTTP_GET, handleTest)',
]
for (const marker of routeMarkers) {
  if (!main.includes(marker)) fail(`missing route marker: ${marker}`)
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (packageJson.scripts?.['verify:phase11c:esp32-friendly-portal'] !== 'node scripts/phase11c-esp32-friendly-portal-verify.mjs') {
  fail('package.json missing verify:phase11c:esp32-friendly-portal script')
}

console.log('Phase 11C ESP32 friendly portal verify: OK')
