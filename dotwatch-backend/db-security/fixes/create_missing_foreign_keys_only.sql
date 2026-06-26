-- dotWatch Security Patch 06 Fix
-- create_missing_foreign_keys_only.sql
--
-- ใช้เฉพาะกรณีที่ไฟล์ 03 แจ้งว่า foreign key ไม่มีอยู่จริง
-- ไฟล์นี้จะสร้าง FK แบบ NOT VALID ก่อน แล้วจึง validate แบบ safe
--
-- แนะนำ:
-- 1. รัน 01_preflight_security_checks.sql ก่อน
-- 2. ถ้าไม่มี orphan records ค่อยรันไฟล์นี้

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_device_metric_readings_device'
      AND conrelid = 'device_metric_readings'::regclass
  ) THEN
    ALTER TABLE device_metric_readings
    ADD CONSTRAINT fk_device_metric_readings_device
    FOREIGN KEY (device_id)
    REFERENCES devices(id)
    ON DELETE CASCADE
    NOT VALID;

    RAISE NOTICE 'Created constraint: fk_device_metric_readings_device';
  ELSE
    RAISE NOTICE 'Already exists: fk_device_metric_readings_device';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_device_metrics_device'
      AND conrelid = 'device_metrics'::regclass
  ) THEN
    ALTER TABLE device_metrics
    ADD CONSTRAINT fk_device_metrics_device
    FOREIGN KEY (device_id)
    REFERENCES devices(id)
    ON DELETE CASCADE
    NOT VALID;

    RAISE NOTICE 'Created constraint: fk_device_metrics_device';
  ELSE
    RAISE NOTICE 'Already exists: fk_device_metrics_device';
  END IF;
END $$;

-- validate หลังสร้าง
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_device_metric_readings_device'
      AND conrelid = 'device_metric_readings'::regclass
  ) THEN
    ALTER TABLE device_metric_readings
    VALIDATE CONSTRAINT fk_device_metric_readings_device;

    RAISE NOTICE 'Validated constraint: fk_device_metric_readings_device';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_device_metrics_device'
      AND conrelid = 'device_metrics'::regclass
  ) THEN
    ALTER TABLE device_metrics
    VALIDATE CONSTRAINT fk_device_metrics_device;

    RAISE NOTICE 'Validated constraint: fk_device_metrics_device';
  END IF;
END $$;
