import { Router } from 'express'
import {
  getAdminMe,
  getAdminStats,
  listAdminAuditLogs,
  listAdminDevices,
  listAdminUsers,
  updateAdminUserPlan,
  updateAdminUserStatus,
} from '../controllers/admin.controller.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { requireAdmin } from '../middlewares/requireAdmin.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const adminRouter = Router()

adminRouter.use(authUser)
adminRouter.use(loadUser)
adminRouter.use(requireAdmin)

adminRouter.get('/me', asyncHandler(getAdminMe))
adminRouter.get('/stats', asyncHandler(getAdminStats))
adminRouter.get('/overview', asyncHandler(getAdminStats))
adminRouter.get('/users', asyncHandler(listAdminUsers))
adminRouter.patch('/users/:userId/status', asyncHandler(updateAdminUserStatus))
adminRouter.patch('/users/:userId/plan', asyncHandler(updateAdminUserPlan))
adminRouter.get('/devices', asyncHandler(listAdminDevices))
adminRouter.get('/audit-logs', asyncHandler(listAdminAuditLogs))
