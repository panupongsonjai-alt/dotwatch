-- =========================================================
-- dotWatch Migration 016
-- Phase 4 Data Scale & Performance
--
-- Goals:
--   1) Keep latest metric values in a small lookup table.
--   2) Make Dashboard / Devices list stop scanning history for latest values.
--   3) Keep continuous aggregate objects ready for long-range history charts.
--
-- This SQL file is safe to run manually. The Node migration runner also
-- creates the same critical objects when `npm run migrate` is executed.
-- =========================================================

CREATE TABLE IF NOT EXISTS device_metric_latest (
  device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  time TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_device_metric_latest_time
ON device_metric_latest (time DESC);

-- Backfill latest values from existing dynamic metric history.
INSERT INTO device_metric_latest (
  device_id,
  metric_key,
  time,
  value,
  updated_at
)
SELECT DISTINCT ON (device_id, metric_key)
  device_id,
  metric_key,
  time,
  value,
  now()
FROM device_metric_readings
ORDER BY device_id, metric_key, time DESC
ON CONFLICT (device_id, metric_key)
DO UPDATE SET
  time = EXCLUDED.time,
  value = EXCLUDED.value,
  updated_at = now()
WHERE EXCLUDED.time >= device_metric_latest.time;

-- Keep primary history indexes explicit for deploy safety.
CREATE INDEX IF NOT EXISTS idx_metric_readings_device_metric_time
ON device_metric_readings (device_id, metric_key, time DESC);

CREATE INDEX IF NOT EXISTS idx_metric_readings_device_time
ON device_metric_readings (device_id, time DESC);

-- Continuous aggregates. These require TimescaleDB.
-- If you run on plain PostgreSQL, skip this section.
CREATE MATERIALIZED VIEW IF NOT EXISTS device_metric_readings_1m
WITH (timescaledb.continuous) AS
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

CREATE MATERIALIZED VIEW IF NOT EXISTS device_metric_readings_1h
WITH (timescaledb.continuous) AS
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

CREATE MATERIALIZED VIEW IF NOT EXISTS device_metric_readings_1d
WITH (timescaledb.continuous) AS
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

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1m_lookup
ON device_metric_readings_1m (device_id, metric_key, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1h_lookup
ON device_metric_readings_1h (device_id, metric_key, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1d_lookup
ON device_metric_readings_1d (device_id, metric_key, bucket DESC);

-- Optional manual refresh for existing data. Uncomment only during a
-- maintenance window if you already have a large history table.
-- CALL refresh_continuous_aggregate('device_metric_readings_1m', NOW() - INTERVAL '7 days', NOW());
-- CALL refresh_continuous_aggregate('device_metric_readings_1h', NOW() - INTERVAL '180 days', NOW());
-- CALL refresh_continuous_aggregate('device_metric_readings_1d', NOW() - INTERVAL '2 years', NOW());
