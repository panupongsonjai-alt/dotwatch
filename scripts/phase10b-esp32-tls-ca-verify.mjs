import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = [
  'esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp',
  'esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_esp32_dht3_tls_hardened.ino',
  'esp32/dotwatch_esp32_dht3_tls_hardened/src/dotwatch_root_ca.h',
  'esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_root_ca.h',
  'scripts/phase10b-esp32-install-root-ca.ps1',
  'docs/PHASE10B_ESP32_TLS_CA_E2E.md',
]
const markers = [
  '#include "dotwatch_root_ca.h"',
  'DOTWATCH_EMBEDDED_ROOT_CA',
  'hasEmbeddedTlsCaCert',
  'hasEffectiveTlsCaCert',
  'effectiveTlsCaCert',
  'tlsCaCertSourceText',
  'tlsEmbeddedCaCertSet',
  'Root CA verification enabled, source=',
  '#define FIRMWARE_VERSION "esp32-dht3-security-0.8.0"',
]

function fail(message) {
  console.error(message)
  process.exit(1)
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8') }

for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) fail(`Missing required file: ${file}`)
}

for (const rel of files.slice(0, 2)) {
  const text = read(rel)
  for (const marker of markers) {
    if (!text.includes(marker)) fail(`Missing marker in ${rel}: ${marker}`)
  }
  if (text.includes('secureClient.setInsecure();') && !text.includes('DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK')) {
    fail(`Unsafe setInsecure() found outside build flag guard in ${rel}`)
  }
}

for (const rel of files.slice(2, 4)) {
  const text = read(rel)
  if (!text.includes('static const char DOTWATCH_EMBEDDED_ROOT_CA[] PROGMEM')) {
    fail(`Embedded CA header does not define DOTWATCH_EMBEDDED_ROOT_CA: ${rel}`)
  }
  if (!text.includes('R"DOTWATCH_CA(')) {
    fail(`Embedded CA header does not use expected raw string delimiter: ${rel}`)
  }
}

const pkg = JSON.parse(read('package.json'))
if (pkg.scripts['verify:phase10b:esp32-tls-ca'] !== 'node scripts/phase10b-esp32-tls-ca-verify.mjs') {
  fail('Missing npm script verify:phase10b:esp32-tls-ca')
}

console.log('Phase 10B ESP32 TLS CA verify: OK')
