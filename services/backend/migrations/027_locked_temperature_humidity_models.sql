-- dotWatch locked two-value policies for dot-TH-W1 and dot-WT-W1.
-- Internal model keys stay unchanged to preserve firmware/API compatibility.

BEGIN;

UPDATE device_models
SET
  model_name = 'dot-TH-W1',
  metric_count = 2,
  description = 'ESP32 Wi-Fi model with fixed Temperature and Humidity values',
  updated_at = NOW()
WHERE model_key = 'esp32_dht3';

UPDATE device_models
SET
  model_name = 'dot-WT-W1',
  metric_count = 2,
  description = 'Backend virtual weather device with fixed Temperature and Humidity values',
  updated_at = NOW()
WHERE model_key = 'weather_api_demo';

WITH canonical(model_key, metric_key, default_name, default_type, default_unit, default_icon, sort_order, decimal_places) AS (
  VALUES
    ('esp32_dht3', 'metric_1', 'Temperature', 'temperature', '°C', 'Thermometer', 0, 2),
    ('esp32_dht3', 'metric_2', 'Humidity', 'humidity', '%RH', 'Droplets', 1, 2),
    ('weather_api_demo', 'temperature', 'Temperature', 'temperature', '°C', 'Thermometer', 0, 1),
    ('weather_api_demo', 'humidity', 'Humidity', 'humidity', '%RH', 'Droplets', 1, 1)
)
INSERT INTO device_model_metrics (
  model_id,
  metric_key,
  default_name,
  default_type,
  default_unit,
  default_icon,
  sort_order,
  decimal_places,
  updated_at
)
SELECT
  dm.id,
  c.metric_key,
  c.default_name,
  c.default_type,
  c.default_unit,
  c.default_icon,
  c.sort_order,
  c.decimal_places,
  NOW()
FROM canonical c
JOIN device_models dm ON dm.model_key = c.model_key
ON CONFLICT (model_id, metric_key)
DO UPDATE SET
  default_name = EXCLUDED.default_name,
  default_type = EXCLUDED.default_type,
  default_unit = EXCLUDED.default_unit,
  default_icon = EXCLUDED.default_icon,
  sort_order = EXCLUDED.sort_order,
  decimal_places = EXCLUDED.decimal_places,
  updated_at = NOW();

DELETE FROM device_model_metrics dmm
USING device_models dm
WHERE dmm.model_id = dm.id
  AND (
    (dm.model_key = 'esp32_dht3' AND dmm.metric_key NOT IN ('metric_1', 'metric_2'))
    OR
    (dm.model_key = 'weather_api_demo' AND dmm.metric_key NOT IN ('temperature', 'humidity'))
  );

WITH canonical(model_key, metric_key, metric_name, metric_type, unit, icon, sort_order, decimal_places) AS (
  VALUES
    ('esp32_dht3', 'metric_1', 'Temperature', 'temperature', '°C', 'Thermometer', 0, 2),
    ('esp32_dht3', 'metric_2', 'Humidity', 'humidity', '%RH', 'Droplets', 1, 2),
    ('weather_api_demo', 'temperature', 'Temperature', 'temperature', '°C', 'Thermometer', 0, 1),
    ('weather_api_demo', 'humidity', 'Humidity', 'humidity', '%RH', 'Droplets', 1, 1)
)
INSERT INTO device_metrics (
  device_id,
  metric_key,
  source_key,
  metric_name,
  metric_type,
  unit,
  icon,
  visible,
  sort_order,
  decimal_places
)
SELECT
  d.id,
  c.metric_key,
  c.metric_key,
  c.metric_name,
  c.metric_type,
  c.unit,
  c.icon,
  TRUE,
  c.sort_order,
  c.decimal_places
FROM devices d
JOIN device_models dm ON dm.id = d.model_id
JOIN canonical c ON c.model_key = dm.model_key
WHERE d.is_active = TRUE
ON CONFLICT (device_id, metric_key)
DO UPDATE SET
  source_key = EXCLUDED.source_key,
  metric_name = EXCLUDED.metric_name,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

DELETE FROM alarm_rules ar
USING devices d, device_models dm
WHERE ar.device_id = d.id
  AND d.model_id = dm.id
  AND (
    (dm.model_key = 'esp32_dht3' AND ar.metric NOT IN ('metric_1', 'metric_2'))
    OR
    (dm.model_key = 'weather_api_demo' AND ar.metric NOT IN ('temperature', 'humidity'))
  );

DELETE FROM device_metrics cfg
USING devices d, device_models dm
WHERE cfg.device_id = d.id
  AND d.model_id = dm.id
  AND (
    (dm.model_key = 'esp32_dht3' AND cfg.metric_key NOT IN ('metric_1', 'metric_2'))
    OR
    (dm.model_key = 'weather_api_demo' AND cfg.metric_key NOT IN ('temperature', 'humidity'))
  );

DELETE FROM device_metric_latest latest
USING devices d, device_models dm
WHERE latest.device_id = d.id
  AND d.model_id = dm.id
  AND (
    (dm.model_key = 'esp32_dht3' AND latest.metric_key NOT IN ('metric_1', 'metric_2'))
    OR
    (dm.model_key = 'weather_api_demo' AND latest.metric_key NOT IN ('temperature', 'humidity'))
  );

COMMIT;
