import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import {
  getAlarmSummary,
  listActiveAlarms,
  listAlarmHistory,
} from '../controllers/alarmState.controller.js'

export const alarmStateRouter = Router()

alarmStateRouter.use(authUser, loadUser)

alarmStateRouter.get('/summary', asyncHandler(getAlarmSummary))
alarmStateRouter.get('/active', asyncHandler(listActiveAlarms))
alarmStateRouter.get('/history', asyncHandler(listAlarmHistory))
