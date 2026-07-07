import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'

import {
  acknowledgeAlarm,
  getAlarmSummary,
  listActiveAlarms,
  listAlarms,
} from '../controllers/alarms.controller.js'

export const alarmsRouter = Router()

alarmsRouter.use(authUser)
alarmsRouter.use(loadUser)

alarmsRouter.get('/summary', asyncHandler(getAlarmSummary))
alarmsRouter.get('/active', asyncHandler(listActiveAlarms))
alarmsRouter.get('/', asyncHandler(listAlarms))
alarmsRouter.post('/:id/acknowledge', asyncHandler(acknowledgeAlarm))
