import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'

import {
  acknowledgeAlarm,
  clearAlarmEvents,
  clearNotificationFeed,
  getAlarmSummary,
  listActiveAlarms,
  listAlarms,
  listNotificationFeedDeletions,
} from '../controllers/alarms.controller.js'

export const alarmsRouter = Router()

alarmsRouter.use(authUser)
alarmsRouter.use(loadUser)

alarmsRouter.get('/summary', asyncHandler(getAlarmSummary))
alarmsRouter.get(
  '/notification-feed-deletions',
  asyncHandler(listNotificationFeedDeletions)
)
alarmsRouter.post(
  '/notification-feed/clear',
  asyncHandler(clearNotificationFeed)
)
alarmsRouter.get('/active', asyncHandler(listActiveAlarms))

// Keep all clear endpoint variants during rolling deployments. The dashboard
// uses DELETE /api/alarms first and falls back to POST /api/alarms/clear.
alarmsRouter.post('/clear', asyncHandler(clearAlarmEvents))
alarmsRouter.post('/events/clear', asyncHandler(clearAlarmEvents))
alarmsRouter.delete('/clear', asyncHandler(clearAlarmEvents))
alarmsRouter.get('/', asyncHandler(listAlarms))
alarmsRouter.delete('/', asyncHandler(clearAlarmEvents))
alarmsRouter.post('/:id/acknowledge', asyncHandler(acknowledgeAlarm))
