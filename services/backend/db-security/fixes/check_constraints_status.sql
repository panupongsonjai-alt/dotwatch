-- dotWatch Security Patch 06 Fix
-- check_constraints_status.sql
--
-- ใช้ตรวจว่า constraint/index ถูกสร้างแล้วหรือยัง

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
ORDER BY table_name, constraint_name;

SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE tablename IN (
  'devices',
  'device_metrics',
  'device_metric_readings',
  'sensor_readings',
  'alarm_rules',
  'alarm_states',
  'alarm_events',
  'activity_logs'
)
ORDER BY tablename, indexname;
