-- =========================================================
-- dotWatch Migration 013
-- Production TimescaleDB Optimization for Dynamic Metrics
-- Target:
--   - 1,000+ devices
--   - DW2CH / DW10CH / DW20CH
--   - 1 year raw history
--   - Faster charts with continuous aggregates
-- =========================================================

-- ---------------------------------------------------------
-- 1) Required indexes for dynamic metric readings
-- ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_device_metric_time_desc
ON device_metric_readings (device_id, metric_key, time DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_time_desc
ON device_metric_readings (time DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_metric_time_desc
ON device_metric_readings (metric_key, time DESC);

-- ---------------------------------------------------------
-- 2) Enable compression for device_metric_readings
-- ---------------------------------------------------------

ALTER TABLE device_metric_readings
SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'device_id, metric_key',
  timescaledb.compress_orderby = 'time DESC'
);

-- Compress chunks older than 7 days.
-- This keeps recent data fast for realtime/history views
-- while reducing long-term storage size.
SELECT add_compression_policy(
  'device_metric_readings',
  INTERVAL '7 days',
  if_not_exists => true
);

-- ---------------------------------------------------------
-- 3) Retention policy for raw data
-- ---------------------------------------------------------

-- Keep raw dynamic metric readings for 1 year.
-- Aggregates can remain longer depending on disk size.
SELECT add_retention_policy(
  'device_metric_readings',
  INTERVAL '1 year',
  if_not_exists => true
);

-- ---------------------------------------------------------
-- 4) Optional legacy table compression
-- sensor_readings is legacy and may be empty for DW20CH,
-- but keep this safe if older ESP devices still use it.
-- ---------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'sensor_readings'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE sensor_readings
    SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'device_id',
      timescaledb.compress_orderby = 'time DESC'
    );

    PERFORM add_compression_policy(
      'sensor_readings',
      INTERVAL '7 days',
      if_not_exists => true
    );

    PERFORM add_retention_policy(
      'sensor_readings',
      INTERVAL '1 year',
      if_not_exists => true
    );
  END IF;
END $$;

-- ---------------------------------------------------------
-- 5) Continuous aggregate indexes
-- Run safely after migration 012_metric_continuous_aggregates.sql
-- ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1m_device_metric_bucket
ON device_metric_readings_1m (device_id, metric_key, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1h_device_metric_bucket
ON device_metric_readings_1h (device_id, metric_key, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1d_device_metric_bucket
ON device_metric_readings_1d (device_id, metric_key, bucket DESC);

-- ---------------------------------------------------------
-- 6) Recommended manual checks after running this migration
-- ---------------------------------------------------------

-- Check compression settings:
-- SELECT *
-- FROM timescaledb_information.compression_settings;

-- Check policies/jobs:
-- SELECT *
-- FROM timescaledb_information.jobs
-- ORDER BY hypertable_name, proc_name;

-- Check hypertables:
-- SELECT *
-- FROM timescaledb_information.hypertables;

-- Check chunk sizes:
-- SELECT *
-- FROM chunks_detailed_size('device_metric_readings')
-- ORDER BY total_bytes DESC
-- LIMIT 20;
