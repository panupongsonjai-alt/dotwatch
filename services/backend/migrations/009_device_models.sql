CREATE TABLE IF NOT EXISTS device_models (
  id BIGSERIAL PRIMARY KEY,
  model_key TEXT UNIQUE NOT NULL,
  model_name TEXT NOT NULL,
  metric_count INTEGER NOT NULL DEFAULT 2,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_model_metrics (
  id BIGSERIAL PRIMARY KEY,
  model_id BIGINT NOT NULL REFERENCES device_models(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  default_name TEXT NOT NULL,
  default_type TEXT DEFAULT '',
  default_unit TEXT DEFAULT '',
  default_icon TEXT DEFAULT 'Activity',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, metric_key)
);

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS model_id BIGINT REFERENCES device_models(id);

ALTER TABLE device_metrics
ADD COLUMN IF NOT EXISTS source_key TEXT;

CREATE INDEX IF NOT EXISTS idx_device_models_key
ON device_models(model_key);

CREATE INDEX IF NOT EXISTS idx_device_model_metrics_model
ON device_model_metrics(model_id);

CREATE INDEX IF NOT EXISTS idx_devices_model
ON devices(model_id);

INSERT INTO device_models (
  model_key,
  model_name,
  metric_count,
  description
)
VALUES
(
  'dw_2ch',
  'dotWatch 2CH',
  2,
  'ESP รุ่นอ่าน 2 ค่า เช่น Temperature และ Humidity'
),
(
  'dw_10ch',
  'dotWatch 10CH',
  10,
  'ESP รุ่นอ่าน 10 ค่า สำหรับหลาย Sensor หรือหลาย Channel'
),
(
  'custom',
  'Custom Device',
  0,
  'กำหนด Metric เองในอนาคต'
)
ON CONFLICT (model_key) DO NOTHING;

WITH model AS (
  SELECT id FROM device_models WHERE model_key = 'dw_2ch'
)
INSERT INTO device_model_metrics (
  model_id,
  metric_key,
  default_name,
  default_type,
  default_unit,
  default_icon,
  sort_order
)
SELECT
  model.id,
  data.metric_key,
  data.default_name,
  data.default_type,
  data.default_unit,
  data.default_icon,
  data.sort_order
FROM model
CROSS JOIN (
  VALUES
    ('metric_1', 'Temperature', 'temperature', '°C', 'Thermometer', 0),
    ('metric_2', 'Humidity', 'humidity', '%', 'Droplets', 1)
) AS data(
  metric_key,
  default_name,
  default_type,
  default_unit,
  default_icon,
  sort_order
)
ON CONFLICT (model_id, metric_key) DO UPDATE
SET
  default_name = EXCLUDED.default_name,
  default_type = EXCLUDED.default_type,
  default_unit = EXCLUDED.default_unit,
  default_icon = EXCLUDED.default_icon,
  sort_order = EXCLUDED.sort_order;

  WITH model AS (
  SELECT id FROM device_models WHERE model_key = 'dw_10ch'
)
INSERT INTO device_model_metrics (
  model_id,
  metric_key,
  default_name,
  default_type,
  default_unit,
  default_icon,
  sort_order
)
SELECT
  model.id,
  CONCAT('metric_', gs.n),
  CONCAT('Channel ', gs.n),
  'custom',
  '',
  'Activity',
  gs.n - 1
FROM model
CROSS JOIN generate_series(1, 10) AS gs(n)
ON CONFLICT (model_id, metric_key) DO UPDATE
SET
  default_name = EXCLUDED.default_name,
  default_type = EXCLUDED.default_type,
  default_unit = EXCLUDED.default_unit,
  default_icon = EXCLUDED.default_icon,
  sort_order = EXCLUDED.sort_order;