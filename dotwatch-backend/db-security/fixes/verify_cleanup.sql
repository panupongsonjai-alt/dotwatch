-- dotWatch Security Patch 06 Cleanup
-- verify_cleanup.sql

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
