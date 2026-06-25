import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import {
  createOrganization,
  getOrganizationOverview,
  listOrganizations,
} from '../controllers/organizations.controller.js'

export const organizationsRouter = Router()

organizationsRouter.use(authUser)
organizationsRouter.use(loadUser)

organizationsRouter.get('/', asyncHandler(listOrganizations))
organizationsRouter.post('/', asyncHandler(createOrganization))
organizationsRouter.get('/:id/overview', asyncHandler(getOrganizationOverview))
