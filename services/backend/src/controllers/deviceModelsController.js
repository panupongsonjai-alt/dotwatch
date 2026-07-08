import { pool } from '../db/pool.js'

export async function listDeviceModels(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        dm.id,
        dm.model_key,
        dm.model_key AS "modelKey",
        dm.model_name,
        dm.model_name AS name,
        dm.model_name AS "modelName",
        dm.metric_count,
        dm.metric_count AS "metricCount",
        COALESCE(dm.description, '') AS description,
        dm.is_active,
        dm.is_active AS "isActive",
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'metricKey', dmm.metric_key,
              'defaultName', dmm.default_name,
              'defaultType', dmm.default_type,
              'defaultUnit', dmm.default_unit,
              'defaultIcon', dmm.default_icon,
              'sortOrder', dmm.sort_order
            )
            ORDER BY dmm.sort_order ASC, dmm.metric_key ASC
          ) FILTER (WHERE dmm.id IS NOT NULL),
          '[]'::jsonb
        ) AS metrics
      FROM public.device_models dm
      LEFT JOIN public.device_model_metrics dmm
        ON dmm.model_id = dm.id
      WHERE dm.is_active = true
      GROUP BY dm.id
      ORDER BY dm.id ASC
    `)

    res.json(result.rows)
  } catch (error) {
    console.error('listDeviceModels error:', error)
    res.status(500).json({
      message: error.message || 'Failed to load device models',
    })
  }
}
