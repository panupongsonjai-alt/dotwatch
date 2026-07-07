-- dotWatch Security Patch 07
-- db_health_check.sql
--
-- ใช้ตรวจสุขภาพ database หลัง Patch 01-06

-- 1) จำนวนข้อมูลหลัก
SELECT 'devices' AS table_name, COUNT(*) AS row_count FROM devices
UNION ALL
SELECT 'device_metrics', COUNT(*) FROM device_metrics
UNION ALL
SELECT 'device_metric_readings', COUNT(*) FROM device_metric_readings
UNION ALL
SELECT 'sensor_readings', COUNT(*) FROM sensor_readings
UNION ALL
SELECT 'alarm_rules', COUNT(*) FROM alarm_rules
UNION ALL
SELECT 'alarm_states', COUNT(*) FROM alarm_states
UNION ALL
SELECT 'alarm_events', COUNT(*) FROM alarm_events
UNION ALL
SELECT 'activity_logs', COUNT(*) FROM activity_logs
ORDER BY table_name;

-- 2) history range
SELECT
  COUNT(*) AS total_device_metric_readings,
  MIN(time) AS oldest_time,
  MAX(time) AS newest_time
FROM device_metric_readings;

-- 3) invalid/unvalidated constraints
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  contype AS constraint_type,
  convalidated AS validated
FROM pg_constraint
WHERE conrelid::regclass::text IN (
  'devices',
  'device_metrics',
  'device_metric_readings',
  'alarm_rules',
  'alarm_events',
  'alarm_states'
)
  AND convalidated = false
ORDER BY table_name, constraint_name;

-- 4) orphan records
SELECT
  'device_metrics_without_device' AS check_name,
  COUNT(*) AS issue_count
FROM device_metrics dm
LEFT JOIN devices d ON d.id = dm.device_id
WHERE d.id IS NULL

UNION ALL

SELECT
  'device_metric_readings_without_device',
  COUNT(*)
FROM device_metric_readings dmr
LEFT JOIN devices d ON d.id = dmr.device_id
WHERE d.id IS NULL

UNION ALL

SELECT
  'alarm_rules_user_mismatch',
  COUNT(*)
FROM alarm_rules ar
JOIN devices d ON d.id = ar.device_id
WHERE ar.user_id <> d.user_id

UNION ALL

SELECT
  'alarm_events_user_mismatch',
  COUNT(*)
FROM alarm_events ae
JOIN devices d ON d.id = ae.device_id
WHERE ae.user_id <> d.user_id

UNION ALL

SELECT
  'alarm_states_user_mismatch',
  COUNT(*)
FROM alarm_states ast
JOIN devices d ON d.id = ast.device_id
WHERE ast.user_id <> d.user_id;

-- 5) index sanity
SELECT
  tablename,
  indexname
FROM pg_indexes
WHERE indexname IN (
  'idx_devices_user_active_created',
  'idx_devices_user_status',
  'idx_device_metric_readings_device_metric_time',
  'idx_device_metric_readings_device_time',
  'idx_device_metrics_device_sort',
  'idx_alarm_states_user_state_updated',
  'idx_alarm_events_user_triggered',
  'idx_activity_logs_user_device_created'
)
ORDER BY tablename, indexname;

-- 6) database size
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS database_size;
