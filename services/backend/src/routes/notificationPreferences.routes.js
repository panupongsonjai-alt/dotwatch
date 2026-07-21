import { Router } from 'express'
import rateLimit from 'express-rate-limit'

import {
  getNotificationPreferences,
  testNotificationChannel,
  updateNotificationPreferences,
} from '../controllers/notificationPreferences.controller.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const notificationPreferencesRouter = Router()
const notificationTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many notification tests. Please try again later.' },
})

notificationPreferencesRouter.use(authUser, loadUser)
notificationPreferencesRouter.get('/', asyncHandler(getNotificationPreferences))
notificationPreferencesRouter.put('/', asyncHandler(updateNotificationPreferences))
notificationPreferencesRouter.post('/test', notificationTestLimiter, asyncHandler(testNotificationChannel))
