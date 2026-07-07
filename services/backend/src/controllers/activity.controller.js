import { pool } from '../db/pool.js'
import { listActivityLogs } from '../services/activity.service.js'

function parseLimit(value, fallback = 50) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) return fallback

  return Math.min(Math.max(Math.floor(numberValue), 1), 100)
}

export async function listActivity(req, res) {
  const user = req.dbUser
  const rawDeviceId = req.query.deviceId || req.query.device_id
  const limit = parseLimit(req.query.limit, 50)
  let deviceId = null

  if (rawDeviceId) {
    deviceId = Number(rawDeviceId)

    if (!Number.isInteger(deviceId)) {
      return res.status(400).json({
        message: 'Invalid device id',
      })
    }

    const deviceCheck = await pool.query(
      `
      SELECT id
      FROM devices
      WHERE id = $1
        AND user_id = $2
        AND is_active = true
      LIMIT 1
      `,
      [deviceId, user.id]
    )

    if (!deviceCheck.rows.length) {
      return res.status(404).json({
        message: 'Device not found',
      })
    }
  }

  const rows = await listActivityLogs({
    userId: user.id,
    deviceId,
    limit,
  })

  res.json(rows)
}
