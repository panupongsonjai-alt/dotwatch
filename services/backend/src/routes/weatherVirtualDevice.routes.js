import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authWeatherPoll } from '../middlewares/authWeatherPoll.js'
import { pollWeatherDevices } from '../controllers/weatherVirtualDevice.controller.js'

export const weatherVirtualDeviceRouter = Router()

weatherVirtualDeviceRouter.use(authWeatherPoll)
weatherVirtualDeviceRouter.post('/poll', asyncHandler(pollWeatherDevices))
