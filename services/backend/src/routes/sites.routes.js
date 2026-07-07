import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import {
  createSite,
  listSites,
  updateSite,
} from '../controllers/sites.controller.js'

export const sitesRouter = Router()

sitesRouter.use(authUser)
sitesRouter.use(loadUser)

sitesRouter.get('/', asyncHandler(listSites))
sitesRouter.post('/', asyncHandler(createSite))
sitesRouter.put('/:id', asyncHandler(updateSite))
