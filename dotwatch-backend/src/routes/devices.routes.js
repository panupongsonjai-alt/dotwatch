import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import {
  createDevice,
  getDevice,
  getHistory,
  listDevices,
  updateDevice,
  deleteDevice,
  resetDeviceSecret,
} from '../controllers/devices.controller.js'

export const devicesRouter = Router()

devicesRouter.use(authUser)
devicesRouter.use(loadUser)

devicesRouter.get('/', asyncHandler(listDevices))
devicesRouter.post('/', asyncHandler(createDevice))
devicesRouter.get('/:id', asyncHandler(getDevice))
devicesRouter.put('/:id', asyncHandler(updateDevice))
devicesRouter.post('/:id/reset-secret', asyncHandler(resetDeviceSecret))
devicesRouter.delete('/:id', asyncHandler(deleteDevice))
devicesRouter.get('/:id/history', asyncHandler(getHistory))