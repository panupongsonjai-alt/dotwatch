-- dotWatch Modbus Metric Map
-- ใช้สำหรับตั้งชื่อ metric_1 ... metric_10 ให้ตรงกับ modbus_config.json
-- วิธีใช้:
-- 1) เปลี่ยน device_code ใน target_device ให้ตรงกับ Device ของคุณ
-- 2) รันใน DBeaver กับฐานข้อมูล dotWatch backend

BEGIN;

WITH target_device AS (
  SELECT id
  FROM devices
  WHERE device_code = 'DW-261103731'
  LIMIT 1
),
metric_map(metric_key, metric_name, metric_type, unit, icon, visible, sort_order, source_key) AS (
  VALUES
    ('metric_1',  'Voltage',       'voltage',      'V',    'Zap',           true, 1,  'metric_1'),
    ('metric_2',  'Current',       'current',      'A',    'Activity',      true, 2,  'metric_2'),
    ('metric_3',  'Active Power',  'power',        'W',    'Gauge',         true, 3,  'metric_3'),
    ('metric_4',  'Energy',        'energy',       'kWh',  'Battery',       true, 4,  'metric_4'),
    ('metric_5',  'Frequency',     'frequency',    'Hz',   'Activity',      true, 5,  'metric_5'),
    ('metric_6',  'Power Factor',  'power_factor', 'PF',   'Gauge',         true, 6,  'metric_6'),
    ('metric_7',  'Temperature',   'temperature',  '°C',   'Thermometer',   true, 7,  'metric_7'),
    ('metric_8',  'Humidity',      'humidity',     '%',    'Droplets',      true, 8,  'metric_8'),
    ('metric_9',  'Status',        'status',       '',     'Power',         true, 9,  'metric_9'),
    ('metric_10', 'Alarm',         'alarm',        '',     'AlertTriangle', true, 10, 'metric_10')
)
UPDATE device_metrics dm
SET
  metric_name = mm.metric_name,
  metric_type = mm.metric_type,
  unit = mm.unit,
  icon = mm.icon,
  visible = mm.visible,
  sort_order = mm.sort_order,
  source_key = mm.source_key,
  updated_at = NOW()
FROM target_device td, metric_map mm
WHERE dm.device_id = td.id
  AND dm.metric_key = mm.metric_key;

WITH target_device AS (
  SELECT id
  FROM devices
  WHERE device_code = 'DW-261103731'
  LIMIT 1
),
metric_map(metric_key, metric_name, metric_type, unit, icon, visible, sort_order, source_key) AS (
  VALUES
    ('metric_1',  'Voltage',       'voltage',      'V',    'Zap',           true, 1,  'metric_1'),
    ('metric_2',  'Current',       'current',      'A',    'Activity',      true, 2,  'metric_2'),
    ('metric_3',  'Active Power',  'power',        'W',    'Gauge',         true, 3,  'metric_3'),
    ('metric_4',  'Energy',        'energy',       'kWh',  'Battery',       true, 4,  'metric_4'),
    ('metric_5',  'Frequency',     'frequency',    'Hz',   'Activity',      true, 5,  'metric_5'),
    ('metric_6',  'Power Factor',  'power_factor', 'PF',   'Gauge',         true, 6,  'metric_6'),
    ('metric_7',  'Temperature',   'temperature',  '°C',   'Thermometer',   true, 7,  'metric_7'),
    ('metric_8',  'Humidity',      'humidity',     '%',    'Droplets',      true, 8,  'metric_8'),
    ('metric_9',  'Status',        'status',       '',     'Power',         true, 9,  'metric_9'),
    ('metric_10', 'Alarm',         'alarm',        '',     'AlertTriangle', true, 10, 'metric_10')
)
INSERT INTO device_metrics (
  device_id,
  metric_key,
  metric_name,
  metric_type,
  unit,
  icon,
  visible,
  sort_order,
  source_key
)
SELECT
  td.id,
  mm.metric_key,
  mm.metric_name,
  mm.metric_type,
  mm.unit,
  mm.icon,
  mm.visible,
  mm.sort_order,
  mm.source_key
FROM target_device td
CROSS JOIN metric_map mm
WHERE NOT EXISTS (
  SELECT 1
  FROM device_metrics dm
  WHERE dm.device_id = td.id
    AND dm.metric_key = mm.metric_key
);

COMMIT;

-- ตรวจสอบผลลัพธ์
SELECT
  d.device_code,
  dm.metric_key,
  dm.metric_name,
  dm.metric_type,
  dm.unit,
  dm.visible,
  dm.sort_order
FROM device_metrics dm
JOIN devices d ON d.id = dm.device_id
WHERE d.device_code = 'DW-261103731'
ORDER BY dm.sort_order;
