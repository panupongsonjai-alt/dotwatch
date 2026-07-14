ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS last_local_ip_address TEXT;

COMMENT ON COLUMN devices.last_local_ip_address IS
  'Most recent local network IP address reported by the authenticated device during ingest.';
