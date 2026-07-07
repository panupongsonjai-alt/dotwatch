import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import {
  addOrganizationMember,
  cancelOrganizationInvitation,
  createOrganization,
  getOrganizationOverview,
  listOrganizationInvitations,
  listOrganizationMembers,
  listOrganizations,
  updateOrganizationMember,
} from '../controllers/organizations.controller.js'

export const organizationsRouter = Router()

organizationsRouter.use(authUser)
organizationsRouter.use(loadUser)

organizationsRouter.get('/', asyncHandler(listOrganizations))
organizationsRouter.post('/', asyncHandler(createOrganization))
organizationsRouter.get('/:id/overview', asyncHandler(getOrganizationOverview))
organizationsRouter.get('/:id/members', asyncHandler(listOrganizationMembers))
organizationsRouter.post('/:id/members', asyncHandler(addOrganizationMember))
organizationsRouter.patch(
  '/:id/members/:memberId',
  asyncHandler(updateOrganizationMember)
)
organizationsRouter.get(
  '/:id/invitations',
  asyncHandler(listOrganizationInvitations)
)
organizationsRouter.delete(
  '/:id/invitations/:invitationId',
  asyncHandler(cancelOrganizationInvitation)
)
