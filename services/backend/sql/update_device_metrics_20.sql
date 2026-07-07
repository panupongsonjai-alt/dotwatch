-- dotWatch Device Metrics Map 20
-- แก้ device_code ให้ตรงกับอุปกรณ์จริงก่อนรัน
BEGIN;

WITH target_device AS (
  SELECT id FROM devices WHERE device_code = 'DW-261103731' LIMIT 1
),
metric_map(metric_key, metric_name, metric_type, unit, icon, visible, sort_order, source_key) AS (
  VALUES
    ('metric_1', 'Voltage', 'voltage', 'V', 'Zap', true, 1, 'metric_1'),
    ('metric_2', 'Current', 'current', 'A', 'Activity', true, 2, 'metric_2'),
    ('metric_3', 'Active Power', 'power', 'W', 'Gauge', true, 3, 'metric_3'),
    ('metric_4', 'Energy', 'energy', 'kWh', 'Battery', true, 4, 'metric_4'),
    ('metric_5', 'Frequency', 'frequency', 'Hz', 'Activity', true, 5, 'metric_5'),
    ('metric_6', 'Power Factor', 'power_factor', 'PF', 'Gauge', true, 6, 'metric_6'),
    ('metric_7', 'Temperature', 'temperature', '°C', 'Thermometer', true, 7, 'metric_7'),
    ('metric_8', 'Humidity', 'humidity', '%', 'Droplets', true, 8, 'metric_8'),
    ('metric_9', 'Status', 'status', '', 'Power', true, 9, 'metric_9'),
    ('metric_10', 'Alarm', 'alarm', '', 'AlertTriangle', true, 10, 'metric_10'),
    ('metric_11', 'Custom 11', 'custom', '', 'Gauge', true, 11, 'metric_11'),
    ('metric_12', 'Custom 12', 'custom', '', 'Gauge', true, 12, 'metric_12'),
    ('metric_13', 'Custom 13', 'custom', '', 'Gauge', true, 13, 'metric_13'),
    ('metric_14', 'Custom 14', 'custom', '', 'Gauge', true, 14, 'metric_14'),
    ('metric_15', 'Custom 15', 'custom', '', 'Gauge', true, 15, 'metric_15'),
    ('metric_16', 'Custom 16', 'custom', '', 'Gauge', true, 16, 'metric_16'),
    ('metric_17', 'Custom 17', 'custom', '', 'Gauge', true, 17, 'metric_17'),
    ('metric_18', 'Custom 18', 'custom', '', 'Gauge', true, 18, 'metric_18'),
    ('metric_19', 'Custom 19', 'custom', '', 'Gauge', true, 19, 'metric_19'),
    ('metric_20', 'Custom 20', 'custom', '', 'Gauge', true, 20, 'metric_20')
)
INSERT INTO device_metrics (
  device_id, metric_key, metric_name, metric_type, unit, icon, visible, sort_order, source_key
)
SELECT td.id, mm.metric_key, mm.metric_name, mm.metric_type, mm.unit, mm.icon, mm.visible, mm.sort_order, mm.source_key
FROM target_device td CROSS JOIN metric_map mm
ON CONFLICT DO NOTHING;

WITH target_device AS (
  SELECT id FROM devices WHERE device_code = 'DW-261103731' LIMIT 1
),
metric_map(metric_key, metric_name, metric_type, unit, icon, visible, sort_order, source_key) AS (
  VALUES
    ('metric_1', 'Voltage', 'voltage', 'V', 'Zap', true, 1, 'metric_1'),
    ('metric_2', 'Current', 'current', 'A', 'Activity', true, 2, 'metric_2'),
    ('metric_3', 'Active Power', 'power', 'W', 'Gauge', true, 3, 'metric_3'),
    ('metric_4', 'Energy', 'energy', 'kWh', 'Battery', true, 4, 'metric_4'),
    ('metric_5', 'Frequency', 'frequency', 'Hz', 'Activity', true, 5, 'metric_5'),
    ('metric_6', 'Power Factor', 'power_factor', 'PF', 'Gauge', true, 6, 'metric_6'),
    ('metric_7', 'Temperature', 'temperature', '°C', 'Thermometer', true, 7, 'metric_7'),
    ('metric_8', 'Humidity', 'humidity', '%', 'Droplets', true, 8, 'metric_8'),
    ('metric_9', 'Status', 'status', '', 'Power', true, 9, 'metric_9'),
    ('metric_10', 'Alarm', 'alarm', '', 'AlertTriangle', true, 10, 'metric_10'),
    ('metric_11', 'Custom 11', 'custom', '', 'Gauge', true, 11, 'metric_11'),
    ('metric_12', 'Custom 12', 'custom', '', 'Gauge', true, 12, 'metric_12'),
    ('metric_13', 'Custom 13', 'custom', '', 'Gauge', true, 13, 'metric_13'),
    ('metric_14', 'Custom 14', 'custom', '', 'Gauge', true, 14, 'metric_14'),
    ('metric_15', 'Custom 15', 'custom', '', 'Gauge', true, 15, 'metric_15'),
    ('metric_16', 'Custom 16', 'custom', '', 'Gauge', true, 16, 'metric_16'),
    ('metric_17', 'Custom 17', 'custom', '', 'Gauge', true, 17, 'metric_17'),
    ('metric_18', 'Custom 18', 'custom', '', 'Gauge', true, 18, 'metric_18'),
    ('metric_19', 'Custom 19', 'custom', '', 'Gauge', true, 19, 'metric_19'),
    ('metric_20', 'Custom 20', 'custom', '', 'Gauge', true, 20, 'metric_20')
)
UPDATE device_metrics dm
SET metric_name = mm.metric_name,
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

COMMIT;
