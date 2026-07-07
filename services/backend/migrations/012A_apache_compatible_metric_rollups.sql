-- =========================================================
-- dotWatch Migration 012A
-- Apache-compatible Metric Rollups
-- Use this instead of 012_metric_continuous_aggregates.sql
-- when TimescaleDB shows:
-- "functionality not supported under the current apache license"
--
-- This creates normal PostgreSQL materialized views.
-- They are NOT automatic continuous aggregates.
-- Refresh them manually or from backend scheduled job.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Required raw indexes
-- ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_device_metric_time
ON device_metric_readings (device_id, metric_key, time DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_time
ON device_metric_readings (time DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_metric_key_time
ON device_metric_readings (metric_key, time DESC);

-- ---------------------------------------------------------
-- 2) Drop old normal materialized views if you need to rebuild
--    Keep commented by default for safety.
-- ---------------------------------------------------------

-- DROP MATERIALIZED VIEW IF EXISTS device_metric_readings_1m;
-- DROP MATERIALIZED VIEW IF EXISTS device_metric_readings_1h;
-- DROP MATERIALIZED VIEW IF EXISTS device_metric_readings_1d;

-- ---------------------------------------------------------
-- 3) 1-minute rollup
-- ---------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS device_metric_readings_1m AS
SELECT
  time_bucket('1 minute', time) AS bucket,
  device_id,
  metric_key,
  AVG(value) AS avg_value,
  MIN(value) AS min_value,
  MAX(value) AS max_value,
  COUNT(*) AS sample_count
FROM device_metric_readings
GROUP BY bucket, device_id, metric_key
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_metric_readings_1m_unique
ON device_metric_readings_1m (device_id, metric_key, bucket);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1m_lookup
ON device_metric_readings_1m (device_id, metric_key, bucket DESC);

-- ---------------------------------------------------------
-- 4) 1-hour rollup
-- ---------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS device_metric_readings_1h AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  device_id,
  metric_key,
  AVG(value) AS avg_value,
  MIN(value) AS min_value,
  MAX(value) AS max_value,
  COUNT(*) AS sample_count
FROM device_metric_readings
GROUP BY bucket, device_id, metric_key
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_metric_readings_1h_unique
ON device_metric_readings_1h (device_id, metric_key, bucket);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1h_lookup
ON device_metric_readings_1h (device_id, metric_key, bucket DESC);

-- ---------------------------------------------------------
-- 5) 1-day rollup
-- ---------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS device_metric_readings_1d AS
SELECT
  time_bucket('1 day', time) AS bucket,
  device_id,
  metric_key,
  AVG(value) AS avg_value,
  MIN(value) AS min_value,
  MAX(value) AS max_value,
  COUNT(*) AS sample_count
FROM device_metric_readings
GROUP BY bucket, device_id, metric_key
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_metric_readings_1d_unique
ON device_metric_readings_1d (device_id, metric_key, bucket);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1d_lookup
ON device_metric_readings_1d (device_id, metric_key, bucket DESC);

-- ---------------------------------------------------------
-- 6) Initial refresh
--    Run this after creating all materialized views.
-- ---------------------------------------------------------

REFRESH MATERIALIZED VIEW device_metric_readings_1m;
REFRESH MATERIALIZED VIEW device_metric_readings_1h;
REFRESH MATERIALIZED VIEW device_metric_readings_1d;

-- ---------------------------------------------------------
-- 7) Later refresh command
--    Use these manually, or create a backend scheduler.
-- ---------------------------------------------------------

-- REFRESH MATERIALIZED VIEW CONCURRENTLY device_metric_readings_1m;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY device_metric_readings_1h;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY device_metric_readings_1d;

-- ---------------------------------------------------------
-- 8) Check result
-- ---------------------------------------------------------

-- SELECT COUNT(*) FROM device_metric_readings_1m;
-- SELECT COUNT(*) FROM device_metric_readings_1h;
-- SELECT COUNT(*) FROM device_metric_readings_1d;
