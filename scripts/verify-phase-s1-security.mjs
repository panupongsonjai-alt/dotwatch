import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const failures = []
const passes = []

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function expect(condition, passMessage, failMessage) {
  if (condition) passes.push(passMessage)
  else failures.push(failMessage)
}

for (const platform of ['esp32', 'esp8266']) {
  const project = platform === 'esp32'
    ? 'esp32/dotwatch_esp32_product'
    : 'esp8266/dotwatch_esp8266_product'

  const productConfig = read(`${project}/include/ProductConfig.h`)
  const appTypes = read(`${project}/include/AppTypes.h`)
  const configStore = read(`${project}/src/config/ConfigStore.cpp`)
  const wifiManager = read(`${project}/src/network/WiFiManager.cpp`)
  const portalServer = read(`${project}/src/portal/PortalServer.cpp`)
  const portalView = read(`${project}/src/portal/views/PortalView.cpp`)
  const previewServer = read(`${project}/portal-preview/dev-server.mjs`)
  const previewClient = read(`${project}/portal-preview/src/preview/preview.js`)
  const appController = read(`${project}/src/app/AppController.cpp`)

  expect(
    !/SETUP_AP_PASSWORD\s*=/.test(productConfig),
    `${platform}: no fleet-wide Setup AP password constant`,
    `${platform}: fleet-wide Setup AP password constant still exists`
  )
  expect(
    appTypes.includes('String setupApPassword;') &&
      configStore.includes('generateSecurityCredential') &&
      wifiManager.includes('config_->setupApPassword'),
    `${platform}: per-device Setup AP credential is generated and persisted`,
    `${platform}: per-device Setup AP credential wiring is incomplete`
  )
  expect(
    portalServer.includes('server_.on("/login", HTTP_POST') &&
      portalServer.includes('ADMIN_SESSION_COOKIE') &&
      portalServer.includes('SameSite=Strict'),
    `${platform}: Local Admin uses POST login and session cookie`,
    `${platform}: Local Admin session authentication is incomplete`
  )
  expect(
    !portalServer.includes('?pin=') &&
      !portalView.includes("method='GET' action='/'") &&
      !portalView.includes("name='pin' value="),
    `${platform}: PIN is not propagated through URLs or hidden fields`,
    `${platform}: PIN is still exposed in a URL or hidden field`
  )
  expect(
    productConfig.includes('SETUP_PORTAL_TIMEOUT_MS') &&
      appController.includes('SETUP_BUTTON_HOLD_MS') &&
      portalServer.includes('setup portal timed out'),
    `${platform}: provisioning AP requires deliberate access and expires`,
    `${platform}: provisioning lifecycle hardening is incomplete`
  )
  expect(
    previewClient.includes('fetch("/device-api/login"') &&
      !previewClient.includes('?pin=') &&
      !previewClient.includes('dotwatch.preview.pin') &&
      previewServer.includes('if (req.headers.cookie) headers.Cookie = req.headers.cookie') &&
      previewServer.includes('responseHeaders["Set-Cookie"] = setCookie'),
    `${platform}: Portal Preview uses POST login and session cookie`,
    `${platform}: Portal Preview still exposes or fails to forward Local Admin credentials securely`
  )
  expect(
    portalView.includes("action='/logout'") &&
      portalServer.includes('server_.on("/logout", HTTP_POST'),
    `${platform}: authenticated portal provides explicit logout`,
    `${platform}: authenticated portal logout is incomplete`
  )
}

const envExample = read('services/backend/.env.example')
const prodEnvExample = read('services/backend/.env.production.example')
const envConfig = read('services/backend/src/config/env.js')
const dbPool = read('services/backend/src/db/pool.js')
const migrationRunner = read('services/backend/migrations/run.js')
const productionCheck = read('scripts/check-production-env.mjs')

expect(
  /DEVICE_SECRET_ENCRYPTION_KEY=\s*(?:\r?\n|$)/.test(envExample) &&
    !envExample.includes('RameT7KiqYLV5vio0fsHKfxkQmh10+N+u4OAveuq5NI='),
  'backend: committed local encryption key was removed',
  'backend: committed local encryption key still exists'
)
expect(
  envConfig.includes('RameT7KiqYLV5vio0fsHKfxkQmh10+N+u4OAveuq5NI=') &&
    productionCheck.includes('RameT7KiqYLV5vio0fsHKfxkQmh10+N+u4OAveuq5NI='),
  'backend: known public encryption key is rejected in production',
  'backend: known public encryption key blacklist is missing'
)
expect(
  prodEnvExample.includes('DATABASE_SSL_REJECT_UNAUTHORIZED=true') &&
    envConfig.includes('DATABASE_SSL_REJECT_UNAUTHORIZED must be true in production') &&
    dbPool.includes('rejectUnauthorized: env.databaseSslRejectUnauthorized') &&
    migrationRunner.includes('DATABASE_SSL_REJECT_UNAUTHORIZED must be true in production'),
  'backend: production PostgreSQL certificate verification is enforced',
  'backend: production PostgreSQL TLS verification is incomplete'
)

for (const message of passes) console.log(`PASS: ${message}`)

if (failures.length > 0) {
  for (const message of failures) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log(`Phase S1 security verification passed (${passes.length} checks).`)
