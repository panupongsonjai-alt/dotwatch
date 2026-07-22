-- Enforce canonical icons for locked dot-TH-W1 and dot-WT-W1 values.
-- This migration is intentionally separate so deployments that already ran 027
-- receive the icon correction on the next migration run.

BEGIN;

UPDATE device_model_metrics dmm
SET
  default_icon = CASE
    WHEN dmm.metric_key IN ('metric_1', 'temperature') THEN 'Thermometer'
    WHEN dmm.metric_key IN ('metric_2', 'humidity') THEN 'Droplets'
    ELSE dmm.default_icon
  END,
  updated_at = NOW()
FROM device_models dm
WHERE dmm.model_id = dm.id
  AND (
    (dm.model_key = 'esp32_dht3' AND dmm.metric_key IN ('metric_1', 'metric_2'))
    OR
    (dm.model_key = 'weather_api_demo' AND dmm.metric_key IN ('temperature', 'humidity'))
  );

UPDATE device_metrics cfg
SET
  icon = CASE
    WHEN cfg.metric_key IN ('metric_1', 'temperature') THEN 'Thermometer'
    WHEN cfg.metric_key IN ('metric_2', 'humidity') THEN 'Droplets'
    ELSE cfg.icon
  END,
  updated_at = NOW()
FROM devices d
JOIN device_models dm ON dm.id = d.model_id
WHERE cfg.device_id = d.id
  AND (
    (dm.model_key = 'esp32_dht3' AND cfg.metric_key IN ('metric_1', 'metric_2'))
    OR
    (dm.model_key = 'weather_api_demo' AND cfg.metric_key IN ('temperature', 'humidity'))
  );

COMMIT;
