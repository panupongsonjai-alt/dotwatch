CREATE OR REPLACE VIEW device_metric_latest AS
WITH latest AS (
  SELECT DISTINCT ON (sr.device_id)
    sr.device_id,
    sr.time AS latest_time,
    sr.temperature,
    sr.humidity,
    sr.rssi,
    jsonb_build_object(
      'metric_1', sr.temperature,
      'metric_2', sr.humidity,
      'metric_3', sr.rssi
    ) AS latest_metrics
  FROM sensor_readings sr
  ORDER BY sr.device_id, sr.time DESC
)
SELECT
  device_id,
  latest_time,
  temperature,
  humidity,
  rssi,
  latest_metrics
FROM latest;