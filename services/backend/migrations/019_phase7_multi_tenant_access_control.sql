-- =========================================================
-- dotWatch Migration 019
-- Phase 7: Multi-tenant / Commercial Readiness
--
-- Purpose:
--   - Strengthen organization/member access control foundation
--   - Add tenant-visible audit logs without exposing global admin logs
--   - Add organization quota override table for commercial plans
--   - Add indexes used by multi-tenant device listing and reporting
--
-- Safe design:
--   - Does not remove existing user_id ownership flow
--   - Does not require dashboard changes immediately
--   - All new tables/columns are additive and idempotent
-- =========================================================

-- ---------------------------------------------------------
-- 1) Organization member metadata
-- ---------------------------------------------------------

ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS invited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_organization_members_org_active_role
ON organization_members (organization_id, is_active, role);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_active
ON organization_members (user_id, is_active);

-- ---------------------------------------------------------
-- 2) Organization quota overrides
-- ---------------------------------------------------------
-- Use this only when a customer/organization needs custom limits.
-- NULL means "use the plan default".

CREATE TABLE IF NOT EXISTS organization_quota_overrides (
  organization_id BIGINT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  device_limit_override INTEGER,
  site_limit_override INTEGER,
  user_limit_override INTEGER,
  retention_days_override INTEGER,
  notes TEXT,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_quota_overrides_non_negative_check CHECK (
    (device_limit_override IS NULL OR device_limit_override >= 0)
    AND (site_limit_override IS NULL OR site_limit_override >= 0)
    AND (user_limit_override IS NULL OR user_limit_override >= 0)
    AND (retention_days_override IS NULL OR retention_days_override >= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_organization_quota_overrides_updated_by
ON organization_quota_overrides (updated_by_user_id);

-- ---------------------------------------------------------
-- 3) Tenant-visible audit logs
-- ---------------------------------------------------------
-- admin_audit_logs is global/system-facing. This table is scoped to
-- one organization so it can later be shown to organization owners/admins.

CREATE TABLE IF NOT EXISTS organization_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_audit_logs_action_not_empty CHECK (length(trim(action)) > 0),
  CONSTRAINT organization_audit_logs_detail_not_empty CHECK (length(trim(detail)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_organization_audit_logs_org_time
ON organization_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_audit_logs_actor_time
ON organization_audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_audit_logs_action_time
ON organization_audit_logs (action, created_at DESC);

-- ---------------------------------------------------------
-- 4) Invitations hygiene
-- ---------------------------------------------------------

UPDATE organization_invitations
SET
  status = 'expired',
  updated_at = NOW()
WHERE status = 'pending'
  AND expires_at < NOW();

CREATE INDEX IF NOT EXISTS idx_organization_invitations_pending_expiry
ON organization_invitations (expires_at)
WHERE status = 'pending';

-- ---------------------------------------------------------
-- 5) Multi-tenant device/report indexes
-- ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_devices_org_active_created
ON devices (organization_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_devices_org_site_group_active
ON devices (organization_id, site_id, device_group_id, is_active);

CREATE INDEX IF NOT EXISTS idx_devices_user_active_created
ON devices (user_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sites_org_active_created
ON sites (organization_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_groups_org_active_created
ON device_groups (organization_id, is_active, created_at DESC);
