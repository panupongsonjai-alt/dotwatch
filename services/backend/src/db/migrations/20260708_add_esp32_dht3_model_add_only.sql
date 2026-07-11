-- dotWatch Phase 4A - Add ESP32-DHT3 as an additional model
-- IMPORTANT:
--   This migration does NOT replace Raspberry Pi / DW20CH.
--   It only adds or updates one extra model row: esp32_dht3.
--   It also adds default model metrics so newly created ESP32 devices
--   automatically get metric display config.
--
-- Metrics:
--   metric_1 = Temperature (°C)
--   metric_2 = Humidity (%)
--   Wi-Fi RSSI is operational metadata and is not a dashboard metric.

BEGIN;

WITH upsert_model AS (
  INSERT INTO device_models (
    model_key,
    model_name,
    metric_count,
    description,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    'esp32_dht3',
    'ESP32-DHT3',
    2,
    'Additional ESP32 Wi-Fi model with DHT temperature and humidity. Metrics: metric_1 temperature, metric_2 humidity. RSSI is operational metadata.',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (model_key)
  DO UPDATE SET
    model_name = EXCLUDED.model_name,
    metric_count = EXCLUDED.metric_count,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = NOW()
  RETURNING id
),
model AS (
  SELECT id FROM upsert_model
  UNION ALL
  SELECT id FROM device_models WHERE model_key = 'esp32_dht3'
  LIMIT 1
)
INSERT INTO device_model_metrics (
  model_id,
  metric_key,
  default_name,
  default_type,
  default_unit,
  default_icon,
  sort_order,
  created_at,
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
  NOW(),
  NOW()
FROM model
CROSS JOIN (
  VALUES
    ('metric_1', 'Temperature', 'temperature', '°C', 'Thermometer', 1),
    ('metric_2', 'Humidity', 'humidity', '%', 'Droplets', 2)
) AS data(
  metric_key,
  default_name,
  default_type,
  default_unit,
  default_icon,
  sort_order
)
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

-- Verify all active models remain available.
SELECT
  id,
  model_key,
  model_name,
  metric_count,
  is_active,
  created_at,
  updated_at
FROM device_models
WHERE is_active = true
ORDER BY id;

-- Verify ESP32-DHT3 default metrics exist.
SELECT
  dmm.metric_key,
  dmm.default_name,
  dmm.default_type,
  dmm.default_unit,
  dmm.default_icon,
  dmm.sort_order
FROM device_models dm
JOIN device_model_metrics dmm
  ON dmm.model_id = dm.id
WHERE dm.model_key = 'esp32_dht3'
ORDER BY dmm.sort_order;
