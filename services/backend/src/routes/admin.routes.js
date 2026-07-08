import { Router } from 'express'
import {
  createAdminDeviceModel,
  deleteAdminDeviceModel,
  getAdminCommercialSummary,
  getAdminMe,
  getAdminStats,
  listAdminAuditLogs,
  listAdminDeviceModels,
  listAdminDevices,
  listAdminPlans,
  listAdminUsers,
  updateAdminDeviceModel,
  updateAdminUserPlan,
  updateAdminUserRole,
  updateAdminUserStatus,
} from '../controllers/admin.controller.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const adminRouter = Router()

adminRouter.use(authUser)
adminRouter.use(loadUser)
adminRouter.use(requireAdmin)

adminRouter.get('/me', asyncHandler(getAdminMe))
adminRouter.get('/stats', asyncHandler(getAdminStats))
adminRouter.get('/overview', asyncHandler(getAdminStats))
adminRouter.get('/commercial-summary', asyncHandler(getAdminCommercialSummary))
adminRouter.get('/plans', asyncHandler(listAdminPlans))
adminRouter.get('/users', asyncHandler(listAdminUsers))
adminRouter.patch('/users/:userId/status', asyncHandler(updateAdminUserStatus))
adminRouter.patch('/users/:userId/plan', asyncHandler(updateAdminUserPlan))
adminRouter.patch(
  '/users/:userId/role',
  requireSuperAdmin,
  asyncHandler(updateAdminUserRole)
)
adminRouter.get('/devices', asyncHandler(listAdminDevices))
adminRouter.get('/device-models', asyncHandler(listAdminDeviceModels))
adminRouter.post('/device-models', requireSuperAdmin, asyncHandler(createAdminDeviceModel))
adminRouter.put('/device-models/:modelId', requireSuperAdmin, asyncHandler(updateAdminDeviceModel))
adminRouter.delete('/device-models/:modelId', requireSuperAdmin, asyncHandler(deleteAdminDeviceModel))
adminRouter.get('/audit-logs', asyncHandler(listAdminAuditLogs))
