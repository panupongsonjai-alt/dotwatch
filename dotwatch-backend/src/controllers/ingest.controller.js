import { z } from 'zod'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { broadcastToUser } from '../server.js'

const ingestSchema = z.object({
  temperature: z.number().min(-40).max(125),
  humidity: z.number().min(0).max(100),
  rssi: z.number().optional(),
  firmwareVersion: z.string().max(50).optional(),
  timestamp: z.string().datetime().optional(),
})

export async function ingestReading(req, res) {
  const data = ingestSchema.parse(req.body)
  const device = req.device

  if (device.last_ingest_at) {
    const diff =
      (Date.now() - new Date(device.last_ingest_at).getTime()) / 1000

    if (diff < env.ingestMinIntervalSeconds) {
      return res.status(429).json({ message: 'Device is sending too fast' })
    }
  }

  const time = data.timestamp || new Date().toISOString()

  await pool.query('BEGIN')

  try {
    const readingResult = await pool.query(
      `
      INSERT INTO sensor_readings (
        time,
        device_id,
        temperature,
        humidity,
        rssi
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING time, device_id, temperature, humidity, rssi
      `,
      [time, device.id, data.temperature, data.humidity, data.rssi ?? null]
    )

    const deviceResult = await pool.query(
      `
      UPDATE devices
      SET
        last_seen_at = now(),
        last_ingest_at = now(),
        status = 'online',
        firmware_version = COALESCE($2, firmware_version)
      WHERE id = $1
      RETURNING id, user_id, device_code, name, status, last_seen_at, firmware_version
      `,
      [device.id, data.firmwareVersion || null]
    )

    await pool.query('COMMIT')

    const reading = readingResult.rows[0]
    const updatedDevice = deviceResult.rows[0]

    broadcastToUser(updatedDevice.user_id, {
      type: 'reading',
      data: {
        id: updatedDevice.id,
        user_id: updatedDevice.user_id,
        device_code: updatedDevice.device_code,
        name: updatedDevice.name,
        status: updatedDevice.status,
        last_seen_at: updatedDevice.last_seen_at,
        firmware_version: updatedDevice.firmware_version,
        latest_time: reading.time,
        temperature: reading.temperature,
        humidity: reading.humidity,
        rssi: reading.rssi,
      },
    })

    res.status(201).json({
      ok: true,
      data: {
        deviceId: updatedDevice.id,
        deviceCode: updatedDevice.device_code,
        time: reading.time,
        temperature: reading.temperature,
        humidity: reading.humidity,
        rssi: reading.rssi,
      },
    })
  } catch (error) {
    await pool.query('ROLLBACK')
    throw error
  }
}