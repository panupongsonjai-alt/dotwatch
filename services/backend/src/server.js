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

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

app.set('trust proxy', 1)
app.disable('x-powered-by')

const clients = new Map()
let isShuttingDown = false

console.log('dotWatch backend starting:', {
  nodeEnv: env.nodeEnv,
  port: env.port,
  corsOrigins: env.isDevelopment ? env.corsOrigins : env.corsOrigins.length,
  databaseConfigured: Boolean(env.databaseUrl),
  apiRateLimitPerMinute: env.apiRateLimitPerMinute,
  ingestRateLimitPerMinute: env.ingestRateLimitPerMinute,
  deviceWarningAfterSeconds: env.deviceWarningAfterSeconds,
  deviceOfflineAfterSeconds: env.deviceOfflineAfterSeconds,
})

function getSocketStateLabel(ws) {
  if (ws.readyState === ws.CONNECTING) return 'CONNECTING'
  if (ws.readyState === ws.OPEN) return 'OPEN'
  if (ws.readyState === ws.CLOSING) return 'CLOSING'
  if (ws.readyState === ws.CLOSED) return 'CLOSED'
  return String(ws.readyState)
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

  for (const [ws, userId] of clients.entries()) {
    byUser[userId] = (byUser[userId] || 0) + 1
  }

  return {
    totalClients: clients.size,
    connectedSockets: wss.clients.size,
    byUser,
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

function closeWebSocketUnauthorized(ws, message = 'Unauthorized WebSocket') {
  try {
    ws.send(
      JSON.stringify({
        type: 'error',
        message,
      })
    )
  } catch {
    // Ignore send errors before closing the socket.
  }

  ws.close(1008, message)
}

function closeWebSocketTooManyConnections(ws) {
  closeWebSocketUnauthorized(ws, 'Too many WebSocket connections')
}

function requireDevelopment(req, res, next) {
  if (env.isDevelopment) {
    next()
    return
  }

  res.status(404).json({ message: 'Not found' })
}

wss.on('connection', (ws, req) => {
  const ip =
    req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'

  console.log('WS connected:', ip)

  const subscribeTimeout = setTimeout(() => {
    if (!clients.has(ws)) {
      console.warn('WS subscribe timeout:', ip)
      closeWebSocketUnauthorized(ws, 'WebSocket subscribe timeout')
    }
  }, env.wsSubscribeTimeoutMs)

  ws.isAlive = true

  ws.send(
    JSON.stringify({
      type: 'connected',
      message: 'WebSocket connected',
    })
  )

  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message)

      if (data.type === 'subscribe') {
        const token = data.token || data.idToken || data.authToken
        let userId = ''

        if (token) {
          const decoded = await verifyWebSocketToken(token)
          userId = String(decoded.uid)
        } else if (env.isDevelopment && data.userId) {
          // Development-only fallback for local testing.
          // Production must always subscribe with a verified Firebase token.
          userId = String(data.userId)

          console.warn('WS legacy subscribe accepted in development only:', {
            userId,
          })
        } else {
          closeWebSocketUnauthorized(ws, 'Missing WebSocket token')
          return
        }

        if (getClientCountByUser(userId) >= env.wsMaxClientsPerUser) {
          closeWebSocketTooManyConnections(ws)
          return
        }

        clearTimeout(subscribeTimeout)
        clients.set(ws, userId)

        console.log('WS subscribed:', {
          userId,
          clientsForUser: getClientCountByUser(userId),
          totalClients: clients.size,
        })

        ws.send(
          JSON.stringify({
            type: 'subscribed',
            userId,
          })
        )

        return
      }

      if (data.type === 'ping') {
        ws.send(
          JSON.stringify({
            type: 'pong',
            time: new Date().toISOString(),
          })
        )
      }
    } catch (error) {
      console.error('WebSocket message error:', error.message)
      closeWebSocketUnauthorized(ws, 'Invalid WebSocket token')
    }
  })

  ws.on('close', () => {
    clearTimeout(subscribeTimeout)

    const userId = clients.get(ws)

    clients.delete(ws)

    console.log('WS closed:', {
      userId,
      totalClients: clients.size,
    })
  })

  ws.on('error', (error) => {
    clearTimeout(subscribeTimeout)

    const userId = clients.get(ws)

    console.error('WebSocket error:', {
      userId,
      message: error.message,
    })

    clients.delete(ws)
  })
})

export function broadcastToUser(userId, payload) {
  if (!userId) return 0

  const targetUserId = String(userId)
  let sentCount = 0
  let matchedCount = 0

  for (const [ws, clientUserId] of clients.entries()) {
    if (clientUserId !== targetUserId) continue

    matchedCount += 1

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload))
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

  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message)
      sentCount += 1
    }
  })

  return sentCount
}

app.set('wss', wss)
app.set('broadcastToUser', broadcastToUser)
app.set('broadcastToAll', broadcastToAll)

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
app.use('/api/ingest', ingestLimiter, ingestRouter)
app.use('/api/alarms', apiLimiter, alarmsRouter)
app.use('/api/alarm-rules', apiLimiter, alarmRulesRouter)
app.use('/api/alarm-states', apiLimiter, alarmStateRouter)
app.use('/api/admin', apiLimiter, adminRouter)
app.use('/api/billing', apiLimiter, billingRouter)
app.use('/api/organizations', apiLimiter, organizationsRouter)
app.use('/api/sites', apiLimiter, sitesRouter)
app.use('/api/device-groups', apiLimiter, deviceGroupsRouter)
app.use('/api/activity', apiLimiter, activityRouter)
app.use('/api', apiLimiter, deviceMetricsRoutes)
app.use('/api', apiLimiter, deviceModelsRoutes)

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      const userId = clients.get(ws)

      console.warn('WS heartbeat terminate:', {
        userId,
      })

      clients.delete(ws)
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
  console.log(`dotWatch backend running on port ${env.port}`)
})

async function shutdown(signal) {
  if (isShuttingDown) return

  isShuttingDown = true
  console.log(`Received ${signal}. Shutting down dotWatch backend...`)

  clearInterval(heartbeatInterval)
  clearInterval(offlineDetectionInterval)

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timeout. Forcing exit.')
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
    console.error('Postgres pool shutdown failed:', error.message)
  }

  clearTimeout(forceExitTimer)
  console.log('dotWatch backend shutdown complete')
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM').finally(() => process.exit(0))
})

process.on('SIGINT', () => {
  shutdown('SIGINT').finally(() => process.exit(0))
})
