import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { pool } from '../db/pool.js'

const router = Router()

router.use(authUser)
router.use(loadUser)

const ALLOWED_ALARM_OPERATORS = new Set(['>', '>=', '<', '<=', '=', '==', '!='])
const ALLOWED_ALARM_SEVERITIES = new Set(['warning', 'critical'])

function normalizeAlarmPayload(payload = {}) {
  const metric = String(payload.metric || '').trim()
  const operator = String(payload.operator || '').trim()
  const severity = String(payload.severity || 'warning').trim()
  const threshold = Number(payload.threshold)
  const notificationMessage = String(payload.notification_message || '').trim()

  if (!metric) {
    return {
      error: 'Metric is required',
    }
  }

  if (!ALLOWED_ALARM_OPERATORS.has(operator)) {
    return {
      error: 'Invalid operator',
    }
  }

  if (!Number.isFinite(threshold)) {
    return {
      error: 'Threshold must be a valid number',
    }
  }

  if (!ALLOWED_ALARM_SEVERITIES.has(severity)) {
    return {
      error: 'Invalid severity',
    }
  }

  if (notificationMessage.length > 300) {
    return {
      error: 'Notification message must not exceed 300 characters',
    }
  }

  return {
    value: {
      metric,
      operator,
      threshold,
      severity,
      notificationMessage,
    },
  }
}

async function requireOwnedAlarmDevice(deviceId, userId) {
  const result = await pool.query(
    `
    SELECT id
    FROM devices
    WHERE id = $1
      AND user_id = $2
      AND is_active = true
    LIMIT 1
    `,
    [deviceId, userId]
  )

  return result.rows[0] || null
}

/**
 * GET /api/alarm-rules
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        ar.*,
        d.name AS device_name,
        dm.metric_name,
        dm.unit
      FROM alarm_rules ar
      LEFT JOIN devices d
        ON d.id = ar.device_id
      LEFT JOIN device_metrics dm
        ON dm.device_id = ar.device_id
        AND dm.metric_key = ar.metric
      WHERE ar.user_id = $1
      ORDER BY ar.id DESC
      `,
      [req.dbUser.id]
    )

    res.json(result.rows)
  })
)

/**
 * POST /api/alarm-rules
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { device_id } = req.body

    if (!device_id) {
      return res.status(400).json({
        message: 'Device is required',
      })
    }

    const normalized = normalizeAlarmPayload(req.body)

    if (normalized.error) {
      return res.status(400).json({
        message: normalized.error,
      })
    }

    const ownedDevice = await requireOwnedAlarmDevice(device_id, req.dbUser.id)

    if (!ownedDevice) {
      return res.status(404).json({
        message: 'Device not found or access denied',
      })
    }

    const {
      metric,
      operator,
      threshold,
      severity,
      notificationMessage,
    } = normalized.value
    const isActive =
      typeof req.body.is_active === 'boolean' ? req.body.is_active : true

    const result = await pool.query(
      `
      INSERT INTO alarm_rules (
        user_id,
        device_id,
        metric,
        operator,
        threshold,
        severity,
        notification_message,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        req.dbUser.id,
        device_id,
        metric,
        operator,
        threshold,
        severity,
        notificationMessage || null,
        isActive,
      ]
    )

    res.status(201).json(result.rows[0])
  })
)

/**
 * PUT /api/alarm-rules/:id
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const normalized = normalizeAlarmPayload(req.body)

    if (normalized.error) {
      return res.status(400).json({
        message: normalized.error,
      })
    }

    const {
      metric,
      operator,
      threshold,
      severity,
      notificationMessage,
    } = normalized.value
    const isActive =
      typeof req.body.is_active === 'boolean' ? req.body.is_active : undefined

    const result = await pool.query(
      `
      UPDATE alarm_rules
      SET
        metric = $1,
        operator = $2,
        threshold = $3,
        severity = $4,
        notification_message = $5,
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
      WHERE id = $7
        AND user_id = $8
      RETURNING *
      `,
      [
        metric,
        operator,
        threshold,
        severity,
        notificationMessage || null,
        isActive,
        req.params.id,
        req.dbUser.id,
      ]
    )

    if (!result.rows.length) {
      return res.status(404).json({
        message: 'Alarm rule not found',
      })
    }

    res.json(result.rows[0])
  })
)

/**
 * DELETE /api/alarm-rules/:id
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `
      DELETE FROM alarm_rules
      WHERE id = $1
        AND user_id = $2
      RETURNING id
      `,
      [req.params.id, req.dbUser.id]
    )

    if (!result.rows.length) {
      return res.status(404).json({
        message: 'Alarm rule not found',
      })
    }

    res.json({
      success: true,
    })
  })
)

export default router
