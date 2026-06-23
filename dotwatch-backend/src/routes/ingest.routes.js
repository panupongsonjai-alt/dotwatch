import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authDevice } from '../middlewares/authDevice.js'
import { ingestReading } from '../controllers/ingest.controller.js'

export const ingestRouter = Router()

ingestRouter.post('/', authDevice, asyncHandler(ingestReading))
