-- dotWatch Security Patch 06 Final Cleanup
-- force_drop_duplicate_fk_safe.sql
--
-- ใช้ลบ foreign key ที่ Patch 06 เพิ่มซ้ำ
-- ไม่ลบข้อมูล
-- รันซ้ำได้ปลอดภัย

ALTER TABLE IF EXISTS device_metrics
DROP CONSTRAINT IF EXISTS fk_device_metrics_device;

ALTER TABLE IF EXISTS device_metric_readings
DROP CONSTRAINT IF EXISTS fk_device_metric_readings_device;

-- สร้าง index สำหรับ device metrics sort ถ้ายังไม่มี
CREATE INDEX IF NOT EXISTS idx_device_metrics_device_sort
ON device_metrics (device_id, sort_order, id);

ANALYZE device_metrics;
ANALYZE device_metric_readings;

-- ตรวจผลหลัง cleanup
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  contype AS constraint_type,
  convalidated AS validated
FROM pg_constraint
WHERE conrelid::regclass::text IN (
  'device_metrics',
  'device_metric_readings'
)
  AND conname IN (
    'device_metrics_device_id_fkey',
    'fk_device_metrics_device',
    'device_metric_readings_device_id_fkey',
    'fk_device_metric_readings_device'
  )
ORDER BY table_name, constraint_name;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'device_metrics'
ORDER BY indexname;
