CREATE TABLE IF NOT EXISTS device_metric_readings (
  time TIMESTAMPTZ NOT NULL,
  device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

SELECT create_hypertable(
  'device_metric_readings',
  'time',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_dmr_device_time
ON device_metric_readings (device_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_dmr_metric_time
ON device_metric_readings (metric_key, time DESC);

CREATE INDEX IF NOT EXISTS idx_dmr_device_metric_time
ON device_metric_readings (device_id, metric_key, time DESC);