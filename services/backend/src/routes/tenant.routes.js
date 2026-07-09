import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { getTenantContext } from '../controllers/tenant.controller.js'

export const tenantRouter = Router()

tenantRouter.use(authUser)
tenantRouter.use(loadUser)

tenantRouter.get('/context', asyncHandler(getTenantContext))
