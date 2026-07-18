-- =========================================================
-- dotWatch Migration 025
-- Per-user logical database usage snapshots for Admin.
--
-- Notes:
--   - total_bytes represents logical row payload attributed to a user.
--   - shared PostgreSQL page/index overhead is intentionally excluded because
--     it cannot be assigned exactly to one tenant when tables are shared.
--   - snapshots are refreshed by the backend with a guarded, cached job.
-- =========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_database_usage_snapshots (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_bytes BIGINT NOT NULL DEFAULT 0,
  device_bytes BIGINT NOT NULL DEFAULT 0,
  telemetry_bytes BIGINT NOT NULL DEFAULT 0,
  event_bytes BIGINT NOT NULL DEFAULT 0,
  organization_bytes BIGINT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_database_usage_account_non_negative CHECK (account_bytes >= 0),
  CONSTRAINT user_database_usage_device_non_negative CHECK (device_bytes >= 0),
  CONSTRAINT user_database_usage_telemetry_non_negative CHECK (telemetry_bytes >= 0),
  CONSTRAINT user_database_usage_event_non_negative CHECK (event_bytes >= 0),
  CONSTRAINT user_database_usage_organization_non_negative CHECK (organization_bytes >= 0),
  CONSTRAINT user_database_usage_total_non_negative CHECK (total_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_database_usage_calculated_at
ON user_database_usage_snapshots (calculated_at DESC);

INSERT INTO user_database_usage_snapshots (user_id, calculated_at)
SELECT id, TIMESTAMPTZ '1970-01-01 00:00:00+00'
FROM users
ON CONFLICT (user_id) DO NOTHING;

UPDATE user_database_usage_snapshots
SET calculated_at = TIMESTAMPTZ '1970-01-01 00:00:00+00'
WHERE total_bytes = 0
  AND details = '{}'::jsonb;

COMMIT;
