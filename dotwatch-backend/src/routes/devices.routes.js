import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import {
  createDevice,
  getHistory,
  listDevices,
  updateDevice,
  deleteDevice,
  resetDeviceSecret,
} from '../controllers/devices.controller.js'

export const devicesRouter = Router()

devicesRouter.use(authUser)

devicesRouter.get('/', asyncHandler(listDevices))
devicesRouter.post('/', asyncHandler(createDevice))
devicesRouter.put('/:id', asyncHandler(updateDevice))
devicesRouter.post('/:id/reset-secret', asyncHandler(resetDeviceSecret))
devicesRouter.delete('/:id', asyncHandler(deleteDevice))
devicesRouter.get('/:id/history', asyncHandler(getHistory))