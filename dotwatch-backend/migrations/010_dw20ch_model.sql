INSERT INTO device_models (
  model_key,
  model_name,
  metric_count,
  description
)
VALUES (
  'dw_20ch',
  'dotWatch 20CH',
  20,
  'Raspberry Pi 20 Channel Gateway'
)
ON CONFLICT (model_key) DO UPDATE
SET
  model_name = EXCLUDED.model_name,
  metric_count = EXCLUDED.metric_count,
  description = EXCLUDED.description;

WITH model AS (
  SELECT id
  FROM device_models
  WHERE model_key = 'dw_20ch'
)
INSERT INTO device_model_metrics (
  model_id,
  metric_key,
  default_name,
  default_type,
  default_unit,
  default_icon,
  sort_order
)
SELECT
  model.id,
  CONCAT('metric_', gs.n),
  CONCAT('Name-', LPAD(gs.n::text, 2, '0')),
  'custom',
  '',
  'Activity',
  gs.n
FROM model
CROSS JOIN generate_series(1, 20) AS gs(n)
ON CONFLICT (model_id, metric_key)
DO UPDATE SET
  default_name = EXCLUDED.default_name,
  default_type = EXCLUDED.default_type,
  default_unit = EXCLUDED.default_unit,
  default_icon = EXCLUDED.default_icon,
  sort_order = EXCLUDED.sort_order;