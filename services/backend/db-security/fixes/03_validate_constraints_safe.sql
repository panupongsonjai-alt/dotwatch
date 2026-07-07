-- dotWatch Security Patch 06 Fix
-- 03_validate_constraints_safe.sql
--
-- ใช้แทนไฟล์ 03_validate_constraints.sql เดิม
-- จุดประสงค์:
-- - ถ้า constraint มีอยู่ จะ VALIDATE ให้
-- - ถ้า constraint ไม่มี จะไม่ error แต่จะแจ้ง NOTICE แล้วข้าม
--
-- Error เดิม:
-- ERROR: constraint "fk_device_metrics_device" of relation "device_metrics" does not exist

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
  ELSE
    RAISE NOTICE 'Skipped: fk_device_metric_readings_device does not exist';
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
  ELSE
    RAISE NOTICE 'Skipped: fk_device_metrics_device does not exist';
  END IF;
END $$;
