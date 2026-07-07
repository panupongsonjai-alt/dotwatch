-- dotWatch Device Secret Reveal Support
-- Adds encrypted storage for newly created/reset Device Secrets.
-- Existing secrets stored only as bcrypt hash cannot be recovered.

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS secret_encrypted text,
  ADD COLUMN IF NOT EXISTS secret_encrypted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_devices_secret_encrypted_at
  ON devices (secret_encrypted_at DESC)
  WHERE secret_encrypted_at IS NOT NULL;
