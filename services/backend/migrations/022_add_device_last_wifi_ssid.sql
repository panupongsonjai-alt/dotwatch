ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS last_wifi_ssid TEXT;

COMMENT ON COLUMN devices.last_wifi_ssid IS
  'Most recent Wi-Fi SSID reported by the device during ingest.';
