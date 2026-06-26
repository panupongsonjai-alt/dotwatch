-- dotWatch Security Patch 06
-- 02_apply_security_constraints_indexes.sql
--
-- เพิ่ม index และ constraint ที่ปลอดภัยสำหรับ Production
-- แนะนำให้รัน 01_preflight_security_checks.sql ก่อน
--
-- หมายเหตุ:
-- - CREATE INDEX CONCURRENTLY ไม่สามารถรันใน transaction block ได้
-- - ถ้าใช้ DBeaver ให้รันทั้งไฟล์แบบ autocommit หรือรันทีละ statement

-- =========================================================
-- Indexes: ownership / listing / history / alarms
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_devices_user_active_created
ON devices (user_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_devices_user_status
ON devices (user_id, status);

CREATE INDEX IF NOT EXISTS idx_devices_last_ingest
ON devices (last_ingest_at DESC)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_device_metric_time
ON device_metric_readings (device_id, metric_key, time DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_device_time
ON device_metric_readings (device_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_device_metric_readings_time
ON device_metric_readings (time DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_time
ON sensor_readings (device_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_device_metrics_device_sort
ON device_metrics (device_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_alarm_rules_user_device
ON alarm_rules (user_id, device_id);

CREATE INDEX IF NOT EXISTS idx_alarm_states_user_state_updated
ON alarm_states (user_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_alarm_events_user_triggered
ON alarm_events (user_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created
ON activity_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_device_created
ON activity_logs (user_id, device_id, created_at DESC);

-- =========================================================
-- Unique indexes
-- =========================================================

-- ถ้ามี unique constraint device_code อยู่แล้ว statement นี้จะไม่มีผลเสีย
CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_device_code
ON devices (device_code);

-- ถ้ามี duplicate device_metrics ต้องจัดการก่อน ไม่งั้น unique index จะสร้างไม่ผ่าน
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_metrics_device_metric_key
ON device_metrics (device_id, metric_key);

-- =========================================================
-- Constraints: devices
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_devices_status_allowed'
  ) THEN
    ALTER TABLE devices
    ADD CONSTRAINT chk_devices_status_allowed
    CHECK (status IN ('online', 'offline', 'warning', 'critical'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_devices_latitude_range'
  ) THEN
    ALTER TABLE devices
    ADD CONSTRAINT chk_devices_latitude_range
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_devices_longitude_range'
  ) THEN
    ALTER TABLE devices
    ADD CONSTRAINT chk_devices_longitude_range
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_devices_code_format'
  ) THEN
    ALTER TABLE devices
    ADD CONSTRAINT chk_devices_code_format
    CHECK (device_code ~ '^DW-[A-Z0-9-]{4,40}$');
  END IF;
END $$;

-- =========================================================
-- Constraints: metrics / readings
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_device_metrics_key_format'
  ) THEN
    ALTER TABLE device_metrics
    ADD CONSTRAINT chk_device_metrics_key_format
    CHECK (metric_key ~ '^[a-z][a-z0-9_]{0,63}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_device_metric_readings_key_format'
  ) THEN
    ALTER TABLE device_metric_readings
    ADD CONSTRAINT chk_device_metric_readings_key_format
    CHECK (metric_key ~ '^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_device_metric_readings_value_finite'
  ) THEN
    ALTER TABLE device_metric_readings
    ADD CONSTRAINT chk_device_metric_readings_value_finite
    CHECK (value = value AND value <> 'Infinity'::float8 AND value <> '-Infinity'::float8);
  END IF;
END $$;

-- =========================================================
-- Constraints: alarm rules/events/states
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_alarm_rules_operator_allowed'
  ) THEN
    ALTER TABLE alarm_rules
    ADD CONSTRAINT chk_alarm_rules_operator_allowed
    CHECK (operator IN ('>', '>=', '<', '<=', '==', '!='));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_alarm_rules_severity_allowed'
  ) THEN
    ALTER TABLE alarm_rules
    ADD CONSTRAINT chk_alarm_rules_severity_allowed
    CHECK (severity IN ('warning', 'critical'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_alarm_events_status_allowed'
  ) THEN
    ALTER TABLE alarm_events
    ADD CONSTRAINT chk_alarm_events_status_allowed
    CHECK (status IN ('active', 'acknowledged', 'resolved'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_alarm_states_state_allowed'
  ) THEN
    ALTER TABLE alarm_states
    ADD CONSTRAINT chk_alarm_states_state_allowed
    CHECK (state IN ('normal', 'warning', 'critical'));
  END IF;
END $$;

-- =========================================================
-- Foreign keys ที่ควรมี
-- =========================================================
-- หมายเหตุ:
-- ใช้ NOT VALID เพื่อลดความเสี่ยงบนตารางใหญ่
-- หลังตรวจแล้วค่อย VALIDATE CONSTRAINT แยกได้

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_device_metric_readings_device'
  ) THEN
    ALTER TABLE device_metric_readings
    ADD CONSTRAINT fk_device_metric_readings_device
    FOREIGN KEY (device_id)
    REFERENCES devices(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_device_metrics_device'
  ) THEN
    ALTER TABLE device_metrics
    ADD CONSTRAINT fk_device_metrics_device
    FOREIGN KEY (device_id)
    REFERENCES devices(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;
END $$;

-- =========================================================
-- Analyze เพื่อให้ planner ใช้ index ใหม่ได้ดีขึ้น
-- =========================================================

ANALYZE devices;
ANALYZE device_metrics;
ANALYZE device_metric_readings;
ANALYZE sensor_readings;
ANALYZE alarm_rules;
ANALYZE alarm_states;
ANALYZE alarm_events;
