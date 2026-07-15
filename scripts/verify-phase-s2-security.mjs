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

const server = read('services/backend/src/server.js')
const env = read('services/backend/src/config/env.js')
const authDevice = read('services/backend/src/middlewares/authDevice.js')
const ingestRoutes = read('services/backend/src/routes/ingest.routes.js')
const deviceLimiter = read('services/backend/src/middlewares/deviceIngestRateLimit.js')
const backendLimiter = read('services/backend/src/security/fixedWindowLimiter.js')
const otaServer = read('services/ota-server/server.mjs')
const otaEnv = read('services/ota-server/.env.example')
const otaRender = read('services/ota-server/render.yaml')

expect(
  server.includes('noServer: true') &&
    server.includes('maxPayload: env.wsMaxPayloadBytes') &&
    server.includes("server.on('upgrade'") &&
    server.includes('isWebSocketOriginAllowed'),
  'WebSocket upgrade validates path/origin before accepting sockets',
  'WebSocket pre-upgrade path/origin validation is incomplete'
)

expect(
  server.includes('wsMaxTotalClients') &&
    server.includes('wsMaxClientsPerIp') &&
    server.includes('wsMaxUnauthenticatedClientsPerIp') &&
    server.includes('wsMaxClientsPerUser'),
  'WebSocket connection ceilings cover total, IP, unauthenticated IP, and user',
  'WebSocket connection ceilings are incomplete'
)

expect(
  server.includes('consumeSocketMessage') &&
    server.includes('wsMaxMessagesPerWindow') &&
    server.includes('Binary WebSocket messages are not supported') &&
    server.includes('Unsupported WebSocket message type'),
  'WebSocket protocol and per-socket message rate are enforced',
  'WebSocket message/protocol protection is incomplete'
)

expect(
  server.includes('ws.bufferedAmount > env.wsMaxBufferedBytes') &&
    server.includes('terminatedSlowConsumer') &&
    server.includes('perMessageDeflate: false'),
  'WebSocket slow consumers and compression pressure are controlled',
  'WebSocket slow-consumer/compression protection is incomplete'
)

expect(
  env.includes('WS_MAX_PAYLOAD_BYTES') &&
    env.includes('WS_MAX_TOTAL_CLIENTS') &&
    env.includes('WS_MAX_UNAUTHENTICATED_CLIENTS_PER_IP') &&
    env.includes('WS_MAX_BUFFERED_BYTES'),
  'WebSocket security limits are environment-configurable',
  'WebSocket security environment configuration is incomplete'
)

expect(
  authDevice.includes('failedAuthByIp') &&
    authDevice.includes('failedAuthByDevice') &&
    authDevice.includes('FixedWindowLimiter') &&
    backendLimiter.includes('while (this.entries.size > this.maxEntries)'),
  'Device auth failures are bounded by IP and device without an unbounded Map',
  'Device auth failure tracking remains incomplete or unbounded'
)

expect(
  ingestRoutes.includes('deviceIngestRateLimit') &&
    deviceLimiter.includes('ingestDeviceRateLimitPerMinute') &&
    env.includes('INGEST_DEVICE_RATE_LIMIT_PER_MINUTE'),
  'Ingest has an authenticated per-device request limit',
  'Per-device ingest limiting is missing'
)

expect(
  otaServer.includes('OTA_DEVICE_REGISTRY_JSON') &&
    otaServer.includes('authorizeScope') &&
    otaServer.includes('handleDownload(req, res, url, auth)') &&
    otaServer.includes('Device is not authorized for this firmware scope'),
  'OTA check and download are bound to device model/channel scope',
  'OTA device-to-firmware scope binding is incomplete'
)

expect(
  otaServer.includes('requestByIpLimiter') &&
    otaServer.includes('requestByDeviceLimiter') &&
    otaServer.includes('authFailureByIpLimiter') &&
    otaServer.includes('authFailureByDeviceLimiter'),
  'OTA rate limits cover request and authentication abuse',
  'OTA request/authentication rate limits are incomplete'
)

expect(
  otaServer.includes('deviceCode: auth.deviceCode') &&
    otaServer.includes('remoteAddress: ip') &&
    !otaServer.includes('...payload'),
  'OTA audit fields cannot be overwritten by report payloads',
  'OTA report payload can still overwrite authoritative audit fields'
)

expect(
  otaServer.includes('server.requestTimeout = 30_000') &&
    otaServer.includes('server.headersTimeout = 15_000') &&
    otaServer.includes('server.maxRequestsPerSocket = 100'),
  'OTA HTTP server has request/header/keep-alive abuse limits',
  'OTA HTTP timeout/socket controls are incomplete'
)

expect(
  otaEnv.includes('OTA_REQUIRE_DEVICE_SCOPE=true') &&
    otaEnv.includes('OTA_RATE_LIMIT_PER_IP=120') &&
    otaEnv.includes('OTA_DEVICE_REGISTRY_JSON=') &&
    otaRender.includes('key: OTA_DEVICE_REGISTRY_JSON') &&
    otaRender.includes('key: OTA_REQUIRE_DEVICE_SCOPE'),
  'OTA production-safe settings are documented in environment and Render configuration',
  'OTA environment/Render configuration is missing Phase S2 controls'
)

for (const message of passes) console.log(`PASS: ${message}`)

if (failures.length > 0) {
  for (const message of failures) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log(`Phase S2 security verification passed (${passes.length} checks).`)
