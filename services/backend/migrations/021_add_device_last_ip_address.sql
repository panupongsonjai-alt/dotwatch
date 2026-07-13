ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS last_ip_address TEXT;

COMMENT ON COLUMN devices.last_ip_address IS
  'Most recent validated client IP observed during device ingest.';
