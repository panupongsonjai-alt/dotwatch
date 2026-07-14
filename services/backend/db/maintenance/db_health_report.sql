-- dotWatch Phase 3 database health report
-- Run with psql:
--   psql "$env:DATABASE_URL" -f services/backend/db/maintenance/db_health_report.sql

\echo '== dotWatch database target =='
SELECT current_database() AS database, current_user AS user, NOW() AS checked_at;

\echo '== core table counts =='
SELECT 'users' AS table_name, COUNT(*)::bigint AS rows FROM users
UNION ALL SELECT 'devices', COUNT(*)::bigint FROM devices
UNION ALL SELECT 'sensor_readings', COUNT(*)::bigint FROM sensor_readings
UNION ALL SELECT 'device_metric_readings', COUNT(*)::bigint FROM device_metric_readings
UNION ALL SELECT 'device_metric_latest', COUNT(*)::bigint FROM device_metric_latest
ORDER BY table_name;

\echo '== device_metric_latest relation kind =='
SELECT
  c.relname,
  c.relkind,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view'
    ELSE c.relkind::text
  END AS relation_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'device_metric_latest';

\echo '== latest device ingest =='
SELECT
  d.id,
  d.device_code,
  d.name,
  d.status,
  d.last_ingest_at,
  EXTRACT(EPOCH FROM (NOW() - d.last_ingest_at))::int AS seconds_since_ingest
FROM devices d
ORDER BY d.last_ingest_at DESC NULLS LAST
LIMIT 20;

\echo '== value latest coverage =='
SELECT
  device_id,
  COUNT(*)::int AS latest_metric_count,
  MAX(time) AS newest_metric_time,
  MIN(time) AS oldest_metric_time
FROM device_metric_latest
GROUP BY device_id
ORDER BY newest_metric_time DESC NULLS LAST
LIMIT 50;

\echo '== orphan checks =='
SELECT 'device_metric_readings_orphans' AS check_name, COUNT(*)::bigint AS rows
FROM device_metric_readings r
LEFT JOIN devices d ON d.id = r.device_id
WHERE d.id IS NULL
UNION ALL
SELECT 'sensor_readings_orphans', COUNT(*)::bigint
FROM sensor_readings r
LEFT JOIN devices d ON d.id = r.device_id
WHERE d.id IS NULL
UNION ALL
SELECT 'devices_missing_secret_hash', COUNT(*)::bigint
FROM devices
WHERE secret_hash IS NULL OR secret_hash = '';

\echo '== timescale hypertables =='
SELECT hypertable_name, num_chunks, compression_enabled
FROM timescaledb_information.hypertables
WHERE hypertable_schema = 'public'
ORDER BY hypertable_name;

\echo '== timescale continuous aggregates =='
SELECT view_name, materialized_only
FROM timescaledb_information.continuous_aggregates
WHERE view_schema = 'public'
ORDER BY view_name;

\echo '== timescale jobs =='
SELECT job_id, proc_name, schedule_interval, hypertable_name
FROM timescaledb_information.jobs
WHERE hypertable_schema = 'public'
ORDER BY job_id;
