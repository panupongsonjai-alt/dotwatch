-- =========================================================
-- dotWatch Migration 020
-- Phase 9F: Required runtime nullability normalization
--
-- Why this exists:
--   Older Render databases may already have these columns from earlier
--   migrations, but ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... NOT NULL
--   does not change nullability for columns that already exist.
--
-- This migration aligns the required runtime columns used by the backend
-- across local and Render without touching optional Timescale objects.
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- 1) Backfill safe defaults before enforcing NOT NULL.
-- ---------------------------------------------------------

UPDATE activity_logs
SET created_at = NOW()
WHERE created_at IS NULL;

UPDATE activity_logs
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

UPDATE activity_logs
SET severity = 'info'
WHERE severity IS NULL OR btrim(severity) = '';

UPDATE users
SET role = 'user'
WHERE role IS NULL OR btrim(role) = '';

UPDATE users
SET status = 'active'
WHERE status IS NULL OR btrim(status) = '';

UPDATE users
SET plan = 'free'
WHERE plan IS NULL OR btrim(plan) = '';

UPDATE users
SET device_limit = 3
WHERE device_limit IS NULL;

UPDATE users
SET updated_at = COALESCE(created_at, NOW())
WHERE updated_at IS NULL;

-- ---------------------------------------------------------
-- 2) Refuse unsafe device secret normalization.
--
-- Do not invent a shared default secret hash in SQL. If any device has
-- a NULL secret_hash, it must be reset/rotated intentionally first.
-- ---------------------------------------------------------

DO $$
DECLARE
  null_secret_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO null_secret_count
  FROM devices
  WHERE secret_hash IS NULL;

  IF null_secret_count > 0 THEN
    RAISE EXCEPTION
      'Cannot set devices.secret_hash NOT NULL: % device row(s) still have NULL secret_hash. Reset or deactivate those devices first.',
      null_secret_count;
  END IF;
END $$;

-- ---------------------------------------------------------
-- 3) Normalize defaults and NOT NULL constraints.
-- ---------------------------------------------------------

ALTER TABLE activity_logs
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN severity SET DEFAULT 'info',
  ALTER COLUMN severity SET NOT NULL;

ALTER TABLE devices
  ALTER COLUMN secret_hash SET NOT NULL;

ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'user',
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN plan SET DEFAULT 'free',
  ALTER COLUMN plan SET NOT NULL,
  ALTER COLUMN device_limit SET DEFAULT 3,
  ALTER COLUMN device_limit SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

COMMIT;
