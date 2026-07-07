import { Router } from 'express'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import {
  getMyBillingSummary,
  listPlans,
} from '../controllers/billing.controller.js'

export const billingRouter = Router()

billingRouter.use(authUser)
billingRouter.use(loadUser)

billingRouter.get('/plans', asyncHandler(listPlans))
billingRouter.get('/me', asyncHandler(getMyBillingSummary))
