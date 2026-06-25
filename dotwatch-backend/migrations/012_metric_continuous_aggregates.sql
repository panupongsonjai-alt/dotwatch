-- =========================================================
-- dotWatch Migration 012
-- Dynamic Metric Continuous Aggregates
-- For table: device_metric_readings
-- Purpose:
--   - Speed up historical charts for DW2CH / DW10CH / DW20CH
--   - Support long-term data storage and 1,000+ devices
-- =========================================================

-- ---------------------------------------------------------
-- 1) Safety checks / required indexes
-- ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_device_metric_time
ON device_metric_readings (device_id, metric_key, time DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_time
ON device_metric_readings (time DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_metric_key_time
ON device_metric_readings (metric_key, time DESC);

-- ---------------------------------------------------------
-- 2) Continuous Aggregate: 1 minute
--    Best for charts from 1 day to 30 days
-- ---------------------------------------------------------

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

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1m_lookup
ON device_metric_readings_1m (device_id, metric_key, bucket DESC);

-- ---------------------------------------------------------
-- 3) Continuous Aggregate: 1 hour
--    Best for charts from 30 days to 180 days
-- ---------------------------------------------------------

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

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1h_lookup
ON device_metric_readings_1h (device_id, metric_key, bucket DESC);

-- ---------------------------------------------------------
-- 4) Continuous Aggregate: 1 day
--    Best for charts over 180 days / yearly reports
-- ---------------------------------------------------------

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

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1d_lookup
ON device_metric_readings_1d (device_id, metric_key, bucket DESC);

-- ---------------------------------------------------------
-- 5) Refresh policies
--    Remove first to make migration re-runnable in development
-- ---------------------------------------------------------

SELECT remove_continuous_aggregate_policy('device_metric_readings_1m', if_exists => true);
SELECT remove_continuous_aggregate_policy('device_metric_readings_1h', if_exists => true);
SELECT remove_continuous_aggregate_policy('device_metric_readings_1d', if_exists => true);

SELECT add_continuous_aggregate_policy(
  'device_metric_readings_1m',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute'
);

SELECT add_continuous_aggregate_policy(
  'device_metric_readings_1h',
  start_offset => INTERVAL '180 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

SELECT add_continuous_aggregate_policy(
  'device_metric_readings_1d',
  start_offset => INTERVAL '2 years',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day'
);

-- ---------------------------------------------------------
-- 6) Initial refresh
--    This fills historical data that already exists.
--    Safe for your current data size.
-- ---------------------------------------------------------

CALL refresh_continuous_aggregate(
  'device_metric_readings_1m',
  NOW() - INTERVAL '7 days',
  NOW()
);

CALL refresh_continuous_aggregate(
  'device_metric_readings_1h',
  NOW() - INTERVAL '180 days',
  NOW()
);

CALL refresh_continuous_aggregate(
  'device_metric_readings_1d',
  NOW() - INTERVAL '2 years',
  NOW()
);

-- ---------------------------------------------------------
-- 7) Optional compression for raw hypertable
--    Keep disabled if already handled in previous migration.
--    Uncomment only if device_metric_readings has not been compressed.
-- ---------------------------------------------------------

-- ALTER TABLE device_metric_readings
-- SET (
--   timescaledb.compress,
--   timescaledb.compress_segmentby = 'device_id, metric_key',
--   timescaledb.compress_orderby = 'time DESC'
-- );

-- SELECT add_compression_policy(
--   'device_metric_readings',
--   INTERVAL '7 days',
--   if_not_exists => true
-- );

-- ---------------------------------------------------------
-- 8) Optional raw retention
--    For 1-year full raw data, use 1 year.
--    If you want to keep raw only 90 days and aggregates longer,
--    change INTERVAL '1 year' to INTERVAL '90 days'.
-- ---------------------------------------------------------

-- SELECT add_retention_policy(
--   'device_metric_readings',
--   INTERVAL '1 year',
--   if_not_exists => true
-- );
