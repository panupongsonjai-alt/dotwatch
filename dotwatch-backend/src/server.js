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
import { pool } from './db/pool.js'

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const clients = new Map()

console.log('DATABASE_URL:', process.env.DATABASE_URL)

wss.on('connection', (ws) => {
  console.log('Dashboard connected via WebSocket')

  ws.send(
    JSON.stringify({
      type: 'connected',
      message: 'WebSocket connected',
    })
  )

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)

      if (data.type === 'subscribe' && data.userId) {
        clients.set(ws, String(data.userId))

        ws.send(
          JSON.stringify({
            type: 'subscribed',
            userId: String(data.userId),
          })
        )
      }
    } catch (error) {
      console.error('WebSocket message error:', error.message)
      ws.close()
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message)
    clients.delete(ws)
  })
})

export function broadcastToUser(userId, payload) {
  if (!userId) return

  for (const [ws, clientUserId] of clients.entries()) {
    if (clientUserId === String(userId) && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload))
    }
  }
}

export function broadcastToAll(payload) {
  const message = JSON.stringify(payload)

  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message)
    }
  })
}

app.set('wss', wss)
app.set('broadcastToUser', broadcastToUser)
app.set('broadcastToAll', broadcastToAll)

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
})

const ingestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 50_000,
})

app.get('/debug/tables', async (req, res) => {
  const result = await pool.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name IN ('device_models', 'device_model_metrics')
    ORDER BY table_schema, table_name
  `)

  res.json(result.rows)
})

app.get('/debug/db', async (req, res) => {
  const result = await pool.query(`
    SELECT current_database(), current_user, inet_server_port()
  `)

  res.json(result.rows[0])
})

app.use(helmet())
app.use(cors({ origin: env.corsOrigin }))
app.use(express.json({ limit: '128kb' }))

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dotwatch-backend' })
})

app.use('/api/devices', apiLimiter, devicesRouter)
app.use('/api/demo', apiLimiter, demoRouter)
app.use('/api/ingest', ingestLimiter, ingestRouter)
app.use('/api/alarms', apiLimiter, alarmsRouter)
app.use('/api/alarm-rules', apiLimiter, alarmRulesRouter)
app.use('/api', deviceMetricsRoutes)
app.use('/api', deviceModelsRoutes)

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
