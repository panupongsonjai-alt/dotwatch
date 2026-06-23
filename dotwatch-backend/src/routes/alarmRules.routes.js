import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { pool } from '../db/pool.js'

const router = Router()

router.use(authUser)
router.use(loadUser)

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
    const {
      device_id,
      metric,
      operator,
      threshold,
      severity = 'warning',
    } = req.body

    if (!device_id) {
      return res.status(400).json({
        message: 'Device is required',
      })
    }

    if (!metric) {
      return res.status(400).json({
        message: 'Metric is required',
      })
    }

    const result = await pool.query(
      `
      INSERT INTO alarm_rules (
        user_id,
        device_id,
        metric,
        operator,
        threshold,
        severity,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,true)
      RETURNING *
      `,
      [req.dbUser.id, device_id, metric, operator, Number(threshold), severity]
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
    const { metric, operator, threshold, severity, is_active } = req.body

    const result = await pool.query(
      `
      UPDATE alarm_rules
      SET
        metric = $1,
        operator = $2,
        threshold = $3,
        severity = $4,
        is_active = COALESCE($5, is_active)
      WHERE id = $6
        AND user_id = $7
      RETURNING *
      `,
      [
        metric,
        operator,
        Number(threshold),
        severity,
        is_active,
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
