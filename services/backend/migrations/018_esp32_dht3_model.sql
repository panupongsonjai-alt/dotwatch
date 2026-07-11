-- dotWatch Phase 4A - ESP32-DHT3 additional model
-- This migration adds ESP32-DHT3 without replacing Raspberry Pi / DW20CH.

BEGIN;

INSERT INTO device_models (
  id,
  model_key,
  model_name,
  metric_count,
  description,
  is_active,
  updated_at
)
VALUES (
  5,
  'esp32_dht3',
  'ESP32-DHT3',
  2,
  'ESP32 Wi-Fi model with DHT temperature and humidity',
  true,
  NOW()
)
ON CONFLICT (model_key)
DO UPDATE SET
  model_name = EXCLUDED.model_name,
  metric_count = EXCLUDED.metric_count,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = NOW();

SELECT setval(
  pg_get_serial_sequence('device_models', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM device_models), 1),
  true
);

WITH model AS (
  SELECT id FROM device_models WHERE model_key = 'esp32_dht3'
)
INSERT INTO device_model_metrics (
  model_id,
  metric_key,
  default_name,
  default_type,
  default_unit,
  default_icon,
  sort_order,
  updated_at
)
SELECT
  model.id,
  data.metric_key,
  data.default_name,
  data.default_type,
  data.default_unit,
  data.default_icon,
  data.sort_order,
  NOW()
FROM model
CROSS JOIN (
  VALUES
    ('metric_1', 'Temperature', 'temperature', '°C', 'Thermometer', 0),
    ('metric_2', 'Humidity', 'humidity', '%', 'Droplets', 1)
) AS data(metric_key, default_name, default_type, default_unit, default_icon, sort_order)
ON CONFLICT (model_id, metric_key)
DO UPDATE SET
  default_name = EXCLUDED.default_name,
  default_type = EXCLUDED.default_type,
  default_unit = EXCLUDED.default_unit,
  default_icon = EXCLUDED.default_icon,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

DELETE FROM device_model_metrics
WHERE model_id = (SELECT id FROM device_models WHERE model_key = 'esp32_dht3')
  AND metric_key = 'metric_3';

COMMIT;
