-- =========================================================
-- dotWatch Migration 008: Device Metric Display Config
-- Purpose: Store per-device metric display name, unit, icon, visibility
-- =========================================================

CREATE TABLE IF NOT EXISTS device_metrics (
  id BIGSERIAL PRIMARY KEY,

  device_id BIGINT NOT NULL
    REFERENCES devices(id)
    ON DELETE CASCADE,

  -- Internal key used to map reading value, e.g. temperature, humidity, temp1
  metric_key TEXT NOT NULL,

  -- User-facing name, e.g. Supply Air, Return Air, Voltage L1
  metric_name TEXT NOT NULL,

  -- Optional type for future dashboard/alarm/chart behavior
  metric_type TEXT DEFAULT 'custom',

  unit TEXT DEFAULT '',
  icon TEXT DEFAULT 'Activity',
  visible BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT device_metrics_metric_key_not_empty
    CHECK (length(trim(metric_key)) > 0),

  CONSTRAINT device_metrics_metric_name_not_empty
    CHECK (length(trim(metric_name)) > 0),

  CONSTRAINT device_metrics_unique_key
    UNIQUE (device_id, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_device_metrics_device_sort
  ON device_metrics(device_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_device_metrics_type
  ON device_metrics(metric_type);

CREATE OR REPLACE FUNCTION touch_device_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_device_metrics_updated_at ON device_metrics;

CREATE TRIGGER trg_device_metrics_updated_at
BEFORE UPDATE ON device_metrics
FOR EACH ROW
EXECUTE FUNCTION touch_device_metrics_updated_at();

-- Optional: add default metrics to existing devices that do not have metrics yet
INSERT INTO device_metrics
  (device_id, metric_key, metric_name, metric_type, unit, icon, visible, sort_order)
SELECT
  d.id,
  metric.metric_key,
  metric.metric_name,
  metric.metric_type,
  metric.unit,
  metric.icon,
  TRUE,
  metric.sort_order
FROM devices d
CROSS JOIN (
  VALUES
    ('temperature', 'Temperature', 'temperature', '°C', 'Thermometer', 0),
    ('humidity', 'Humidity', 'humidity', '%', 'Droplets', 1),
    ('rssi', 'Signal', 'signal', 'dBm', 'Wifi', 2)
) AS metric(metric_key, metric_name, metric_type, unit, icon, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM device_metrics dm
  WHERE dm.device_id = d.id
)
ON CONFLICT (device_id, metric_key) DO NOTHING;
