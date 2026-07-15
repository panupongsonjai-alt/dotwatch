import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const otaDir = path.join(root, 'services', 'ota-server')
const port = 45122
const baseUrl = `http://127.0.0.1:${port}`
const deviceCode = 'DW-S2-TEST'
const deviceSecret = 'phase-s2-test-secret-not-for-production'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHealth(child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`OTA server exited with code ${child.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await wait(100)
  }
  throw new Error('OTA server did not become healthy')
}

function authHeaders(extra = {}) {
  return {
    'x-device-code': deviceCode,
    'x-device-secret': deviceSecret,
    ...extra,
  }
}

const stdout = []
const stderr = []
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: otaDir,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    PUBLIC_BASE_URL: 'https://ota.example.test',
    OTA_ALLOW_UNREGISTERED_DEVICES: 'false',
    OTA_REQUIRE_DEVICE_SCOPE: 'true',
    OTA_DEVICE_REGISTRY_JSON: JSON.stringify({
      [deviceCode]: {
        secret: deviceSecret,
        modelKeys: ['esp32_dht3'],
        channels: ['stable'],
      },
    }),
    OTA_DEVICE_SECRETS_JSON: '{}',
    OTA_RATE_LIMIT_PER_IP: '100',
    OTA_RATE_LIMIT_PER_DEVICE: '5',
    OTA_AUTH_FAILURE_LIMIT_PER_IP: '5',
    OTA_AUTH_FAILURE_LIMIT_PER_DEVICE: '5',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout.on('data', (chunk) => stdout.push(String(chunk)))
child.stderr.on('data', (chunk) => stderr.push(String(chunk)))

try {
  await waitForHealth(child)

  const missing = await fetch(`${baseUrl}/api/device-firmware/check?modelKey=esp32_dht3`)
  assert.equal(missing.status, 401)
  console.log('PASS: OTA rejects missing credentials')

  const wrongScope = await fetch(
    `${baseUrl}/api/device-firmware/check?modelKey=another_model&channel=stable`,
    { headers: authHeaders() }
  )
  assert.equal(wrongScope.status, 403)
  console.log('PASS: OTA rejects unauthorized model scope')

  const allowed = await fetch(
    `${baseUrl}/api/device-firmware/check?modelKey=esp32_dht3&channel=stable&currentBuild=0`,
    { headers: authHeaders() }
  )
  assert.equal(allowed.status, 200)
  const allowedBody = await allowed.json()
  assert.equal(allowedBody.updateAvailable, true)
  console.log('PASS: OTA accepts authorized model/channel scope')

  const report = await fetch(`${baseUrl}/api/device-firmware/report`, {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      deviceCode: 'SPOOFED',
      remoteAddress: 'SPOOFED',
      receivedAt: 'SPOOFED',
      event: 'check_failed',
      message: 'test',
      modelKey: 'esp32_dht3',
      firmwareBuild: 1200,
    }),
  })
  assert.equal(report.status, 202)
  await wait(100)
  const logs = stdout.join('')
  assert.match(logs, /"deviceCode":"DW-S2-TEST"/)
  assert.doesNotMatch(logs, /"deviceCode":"SPOOFED"/)
  console.log('PASS: OTA report cannot spoof authoritative audit fields')

  let finalStatus = 0
  for (let index = 0; index < 4; index += 1) {
    const response = await fetch(
      `${baseUrl}/api/device-firmware/check?modelKey=esp32_dht3&channel=stable&currentBuild=999999`,
      { headers: authHeaders() }
    )
    finalStatus = response.status
  }
  assert.equal(finalStatus, 429)
  console.log('PASS: OTA per-device rate limit returns 429')
} finally {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(2000),
  ])
}

if (stderr.length > 0) {
  const unexpected = stderr.join('').trim()
  if (unexpected) console.error(unexpected)
}

console.log('Phase S2 OTA security integration tests passed.')
