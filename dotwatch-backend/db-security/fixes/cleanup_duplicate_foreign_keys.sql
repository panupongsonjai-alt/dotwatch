-- dotWatch Security Patch 06 Cleanup
-- cleanup_duplicate_foreign_keys.sql
--
-- ใช้หลังจากตรวจ constraints แล้วพบว่า:
-- - มี FK เดิมที่ valid อยู่แล้ว เช่น device_metric_readings_device_id_fkey
-- - และมี FK ที่ patch เพิ่มซ้ำ เช่น fk_device_metric_readings_device
--
-- เป้าหมาย:
-- 1. ลบ duplicate FK ที่ patch เพิ่มซ้ำ ถ้า FK เดิม validated แล้ว
-- 2. สร้าง index idx_device_metrics_device_sort ถ้ายังไม่มี
-- 3. ไม่ลบข้อมูล
-- 4. รันซ้ำได้อย่างปลอดภัย

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'device_metric_readings_device_id_fkey'
      AND conrelid = 'device_metric_readings'::regclass
      AND contype = 'f'
      AND convalidated = true
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_device_metric_readings_device'
      AND conrelid = 'device_metric_readings'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE device_metric_readings
    DROP CONSTRAINT fk_device_metric_readings_device;

    RAISE NOTICE 'Dropped duplicate FK: fk_device_metric_readings_device';
  ELSE
    RAISE NOTICE 'Skipped duplicate FK cleanup for device_metric_readings';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'device_metrics_device_id_fkey'
      AND conrelid = 'device_metrics'::regclass
      AND contype = 'f'
      AND convalidated = true
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_device_metrics_device'
      AND conrelid = 'device_metrics'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE device_metrics
    DROP CONSTRAINT fk_device_metrics_device;

    RAISE NOTICE 'Dropped duplicate FK: fk_device_metrics_device';
  ELSE
    RAISE NOTICE 'Skipped duplicate FK cleanup for device_metrics';
  END IF;
END $$;

-- Index นี้ช่วย query device metrics ที่ ORDER BY sort_order ASC, id ASC
CREATE INDEX IF NOT EXISTS idx_device_metrics_device_sort
ON device_metrics (device_id, sort_order, id);

ANALYZE device_metrics;
ANALYZE device_metric_readings;
