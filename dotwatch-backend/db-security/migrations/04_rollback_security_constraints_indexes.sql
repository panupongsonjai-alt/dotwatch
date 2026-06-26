-- dotWatch Security Patch 06
-- 04_rollback_security_constraints_indexes.sql
--
-- ใช้ rollback เฉพาะ constraint/index ที่ patch 06 เพิ่ม
-- ไม่ลบข้อมูล

ALTER TABLE IF EXISTS device_metric_readings
DROP CONSTRAINT IF EXISTS fk_device_metric_readings_device;

ALTER TABLE IF EXISTS device_metrics
DROP CONSTRAINT IF EXISTS fk_device_metrics_device;

ALTER TABLE IF EXISTS devices
DROP CONSTRAINT IF EXISTS chk_devices_status_allowed;

ALTER TABLE IF EXISTS devices
DROP CONSTRAINT IF EXISTS chk_devices_latitude_range;

ALTER TABLE IF EXISTS devices
DROP CONSTRAINT IF EXISTS chk_devices_longitude_range;

ALTER TABLE IF EXISTS devices
DROP CONSTRAINT IF EXISTS chk_devices_code_format;

ALTER TABLE IF EXISTS device_metrics
DROP CONSTRAINT IF EXISTS chk_device_metrics_key_format;

ALTER TABLE IF EXISTS device_metric_readings
DROP CONSTRAINT IF EXISTS chk_device_metric_readings_key_format;

ALTER TABLE IF EXISTS device_metric_readings
DROP CONSTRAINT IF EXISTS chk_device_metric_readings_value_finite;

ALTER TABLE IF EXISTS alarm_rules
DROP CONSTRAINT IF EXISTS chk_alarm_rules_operator_allowed;

ALTER TABLE IF EXISTS alarm_rules
DROP CONSTRAINT IF EXISTS chk_alarm_rules_severity_allowed;

ALTER TABLE IF EXISTS alarm_events
DROP CONSTRAINT IF EXISTS chk_alarm_events_status_allowed;

ALTER TABLE IF EXISTS alarm_states
DROP CONSTRAINT IF EXISTS chk_alarm_states_state_allowed;

DROP INDEX IF EXISTS idx_devices_user_active_created;
DROP INDEX IF EXISTS idx_devices_user_status;
DROP INDEX IF EXISTS idx_devices_last_ingest;
DROP INDEX IF EXISTS idx_device_metric_readings_device_metric_time;
DROP INDEX IF EXISTS idx_device_metric_readings_device_time;
DROP INDEX IF EXISTS idx_device_metric_readings_time;
DROP INDEX IF EXISTS idx_sensor_readings_device_time;
DROP INDEX IF EXISTS idx_device_metrics_device_sort;
DROP INDEX IF EXISTS idx_alarm_rules_user_device;
DROP INDEX IF EXISTS idx_alarm_states_user_state_updated;
DROP INDEX IF EXISTS idx_alarm_events_user_triggered;
DROP INDEX IF EXISTS idx_activity_logs_user_created;
DROP INDEX IF EXISTS idx_activity_logs_user_device_created;
DROP INDEX IF EXISTS uq_devices_device_code;
DROP INDEX IF EXISTS uq_device_metrics_device_metric_key;
