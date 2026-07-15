import { Router } from 'express'

import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import {
  getMobilePushStatus,
  registerMobilePushToken,
  unregisterMobilePushToken,
} from '../controllers/mobilePush.controller.js'

export const mobilePushRouter = Router()

mobilePushRouter.use(authUser)
mobilePushRouter.use(loadUser)

mobilePushRouter.get('/status', asyncHandler(getMobilePushStatus))
mobilePushRouter.post('/register', asyncHandler(registerMobilePushToken))
mobilePushRouter.post('/unregister', asyncHandler(unregisterMobilePushToken))
