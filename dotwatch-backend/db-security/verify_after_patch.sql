-- dotWatch Security Patch 06
-- verify_after_patch.sql

SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE indexname IN (
  'idx_devices_user_active_created',
  'idx_device_metric_readings_device_metric_time',
  'idx_alarm_states_user_state_updated',
  'idx_activity_logs_user_device_created',
  'uq_devices_device_code',
  'uq_device_metrics_device_metric_key'
)
ORDER BY tablename, indexname;

SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  contype AS constraint_type,
  convalidated AS validated
FROM pg_constraint
WHERE conname IN (
  'chk_devices_status_allowed',
  'chk_devices_latitude_range',
  'chk_devices_longitude_range',
  'chk_devices_code_format',
  'chk_device_metrics_key_format',
  'chk_device_metric_readings_key_format',
  'chk_device_metric_readings_value_finite',
  'chk_alarm_rules_operator_allowed',
  'chk_alarm_rules_severity_allowed',
  'chk_alarm_events_status_allowed',
  'chk_alarm_states_state_allowed',
  'fk_device_metric_readings_device',
  'fk_device_metrics_device'
)
ORDER BY table_name, constraint_name;
