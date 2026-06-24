import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import http from 'http'
import { WebSocketServer } from 'ws'

import { env } from './config/env.js'
import { devicesRouter } from './routes/devices.routes.js'
import { ingestRouter } from './routes/ingest.routes.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { markOfflineDevices } from './services/deviceStatus.service.js'
import { alarmsRouter } from './routes/alarms.routes.js'
import alarmRulesRouter from './routes/alarmRules.routes.js'
import { demoRouter } from './routes/demo.routes.js'
import deviceMetricsRoutes from './routes/deviceMetricsRoutes.js'
import deviceModelsRoutes from './routes/deviceModelsRoutes.js'
import { adminRouter } from './routes/admin.routes.js'
import { pool } from './db/pool.js'

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const clients = new Map()

console.log('dotWatch backend starting:', {
  nodeEnv: env.nodeEnv,
  port: env.port,
  corsOrigins: env.corsOrigins,
  databaseConfigured: Boolean(env.databaseUrl),
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

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)

      if (data.type === 'subscribe' && data.userId) {
        const userId = String(data.userId)

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
      ws.close()
    }
  })

  ws.on('close', () => {
    const userId = clients.get(ws)

    clients.delete(ws)

    console.log('WS closed:', {
      userId,
      totalClients: clients.size,
    })
  })

  ws.on('error', (error) => {
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
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
})

const ingestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 50_000,
  standardHeaders: true,
  legacyHeaders: false,
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

      callback(new Error(`CORS blocked origin: ${origin}`))
    },
    credentials: true,
  })
)

app.use(express.json({ limit: '128kb' }))

app.get('/health', async (req, res) => {
  const startedAt = Date.now()
  let database = 'connected'

  try {
    await pool.query('SELECT 1')
  } catch (error) {
    database = 'error'
    console.error('Health database check failed:', error.message)
  }

  const statusCode = database === 'connected' ? 200 : 503

  res.status(statusCode).json({
    ok: database === 'connected',
    service: 'dotwatch-backend',
    environment: env.nodeEnv,
    database,
    websocket: getWebSocketSummary(),
    uptime: Math.round(process.uptime()),
    latencyMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
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
app.use('/api/demo', apiLimiter, demoRouter)
app.use('/api/ingest', ingestLimiter, ingestRouter)
app.use('/api/alarms', apiLimiter, alarmsRouter)
app.use('/api/alarm-rules', apiLimiter, alarmRulesRouter)
app.use('/api/admin', apiLimiter, adminRouter)
app.use('/api', deviceMetricsRoutes)
app.use('/api', deviceModelsRoutes)

setInterval(() => {
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

setInterval(async () => {
  try {
    await markOfflineDevices()

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
        AND d.status = 'offline'
        AND d.last_ingest_at IS NOT NULL
        AND d.last_ingest_at < now() - interval '30 seconds'
    `)

    result.rows.forEach((device) => {
      broadcastToUser(device.firebase_uid, {
        type: 'device:update',
        data: device,
      })
    })
  } catch (error) {
    console.error('Offline detection failed:', error.message)
  }
}, 30_000)

app.use(errorHandler)

server.listen(env.port, () => {
  console.log(`dotWatch backend running on port ${env.port}`)
})
