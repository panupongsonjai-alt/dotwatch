-- =========================================================
-- dotWatch Refresh Apache-compatible Metric Rollups
-- Use after 012A_apache_compatible_metric_rollups.sql
--
-- Run manually in DBeaver when needed, or schedule it later
-- from backend/cron.
-- =========================================================

REFRESH MATERIALIZED VIEW CONCURRENTLY device_metric_readings_1m;
REFRESH MATERIALIZED VIEW CONCURRENTLY device_metric_readings_1h;
REFRESH MATERIALIZED VIEW CONCURRENTLY device_metric_readings_1d;

-- Check results
SELECT 'device_metric_readings_1m' AS view_name, COUNT(*) AS rows
FROM device_metric_readings_1m
UNION ALL
SELECT 'device_metric_readings_1h' AS view_name, COUNT(*) AS rows
FROM device_metric_readings_1h
UNION ALL
SELECT 'device_metric_readings_1d' AS view_name, COUNT(*) AS rows
FROM device_metric_readings_1d;
