import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authDevice } from '../middlewares/authDevice.js'
import { ingestBatch, ingestReading } from '../controllers/ingest.controller.js'

export const ingestRouter = Router()

ingestRouter.post('/', authDevice, asyncHandler(ingestReading))
ingestRouter.post('/batch', authDevice, asyncHandler(ingestBatch))
