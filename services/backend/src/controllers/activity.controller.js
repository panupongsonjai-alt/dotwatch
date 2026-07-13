import { pool } from '../db/pool.js'
import {
  clearActivityLogs,
  createActivityLog,
  listActivityLogs,
} from '../services/activity.service.js'

const ACTIVITY_CATEGORIES = new Set([
  'all',
  'session',
  'navigation',
  'changes',
  'device',
  'other',
])

function isValidDateInput(value) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

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

export async function createActivity(req, res) {
  const user = req.dbUser
  const activityType = String(req.body?.activityType || '').trim().toLowerCase()
  const title = String(req.body?.title || '').trim()
  const description = String(req.body?.description || '').trim()
  const severity = String(req.body?.severity || 'info').trim().toLowerCase()
  const rawDeviceId = req.body?.deviceId
  const metadata = req.body?.metadata

  if (!activityType || activityType.length > 80 || !title || title.length > 160) {
    return res.status(400).json({ message: 'Invalid activity data' })
  }

  if (activityType.startsWith('alarm.')) {
    return res.status(400).json({ message: 'Alarm events are not part of operations activity' })
  }

  if (description.length > 500) {
    return res.status(400).json({ message: 'Activity description is too long' })
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return res.status(400).json({ message: 'Invalid activity metadata' })
  }

  if (JSON.stringify(metadata).length > 4000) {
    return res.status(400).json({ message: 'Activity metadata is too large' })
  }

  let deviceId = null
  if (rawDeviceId != null && rawDeviceId !== '') {
    deviceId = Number(rawDeviceId)
    if (!Number.isInteger(deviceId)) {
      return res.status(400).json({ message: 'Invalid device id' })
    }

    const deviceCheck = await pool.query(
      `SELECT id FROM devices WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [deviceId, user.id]
    )
    if (!deviceCheck.rows.length) {
      return res.status(404).json({ message: 'Device not found' })
    }
  }

  const activity = await createActivityLog({
    userId: user.id,
    deviceId,
    activityType,
    title,
    description: description || null,
    severity,
    metadata: {
      ...metadata,
      client: String(req.get('X-dotWatch-Client') || 'unknown').slice(0, 40),
    },
  })

  if (!activity) {
    return res.status(503).json({ message: 'Unable to save activity' })
  }

  return res.status(201).json(activity)
}

export async function clearActivity(req, res) {
  const user = req.dbUser
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : []
  const rawDeviceId = req.body?.deviceId
  const startDate = String(req.body?.startDate || '').trim()
  const endDate = String(req.body?.endDate || '').trim()
  const category = String(req.body?.activityType || 'all').trim().toLowerCase()
  let deviceId = null

  const ids = rawIds.map(Number)
  if (
    ids.length === 0 ||
    ids.length > 200 ||
    ids.some((id) => !Number.isInteger(id) || id < 1)
  ) {
    return res.status(400).json({ message: 'Invalid activity ids' })
  }

  if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
    return res.status(400).json({ message: 'Invalid date range' })
  }

  if (startDate && endDate && startDate > endDate) {
    return res.status(400).json({ message: 'Start date must not be after end date' })
  }

  if (!ACTIVITY_CATEGORIES.has(category)) {
    return res.status(400).json({ message: 'Invalid activity type' })
  }

  if (rawDeviceId != null && rawDeviceId !== '' && rawDeviceId !== 'all') {
    deviceId = Number(rawDeviceId)

    if (!Number.isInteger(deviceId)) {
      return res.status(400).json({ message: 'Invalid device id' })
    }

    const deviceCheck = await pool.query(
      'SELECT id FROM devices WHERE id = $1 AND user_id = $2 LIMIT 1',
      [deviceId, user.id]
    )

    if (!deviceCheck.rows.length) {
      return res.status(404).json({ message: 'Device not found' })
    }
  }

  const deletedIds = await clearActivityLogs({
    userId: user.id,
    ids,
    deviceId,
    startDate,
    endDate,
    category,
  })

  return res.json({
    deletedCount: deletedIds.length,
    ids: deletedIds,
  })
}
