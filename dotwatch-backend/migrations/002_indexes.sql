CREATE INDEX idx_devices_user
ON devices(user_id);

CREATE INDEX idx_device_key
ON devices(device_key);

CREATE INDEX idx_telemetry_device_time
ON telemetry(device_id, ts DESC);

CREATE INDEX idx_telemetry_time
ON telemetry(ts DESC);