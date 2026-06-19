import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'

import {
  listAlarmRules,
  createAlarmRule,
  updateAlarmRule,
  deleteAlarmRule,
} from '../controllers/alarmRules.controller.js'

export const alarmRulesRouter = Router()

alarmRulesRouter.use(authUser)
alarmRulesRouter.use(loadUser)

alarmRulesRouter.get('/', asyncHandler(listAlarmRules))
alarmRulesRouter.post('/', asyncHandler(createAlarmRule))
alarmRulesRouter.put('/:id', asyncHandler(updateAlarmRule))
alarmRulesRouter.delete('/:id', asyncHandler(deleteAlarmRule))