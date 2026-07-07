import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import {
  createDeviceGroup,
  listDeviceGroups,
  updateDeviceGroup,
} from '../controllers/deviceGroups.controller.js'

export const deviceGroupsRouter = Router()

deviceGroupsRouter.use(authUser)
deviceGroupsRouter.use(loadUser)

deviceGroupsRouter.get('/', asyncHandler(listDeviceGroups))
deviceGroupsRouter.post('/', asyncHandler(createDeviceGroup))
deviceGroupsRouter.put('/:id', asyncHandler(updateDeviceGroup))
