import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authDevice } from '../middlewares/authDevice.js'
import { deviceIngestRateLimit } from '../middlewares/deviceIngestRateLimit.js'
import { ingestBatch, ingestReading } from '../controllers/ingest.controller.js'

export const ingestRouter = Router()

ingestRouter.post('/', authDevice, deviceIngestRateLimit, asyncHandler(ingestReading))
ingestRouter.post('/batch', authDevice, deviceIngestRateLimit, asyncHandler(ingestBatch))
