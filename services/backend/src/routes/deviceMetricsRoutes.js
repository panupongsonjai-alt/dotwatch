import { Router } from 'express'
import {
  deleteDeviceMetric,
  listDeviceMetrics,
  resetDeviceMetrics,
  saveDeviceMetrics,
} from '../controllers/deviceMetricsController.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { pool } from '../db/pool.js'

const router = Router()

router.use(authUser)
router.use(loadUser)

async function requireOwnedDevice(req, res, next) {
  const { deviceId } = req.params

  if (!deviceId) {
    return res.status(400).json({
      message: 'Device is required',
    })
  }

  const result = await pool.query(
    `
    SELECT id
    FROM devices
    WHERE id = $1
      AND user_id = $2
      AND is_active = true
    LIMIT 1
    `,
    [deviceId, req.dbUser.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  next()
}

router.get(
  '/devices/:deviceId/metrics',
  asyncHandler(requireOwnedDevice),
  asyncHandler(listDeviceMetrics)
)

router.put(
  '/devices/:deviceId/metrics',
  asyncHandler(requireOwnedDevice),
  asyncHandler(saveDeviceMetrics)
)

router.post(
  '/devices/:deviceId/metrics/reset',
  asyncHandler(requireOwnedDevice),
  asyncHandler(resetDeviceMetrics)
)

router.delete(
  '/devices/:deviceId/metrics/:metricId',
  asyncHandler(requireOwnedDevice),
  asyncHandler(deleteDeviceMetric)
)

export default router
