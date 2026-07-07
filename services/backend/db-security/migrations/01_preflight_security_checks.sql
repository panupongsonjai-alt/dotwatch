-- dotWatch Security Patch 06
-- 01_preflight_security_checks.sql
--
-- ใช้ตรวจข้อมูลก่อน apply constraint/index
-- รันได้หลายครั้ง ไม่แก้ข้อมูล

-- 1) Device code ซ้ำ
SELECT
  device_code,
  COUNT(*) AS duplicate_count
FROM devices
GROUP BY device_code
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, device_code;

-- 2) Device metrics ซ้ำใน device เดียวกัน
SELECT
  device_id,
  metric_key,
  COUNT(*) AS duplicate_count
FROM device_metrics
GROUP BY device_id, metric_key
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, device_id, metric_key;

-- 3) Device status ที่อยู่นอก allowed values
SELECT id, device_code, status
FROM devices
WHERE status IS NOT NULL
  AND status NOT IN ('online', 'offline', 'warning', 'critical');

-- 4) Coordinate ผิดช่วง
SELECT id, device_code, latitude, longitude
FROM devices
WHERE (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
   OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180));

-- 5) Alarm rule operator/severity ผิดรูปแบบ
SELECT id, user_id, device_id, metric, operator, severity
FROM alarm_rules
WHERE operator NOT IN ('>', '>=', '<', '<=', '==', '!=')
   OR severity NOT IN ('warning', 'critical');

-- 6) Alarm rule ที่อ้าง device คนละ user หรือ device ไม่มีแล้ว
SELECT
  ar.id AS alarm_rule_id,
  ar.user_id AS alarm_rule_user_id,
  ar.device_id,
  d.user_id AS device_user_id,
  d.device_code
FROM alarm_rules ar
LEFT JOIN devices d
  ON d.id = ar.device_id
WHERE d.id IS NULL
   OR d.user_id <> ar.user_id;

-- 7) Alarm state/event ที่อ้าง device คนละ user หรือ device ไม่มีแล้ว
SELECT
  ast.id AS alarm_state_id,
  ast.user_id AS alarm_state_user_id,
  ast.device_id,
  d.user_id AS device_user_id,
  d.device_code
FROM alarm_states ast
LEFT JOIN devices d
  ON d.id = ast.device_id
WHERE d.id IS NULL
   OR d.user_id <> ast.user_id;

SELECT
  ae.id AS alarm_event_id,
  ae.user_id AS alarm_event_user_id,
  ae.device_id,
  d.user_id AS device_user_id,
  d.device_code
FROM alarm_events ae
LEFT JOIN devices d
  ON d.id = ae.device_id
WHERE d.id IS NULL
   OR d.user_id <> ae.user_id;

-- 8) History ที่อ้าง device ไม่มีแล้ว
SELECT
  dmr.device_id,
  COUNT(*) AS row_count
FROM device_metric_readings dmr
LEFT JOIN devices d
  ON d.id = dmr.device_id
WHERE d.id IS NULL
GROUP BY dmr.device_id
ORDER BY row_count DESC;

-- 9) Metric key แปลกใน history
SELECT
  metric_key,
  COUNT(*) AS row_count
FROM device_metric_readings
WHERE metric_key IS NULL
   OR metric_key !~ '^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$'
GROUP BY metric_key
ORDER BY row_count DESC;

-- 10) จำนวนข้อมูล history โดยประมาณ
SELECT
  COUNT(*) AS total_device_metric_readings,
  MIN(time) AS oldest_time,
  MAX(time) AS newest_time
FROM device_metric_readings;
