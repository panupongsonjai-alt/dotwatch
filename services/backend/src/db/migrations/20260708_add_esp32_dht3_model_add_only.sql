-- dotWatch Phase 4A - Add ESP32-DHT3 as an additional model
-- IMPORTANT:
--   This migration does NOT replace Raspberry Pi / DW20CH.
--   It only adds or updates one extra model row: esp32_dht3.
--
-- Existing model examples that should remain:
--   dw_2ch
--   dw_10ch
--   dw_20ch
--
-- New model:
--   esp32_dht3 / ESP32-DHT3
--
-- Metrics:
--   metric_1 = Temperature (°C)
--   metric_2 = Humidity (%)
--   metric_3 = WiFi RSSI (dBm)

BEGIN;

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
  3,
  'Additional ESP32 Wi-Fi model with DHT temperature/humidity and Wi-Fi RSSI. Metrics: metric_1 temperature, metric_2 humidity, metric_3 rssi.',
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
  updated_at = NOW();

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
