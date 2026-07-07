import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { listActivity } from '../controllers/activity.controller.js'

export const activityRouter = Router()

activityRouter.use(authUser)
activityRouter.use(loadUser)

activityRouter.get('/', asyncHandler(listActivity))
