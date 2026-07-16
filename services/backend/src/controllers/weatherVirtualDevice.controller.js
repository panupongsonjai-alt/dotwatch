import { z } from 'zod'
import { pollWeatherVirtualDevices } from '../services/weatherVirtualDevice.service.js'

const pollRequestSchema = z.object({
  deviceId: z.coerce.number().int().positive().optional(),
  force: z.boolean().optional().default(false),
  limit: z.coerce.number().int().positive().optional(),
})

export async function pollWeatherDevices(req, res) {
  const input = pollRequestSchema.parse(req.body || {})
  const summary = await pollWeatherVirtualDevices({
    app: req.app,
    deviceId: input.deviceId || null,
    force: input.force,
    limit: input.limit,
  })

  res.json({
    ok: summary.failed === 0,
    data: summary,
  })
}
