import { Router } from 'express'
import { listDeviceModels } from '../controllers/deviceModelsController.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { asyncHandler } from '../utils/asyncHandler.js'

const router = Router()

router.use(authUser)
router.use(loadUser)

router.get('/device-models', asyncHandler(listDeviceModels))

export default router
