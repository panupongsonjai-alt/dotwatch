-- =========================================================
-- dotWatch Migration 017
-- Phase 5: Admin & Commercial Foundation
--
-- Purpose:
--   - Add plan definitions and user subscriptions
--   - Add organization invitations for team/role workflow
--   - Add richer admin audit log metadata
--   - Keep existing user_id/device flow working
-- =========================================================

CREATE TABLE IF NOT EXISTS plan_definitions (
  plan_key TEXT PRIMARY KEY,
  plan_name TEXT NOT NULL,
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  device_limit INTEGER NOT NULL DEFAULT 3,
  site_limit INTEGER NOT NULL DEFAULT 1,
  user_limit INTEGER NOT NULL DEFAULT 1,
  retention_days INTEGER NOT NULL DEFAULT 30,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plan_definitions_limits_check CHECK (
    device_limit >= 0
    AND site_limit >= 0
    AND user_limit >= 0
    AND retention_days >= 1
  )
);

INSERT INTO plan_definitions (
  plan_key,
  plan_name,
  monthly_price_cents,
  currency,
  device_limit,
  site_limit,
  user_limit,
  retention_days,
  features,
  is_public,
  is_active,
  sort_order,
  updated_at
)
VALUES
  (
    'free',
    'Free',
    0,
    'THB',
    3,
    1,
    1,
    30,
    '{"history":"30 days","support":"community","alerts":true,"batchIngest":true}'::jsonb,
    true,
    true,
    10,
    NOW()
  ),
  (
    'basic',
    'Basic',
    9900,
    'THB',
    10,
    3,
    3,
    180,
    '{"history":"180 days","support":"email","alerts":true,"batchIngest":true,"reports":"csv"}'::jsonb,
    true,
    true,
    20,
    NOW()
  ),
  (
    'pro',
    'Pro',
    29900,
    'THB',
    30,
    10,
    10,
    365,
    '{"history":"1 year","support":"priority","alerts":true,"batchIngest":true,"reports":"csv_pdf","organizations":true}'::jsonb,
    true,
    true,
    30,
    NOW()
  ),
  (
    'enterprise',
    'Enterprise',
    0,
    'THB',
    100,
    50,
    50,
    730,
    '{"history":"custom","support":"sla","alerts":true,"batchIngest":true,"reports":"custom","organizations":true,"customLimit":true}'::jsonb,
    false,
    true,
    40,
    NOW()
  )
ON CONFLICT (plan_key)
DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  currency = EXCLUDED.currency,
  device_limit = EXCLUDED.device_limit,
  site_limit = EXCLUDED.site_limit,
  user_limit = EXCLUDED.user_limit,
  retention_days = EXCLUDED.retention_days,
  features = EXCLUDED.features,
  is_public = EXCLUDED.is_public,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_key TEXT NOT NULL REFERENCES plan_definitions(plan_key),
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_subscriptions_user_unique UNIQUE (user_id),
  CONSTRAINT user_subscriptions_status_check CHECK (
    status IN ('trialing', 'active', 'overdue', 'suspended', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan
ON user_subscriptions (plan_key);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status
ON user_subscriptions (status);

INSERT INTO user_subscriptions (
  user_id,
  plan_key,
  status,
  current_period_start,
  current_period_end,
  metadata,
  updated_at
)
SELECT
  u.id,
  COALESCE(NULLIF(u.plan, ''), 'free'),
  COALESCE(NULLIF(u.status, ''), 'active'),
  COALESCE(u.created_at, NOW()),
  u.renewal_at,
  jsonb_build_object('source', 'phase5_backfill'),
  NOW()
FROM users u
WHERE EXISTS (
  SELECT 1
  FROM plan_definitions pd
  WHERE pd.plan_key = COALESCE(NULLIF(u.plan, ''), 'free')
)
ON CONFLICT (user_id)
DO UPDATE SET
  plan_key = EXCLUDED.plan_key,
  status = EXCLUDED.status,
  current_period_end = COALESCE(EXCLUDED.current_period_end, user_subscriptions.current_period_end),
  updated_at = NOW();

UPDATE users u
SET
  device_limit = pd.device_limit,
  updated_at = NOW()
FROM plan_definitions pd
WHERE u.plan = pd.plan_key
  AND (u.device_limit IS NULL OR u.device_limit <= 0);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  invited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_invitations_role_check CHECK (
    role IN ('owner', 'admin', 'operator', 'viewer')
  ),
  CONSTRAINT organization_invitations_status_check CHECK (
    status IN ('pending', 'accepted', 'cancelled', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_organization_invitations_org
ON organization_invitations (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_invitations_email
ON organization_invitations (lower(email), status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_invitations_pending_unique
ON organization_invitations (organization_id, lower(email))
WHERE status = 'pending';

ALTER TABLE admin_audit_logs
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE admin_audit_logs
ADD COLUMN IF NOT EXISTS ip_address TEXT;

ALTER TABLE admin_audit_logs
ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_time
ON admin_audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_time
ON admin_audit_logs (actor_user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'admin', 'super_admin')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_status_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_status_check
    CHECK (status IN ('active', 'overdue', 'suspended', 'cancelled')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_plan_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_plan_check
    CHECK (plan IN ('free', 'basic', 'pro', 'enterprise')) NOT VALID;
  END IF;
END $$;
