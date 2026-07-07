import { pool } from '../db/pool.js'

export async function listDeviceModels(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        id,
        model_key,
        model_name,
        metric_count,
        description,
        is_active
      FROM public.device_models
      WHERE is_active = true
      ORDER BY id ASC
    `)

    res.json(result.rows)
  } catch (error) {
    console.error('listDeviceModels error:', error)
    res.status(500).json({
      message: error.message || 'Failed to load device models',
    })
  }
}
