import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import http from 'http'
import { WebSocketServer } from 'ws'

import { env } from './config/env.js'
import { devicesRouter } from './routes/devices.routes.js'
import { ingestRouter } from './routes/ingest.routes.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { requestContext } from './middlewares/requestContext.js'
import { markOfflineDevices } from './services/deviceStatus.service.js'
import { alarmsRouter } from './routes/alarms.routes.js'
import alarmRulesRouter from './routes/alarmRules.routes.js'
import { demoRouter } from './routes/demo.routes.js'
import { demoGeneratorRouter } from './routes/demoGenerator.routes.js'
import deviceMetricsRoutes from './routes/deviceMetricsRoutes.js'
import deviceModelsRoutes from './routes/deviceModelsRoutes.js'
import { adminRouter } from './routes/admin.routes.js'
import { activityRouter } from './routes/activity.routes.js'
import { pool } from './db/pool.js'
import { createDeviceStatusActivity } from './services/activity.service.js'
import { alarmStateRouter } from './routes/alarmState.routes.js'
import { admin, firebaseReady } from './config/firebaseAdmin.js'
import { buildHealthResponse } from './utils/health.js'
import { organizationsRouter } from './routes/organizations.routes.js'
import { sitesRouter } from './routes/sites.routes.js'
import { deviceGroupsRouter } from './routes/deviceGroups.routes.js'
import { billingRouter } from './routes/billing.routes.js'
import { mobilePushRouter } from './routes/mobilePush.routes.js'
import { tenantRouter } from './routes/tenant.routes.js'
import { weatherVirtualDeviceRouter } from './routes/weatherVirtualDevice.routes.js'
import { startWeatherVirtualDeviceScheduler } from './services/weatherVirtualDevice.service.js'
import { createHttpLogger, logger, logStartupSummary, startOpsHeartbeat } from './utils/logger.js'

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: env.wsMaxPayloadBytes,
  perMessageDeflate: false,
  clientTracking: true,
})

app.set('trust proxy', 1)
app.disable('x-powered-by')

const clients = new Map()
const socketStates = new Map()
const wsSecurityCounters = {
  rejectedPath: 0,
  rejectedOrigin: 0,
  rejectedCapacity: 0,
  rejectedPerIp: 0,
  rejectedUnauthenticatedPerIp: 0,
  rejectedMessageRate: 0,
  rejectedProtocol: 0,
  terminatedSlowConsumer: 0,
}
let isShuttingDown = false

logStartupSummary()

function getSocketStateLabel(ws) {
  if (ws.readyState === ws.CONNECTING) return 'CONNECTING'
  if (ws.readyState === ws.OPEN) return 'OPEN'
  if (ws.readyState === ws.CLOSING) return 'CLOSING'
  if (ws.readyState === ws.CLOSED) return 'CLOSED'
  return String(ws.readyState)
}

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim()
  const connecting = String(req.headers['cf-connecting-ip'] || '').trim()
  const direct = String(req.socket?.remoteAddress || 'unknown').trim()

  return String(connecting || forwarded || direct || 'unknown').slice(0, 128)
}

function countSocketsByIp(ip, { authenticated } = {}) {
  let count = 0

  for (const state of socketStates.values()) {
    if (state.ip !== ip) continue
    if (
      typeof authenticated === 'boolean' &&
      Boolean(state.authenticated) !== authenticated
    ) {
      continue
    }
    count += 1
  }

  return count
}

function getClientCountByUser(userId) {
  let count = 0

  for (const [, clientUserId] of clients.entries()) {
    if (clientUserId === String(userId)) count += 1
  }

  return count
}

function getWebSocketSummary() {
  const byUser = {}

  for (const [, userId] of clients.entries()) {
    byUser[userId] = (byUser[userId] || 0) + 1
  }

  return {
    authenticatedClients: clients.size,
    connectedSockets: socketStates.size,
    unauthenticatedSockets: Math.max(0, socketStates.size - clients.size),
    byUser,
    security: { ...wsSecurityCounters },
  }
}

async function verifyWebSocketToken(token) {
  if (!firebaseReady) {
    throw new Error('Firebase Admin not configured')
  }

  if (!token) {
    throw new Error('Missing WebSocket token')
  }

  return admin.auth().verifyIdToken(token)
}

function closeWebSocketPolicy(ws, message = 'WebSocket policy violation') {
  try {
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message,
        })
      )
    }
  } catch {
    // Ignore send errors before closing the socket.
  }

  try {
    ws.close(1008, String(message).slice(0, 120))

    if (!ws.policyCloseTimer) {
      ws.policyCloseTimer = setTimeout(() => {
        if (ws.readyState !== ws.CLOSED) ws.terminate()
      }, 2000)
      ws.policyCloseTimer.unref?.()
    }
  } catch {
    ws.terminate()
  }
}

function rejectWebSocketUpgrade(socket, statusCode, statusText, message) {
  const body = JSON.stringify({ ok: false, message })

  socket.end(
    [
      `HTTP/1.1 ${statusCode} ${statusText}`,
      'Connection: close',
      'Content-Type: application/json; charset=utf-8',
      `Content-Length: ${Buffer.byteLength(body)}`,
      '',
      body,
    ].join('\r\n')
  )
}

function getUpgradePath(req) {
  try {
    return new URL(req.url || '/', 'http://localhost').pathname
  } catch {
    return ''
  }
}

function isWebSocketOriginAllowed(req) {
  const origin = String(req.headers.origin || '').trim()
  if (!origin) return true
  return env.corsOrigins.includes(origin)
}

function consumeSocketMessage(state) {
  const now = Date.now()

  if (now - state.messageWindowStartedAt >= env.wsMessageRateWindowMs) {
    state.messageWindowStartedAt = now
    state.messageCount = 0
  }

  state.messageCount += 1
  return state.messageCount <= env.wsMaxMessagesPerWindow
}

function cleanupSocket(ws) {
  clients.delete(ws)
  socketStates.delete(ws)
}

function sendSerializedPayload(ws, message, context = {}) {
  if (ws.readyState !== ws.OPEN) return false

  if (ws.bufferedAmount > env.wsMaxBufferedBytes) {
    wsSecurityCounters.terminatedSlowConsumer += 1
    console.warn('WS slow consumer terminated:', {
      ...context,
      bufferedAmount: ws.bufferedAmount,
    })
    ws.terminate()
    return false
  }

  try {
    ws.send(message, (error) => {
      if (!error) return
      console.error('WS send failed:', {
        ...context,
        message: error.message,
      })
      ws.terminate()
    })
    return true
  } catch (error) {
    console.error('WS send failed:', {
      ...context,
      message: error.message,
    })
    ws.terminate()
    return false
  }
}

function requireDevelopment(req, res, next) {
  if (env.isDevelopment) {
    next()
    return
  }

  res.status(404).json({ message: 'Not found' })
}

server.on('upgrade', (req, socket, head) => {
  socket.on('error', (error) => {
    console.error('WS upgrade socket error:', error.message)
  })

  if (isShuttingDown) {
    rejectWebSocketUpgrade(socket, 503, 'Service Unavailable', 'Server is shutting down')
    return
  }

  if (getUpgradePath(req) !== env.wsPath) {
    wsSecurityCounters.rejectedPath += 1
    rejectWebSocketUpgrade(socket, 404, 'Not Found', 'WebSocket path not found')
    return
  }

  if (!isWebSocketOriginAllowed(req)) {
    wsSecurityCounters.rejectedOrigin += 1
    rejectWebSocketUpgrade(socket, 403, 'Forbidden', 'WebSocket origin is not allowed')
    return
  }

  if (socketStates.size >= env.wsMaxTotalClients) {
    wsSecurityCounters.rejectedCapacity += 1
    rejectWebSocketUpgrade(socket, 503, 'Service Unavailable', 'WebSocket capacity reached')
    return
  }

  const ip = getRequestIp(req)

  if (countSocketsByIp(ip) >= env.wsMaxClientsPerIp) {
    wsSecurityCounters.rejectedPerIp += 1
    rejectWebSocketUpgrade(socket, 429, 'Too Many Requests', 'Too many WebSocket connections')
    return
  }

  if (
    countSocketsByIp(ip, { authenticated: false }) >=
    env.wsMaxUnauthenticatedClientsPerIp
  ) {
    wsSecurityCounters.rejectedUnauthenticatedPerIp += 1
    rejectWebSocketUpgrade(
      socket,
      429,
      'Too Many Requests',
      'Too many unauthenticated WebSocket connections'
    )
    return
  }

  req.dotwatchClientIp = ip

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws, req) => {
  const ip = req.dotwatchClientIp || getRequestIp(req)
  const state = {
    ip,
    authenticated: false,
    authenticating: false,
    userId: '',
    connectedAt: Date.now(),
    messageWindowStartedAt: Date.now(),
    messageCount: 0,
  }

  socketStates.set(ws, state)
  ws.isAlive = true

  console.log('WS connected:', {
    ip,
    connectedSockets: socketStates.size,
  })

  const subscribeTimeout = setTimeout(() => {
    if (!state.authenticated) {
      console.warn('WS subscribe timeout:', ip)
      closeWebSocketPolicy(ws, 'WebSocket subscribe timeout')
    }
  }, env.wsSubscribeTimeoutMs)
  subscribeTimeout.unref?.()

  sendSerializedPayload(
    ws,
    JSON.stringify({
      type: 'connected',
      message: 'WebSocket connected',
    }),
    { ip, type: 'connected' }
  )

  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', async (message, isBinary) => {
    if (!consumeSocketMessage(state)) {
      wsSecurityCounters.rejectedMessageRate += 1
      closeWebSocketPolicy(ws, 'WebSocket message rate limit exceeded')
      return
    }

    if (isBinary) {
      wsSecurityCounters.rejectedProtocol += 1
      closeWebSocketPolicy(ws, 'Binary WebSocket messages are not supported')
      return
    }

    let data

    try {
      data = JSON.parse(String(message))
    } catch {
      wsSecurityCounters.rejectedProtocol += 1
      closeWebSocketPolicy(ws, 'Invalid WebSocket message')
      return
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      wsSecurityCounters.rejectedProtocol += 1
      closeWebSocketPolicy(ws, 'Invalid WebSocket message')
      return
    }

    if (!state.authenticated) {
      if (data.type !== 'subscribe' || state.authenticating) {
        wsSecurityCounters.rejectedProtocol += 1
        closeWebSocketPolicy(ws, 'Subscribe authentication is required')
        return
      }

      state.authenticating = true

      try {
        const token = data.token || data.idToken || data.authToken
        let userId = ''

        if (token) {
          const decoded = await verifyWebSocketToken(token)
          userId = String(decoded.uid)
        } else if (env.isDevelopment && data.userId) {
          userId = String(data.userId)
          console.warn('WS legacy subscribe accepted in development only:', {
            userId,
          })
        } else {
          closeWebSocketPolicy(ws, 'Missing WebSocket token')
          return
        }

        if (!socketStates.has(ws) || ws.readyState !== ws.OPEN) {
          return
        }

        if (getClientCountByUser(userId) >= env.wsMaxClientsPerUser) {
          closeWebSocketPolicy(ws, 'Too many WebSocket connections for user')
          return
        }

        clearTimeout(subscribeTimeout)
        state.authenticated = true
        state.authenticating = false
        state.userId = userId
        clients.set(ws, userId)

        console.log('WS subscribed:', {
          userId,
          ip,
          clientsForUser: getClientCountByUser(userId),
          totalClients: clients.size,
        })

        sendSerializedPayload(
          ws,
          JSON.stringify({
            type: 'subscribed',
            userId,
          }),
          { userId, ip, type: 'subscribed' }
        )
      } catch (error) {
        state.authenticating = false
        console.warn('WS authentication rejected:', {
          ip,
          message: error.message,
        })
        closeWebSocketPolicy(ws, 'WebSocket authentication failed')
      }

      return
    }

    if (data.type === 'ping') {
      sendSerializedPayload(
        ws,
        JSON.stringify({
          type: 'pong',
          time: new Date().toISOString(),
        }),
        { userId: state.userId, ip, type: 'pong' }
      )
      return
    }

    wsSecurityCounters.rejectedProtocol += 1
    closeWebSocketPolicy(ws, 'Unsupported WebSocket message type')
  })

  ws.on('close', () => {
    clearTimeout(subscribeTimeout)
    if (ws.policyCloseTimer) clearTimeout(ws.policyCloseTimer)
    const userId = clients.get(ws)
    cleanupSocket(ws)

    console.log('WS closed:', {
      userId,
      ip,
      totalClients: clients.size,
      connectedSockets: socketStates.size,
    })
  })

  ws.on('error', (error) => {
    clearTimeout(subscribeTimeout)
    if (ws.policyCloseTimer) clearTimeout(ws.policyCloseTimer)
    const userId = clients.get(ws)

    console.error('WebSocket error:', {
      userId,
      ip,
      message: error.message,
    })

    cleanupSocket(ws)
  })
})

export function broadcastToUser(userId, payload) {
  if (!userId) return 0

  const targetUserId = String(userId)
  const message = JSON.stringify(payload)
  let sentCount = 0
  let matchedCount = 0

  for (const [ws, clientUserId] of clients.entries()) {
    if (clientUserId !== targetUserId) continue

    matchedCount += 1

    if (
      sendSerializedPayload(ws, message, {
        userId: targetUserId,
        type: payload?.type,
      })
    ) {
      sentCount += 1
    }
  }

  if (sentCount > 0) {
    console.log('WS broadcast sent:', {
      userId: targetUserId,
      type: payload?.type,
      sentCount,
    })
  }

  if (matchedCount === 0 && payload?.type !== 'device:update') {
    console.warn('WS broadcast skipped: no matching subscriber', {
      userId: targetUserId,
      type: payload?.type,
      connectedClients: clients.size,
    })
  }

  return sentCount
}

export function broadcastToAll(payload) {
  const message = JSON.stringify(payload)
  let sentCount = 0

  for (const [ws, userId] of clients.entries()) {
    if (
      sendSerializedPayload(ws, message, {
        userId,
        type: payload?.type,
      })
    ) {
      sentCount += 1
    }
  }

  return sentCount
}

app.set('wss', wss)
app.set('broadcastToUser', broadcastToUser)
app.set('broadcastToAll', broadcastToAll)

const opsHeartbeatInterval = startOpsHeartbeat(() => ({
  websocket: getWebSocketSummary(),
  shuttingDown: isShuttingDown,
}))

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.apiRateLimitPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
})

const ingestLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.ingestRateLimitPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(requestContext)
app.use(createHttpLogger())

app.use((req, res, next) => {
  if (!isShuttingDown) {
    next()
    return
  }

  res.setHeader('connection', 'close')
  res.status(503).json({
    message: 'Server is shutting down',
    requestId: req.requestId,
  })
})

app.use(helmet())

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }

      if (env.corsOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      console.warn('CORS blocked origin:', origin)
      callback(
        Object.assign(new Error('CORS origin is not allowed'), {
          status: 403,
          code: 'CORS_BLOCKED',
        })
      )
    },
    credentials: true,
  })
)

app.use(express.json({ limit: env.jsonBodyLimit }))

app.get('/health/live', (req, res) => {
  res.json({
    ok: true,
    service: 'dotwatch-backend',
    environment: env.nodeEnv,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  })
})

app.get('/health/ready', async (req, res) => {
  const health = await buildHealthResponse({
    includeDatabase: true,
    websocketSummary: env.isDevelopment ? getWebSocketSummary() : 'enabled',
  })

  res.status(health.statusCode).json({
    ...health.body,
    requestId: req.requestId,
  })
})

app.get('/health', async (req, res) => {
  const health = await buildHealthResponse({
    includeDatabase: true,
    websocketSummary: env.isDevelopment ? getWebSocketSummary() : 'enabled',
  })

  res.status(health.statusCode).json({
    ...health.body,
    requestId: req.requestId,
  })
})

app.get('/debug/tables', requireDevelopment, async (req, res) => {
  const result = await pool.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name IN ('device_models', 'device_model_metrics')
    ORDER BY table_schema, table_name
  `)

  res.json(result.rows)
})

app.get('/debug/db', requireDevelopment, async (req, res) => {
  const result = await pool.query(`
    SELECT current_database(), current_user, inet_server_port()
  `)

  res.json(result.rows[0])
})

app.get('/debug/ws', requireDevelopment, (req, res) => {
  const clientList = []

  for (const [ws, userId] of clients.entries()) {
    clientList.push({
      userId,
      readyState: getSocketStateLabel(ws),
      isAlive: Boolean(ws.isAlive),
    })
  }

  res.json({
    totalClients: clients.size,
    clients: clientList,
  })
})

app.use('/api/devices', apiLimiter, devicesRouter)
app.use('/api/demo', apiLimiter, requireDevelopment, demoRouter)
app.use('/api/demo-generator', apiLimiter, requireDevelopment, demoGeneratorRouter)
app.use('/api/ingest', ingestLimiter, ingestRouter)
app.use('/api/alarms', apiLimiter, alarmsRouter)
app.use('/api/alarm-rules', apiLimiter, alarmRulesRouter)
app.use('/api/alarm-states', apiLimiter, alarmStateRouter)
app.use('/api/admin', apiLimiter, adminRouter)
app.use('/api/billing', apiLimiter, billingRouter)
app.use('/api/mobile-push', apiLimiter, mobilePushRouter)
app.use('/api/tenant', apiLimiter, tenantRouter)
app.use('/api/organizations', apiLimiter, organizationsRouter)
app.use('/api/sites', apiLimiter, sitesRouter)
app.use('/api/device-groups', apiLimiter, deviceGroupsRouter)
app.use('/api/activity', apiLimiter, activityRouter)
app.use('/api/internal/weather', apiLimiter, weatherVirtualDeviceRouter)
app.use('/api', apiLimiter, deviceMetricsRoutes)
app.use('/api', apiLimiter, deviceModelsRoutes)

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      const userId = clients.get(ws)

      console.warn('WS heartbeat terminate:', {
        userId,
      })

      cleanupSocket(ws)
      ws.terminate()
      return
    }

    ws.isAlive = false
    ws.ping()
  })
}, 30_000)
heartbeatInterval.unref?.()

const offlineDetectionInterval = setInterval(async () => {
  try {
    const statusChanges = await markOfflineDevices()
    const offlineDeviceIds = statusChanges.offline.map((device) => device.id)

    if (offlineDeviceIds.length === 0) {
      return
    }

    const result = await pool.query(`
      SELECT
        d.id,
        d.user_id,
        u.firebase_uid,
        d.device_code,
        d.name,
        d.group_name,
        d.status,
        d.last_seen_at,
        d.last_ingest_at,
        d.firmware_version,
        d.latitude,
        d.longitude,
        d.map_url,
        d.model_id,
        dm.model_key,
        dm.model_name,
        dm.metric_count
      FROM devices d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN device_models dm ON dm.id = d.model_id
      WHERE d.is_active = true
        AND d.id = ANY($1::bigint[])
    `, [offlineDeviceIds])

    for (const device of result.rows) {
      broadcastToUser(device.firebase_uid, {
        type: 'device:update',
        data: device,
      })

      const activity = await createDeviceStatusActivity({
        userId: device.user_id,
        deviceId: device.id,
        deviceName: device.name || device.device_code,
        status: 'offline',
      })

      if (activity) {
        broadcastToUser(device.firebase_uid, {
          type: 'activity',
          data: activity,
        })
      }
    }
  } catch (error) {
    console.error('Offline detection failed:', error.message)
  }
}, env.deviceStatusCheckSeconds * 1000)
offlineDetectionInterval.unref?.()

app.use(notFoundHandler)
app.use(errorHandler)

const listeningServer = server.listen(env.port, () => {
  logger.info({ event: 'listening', port: env.port }, `dotWatch backend running on port ${env.port}`)
})

const weatherScheduler = startWeatherVirtualDeviceScheduler({ app, logger })

async function shutdown(signal) {
  if (isShuttingDown) return

  isShuttingDown = true
  logger.info({ event: 'shutdown_start', signal }, `Received ${signal}. Shutting down dotWatch backend...`)

  clearInterval(heartbeatInterval)
  clearInterval(offlineDetectionInterval)
  weatherScheduler?.stop?.()
  if (opsHeartbeatInterval) clearInterval(opsHeartbeatInterval)

  const forceExitTimer = setTimeout(() => {
    logger.error({ event: 'shutdown_timeout' }, 'Graceful shutdown timeout. Forcing exit.')
    process.exit(1)
  }, env.shutdownTimeoutMs)
  forceExitTimer.unref?.()

  for (const ws of wss.clients) {
    try {
      ws.close(1001, 'Server shutting down')
    } catch {
      // Ignore WebSocket close errors during shutdown.
    }
  }

  await new Promise((resolve) => {
    listeningServer.close(resolve)
  })

  try {
    await pool.end()
  } catch (error) {
    logger.error({ event: 'postgres_pool_shutdown_failed', err: error }, 'Postgres pool shutdown failed')
  }

  clearTimeout(forceExitTimer)
  logger.info({ event: 'shutdown_complete' }, 'dotWatch backend shutdown complete')
}

process.on('unhandledRejection', (reason) => {
  logger.error({ event: 'unhandled_rejection', reason }, 'Unhandled promise rejection')
})

process.on('uncaughtException', (error) => {
  logger.fatal({ event: 'uncaught_exception', err: error }, 'Uncaught exception')
  process.exit(1)
})

process.on('SIGTERM', () => {
  shutdown('SIGTERM').finally(() => process.exit(0))
})

process.on('SIGINT', () => {
  shutdown('SIGINT').finally(() => process.exit(0))
})



