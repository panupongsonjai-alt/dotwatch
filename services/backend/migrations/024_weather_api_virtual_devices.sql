-- dotWatch Weather API Virtual Device
-- Adds backend-powered weather devices that read Temperature/Humidity from Open-Meteo.

BEGIN;

CREATE TABLE IF NOT EXISTS weather_virtual_devices (
  device_id BIGINT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'open_meteo',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  poll_interval_seconds INTEGER NOT NULL DEFAULT 60,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weather_virtual_devices_provider_check
    CHECK (provider IN ('open_meteo')),
  CONSTRAINT weather_virtual_devices_poll_interval_check
    CHECK (poll_interval_seconds BETWEEN 60 AND 86400),
  CONSTRAINT weather_virtual_devices_failures_check
    CHECK (consecutive_failures >= 0)
);

ALTER TABLE weather_virtual_devices
  ALTER COLUMN poll_interval_seconds SET DEFAULT 60;

UPDATE weather_virtual_devices
SET
  poll_interval_seconds = 60,
  updated_at = NOW()
WHERE poll_interval_seconds IS DISTINCT FROM 60;

CREATE INDEX IF NOT EXISTS idx_weather_virtual_devices_due
ON weather_virtual_devices (enabled, last_attempt_at, poll_interval_seconds);

CREATE INDEX IF NOT EXISTS idx_weather_virtual_devices_last_success
ON weather_virtual_devices (last_success_at DESC);

INSERT INTO weather_virtual_devices (device_id)
SELECT d.id
FROM devices d
JOIN device_models dm ON dm.id = d.model_id
WHERE dm.model_key = 'weather_api_demo'
ON CONFLICT (device_id) DO NOTHING;

COMMIT;
