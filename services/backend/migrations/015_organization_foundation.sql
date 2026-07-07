-- =========================================================
-- dotWatch Migration 015
-- Organization / Site / Device Group Foundation
--
-- Purpose:
--   - Prepare dotWatch for multi-tenant / enterprise usage
--   - Keep current user_id based system working
--   - Add Organization, Site, Device Group structure
--   - Backfill existing devices into default organizations
--
-- Safe design:
--   - Does not remove existing user_id columns
--   - Does not break existing dashboard/API
--   - Adds nullable organization/site/group references first
-- =========================================================

-- ---------------------------------------------------------
-- 1) Organizations
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug_unique
ON organizations (slug)
WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_owner_user
ON organizations (owner_user_id);

-- ---------------------------------------------------------
-- 2) Organization Members
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_members (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_members_role_check
    CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),

  CONSTRAINT organization_members_unique_user
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user
ON organization_members (user_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_org_role
ON organization_members (organization_id, role);

-- ---------------------------------------------------------
-- 3) Sites
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS sites (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sites_unique_name_per_org
    UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sites_organization
ON sites (organization_id);

CREATE INDEX IF NOT EXISTS idx_sites_active
ON sites (organization_id, is_active);

-- ---------------------------------------------------------
-- 4) Device Groups
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS device_groups (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT device_groups_unique_name_per_site
    UNIQUE (organization_id, site_id, name)
);

CREATE INDEX IF NOT EXISTS idx_device_groups_organization
ON device_groups (organization_id);

CREATE INDEX IF NOT EXISTS idx_device_groups_site
ON device_groups (site_id);

-- ---------------------------------------------------------
-- 5) Add organization/site/group columns to devices
-- ---------------------------------------------------------

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL;

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS device_group_id BIGINT REFERENCES device_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_devices_organization
ON devices (organization_id);

CREATE INDEX IF NOT EXISTS idx_devices_site
ON devices (site_id);

CREATE INDEX IF NOT EXISTS idx_devices_device_group
ON devices (device_group_id);

CREATE INDEX IF NOT EXISTS idx_devices_org_status
ON devices (organization_id, status);

-- ---------------------------------------------------------
-- 6) Optional organization references for alarm tables
--    These are nullable first, so old code keeps working.
-- ---------------------------------------------------------

ALTER TABLE alarm_rules
ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE alarm_events
ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE alarm_states
ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alarm_rules_organization
ON alarm_rules (organization_id);

CREATE INDEX IF NOT EXISTS idx_alarm_events_organization
ON alarm_events (organization_id);

CREATE INDEX IF NOT EXISTS idx_alarm_states_organization
ON alarm_states (organization_id);

-- ---------------------------------------------------------
-- 7) Backfill default organization per existing user
-- ---------------------------------------------------------

INSERT INTO organizations (
  name,
  slug,
  owner_user_id
)
SELECT
  'Default Organization - User ' || u.id,
  'default-user-' || u.id,
  u.id
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM organizations o
  WHERE o.owner_user_id = u.id
);

INSERT INTO organization_members (
  organization_id,
  user_id,
  role
)
SELECT
  o.id,
  o.owner_user_id,
  'owner'
FROM organizations o
WHERE o.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.organization_id = o.id
      AND om.user_id = o.owner_user_id
  );

-- ---------------------------------------------------------
-- 8) Backfill default site/group per organization
-- ---------------------------------------------------------

INSERT INTO sites (
  organization_id,
  name,
  code
)
SELECT
  o.id,
  'Default Site',
  'default'
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM sites s
  WHERE s.organization_id = o.id
    AND s.name = 'Default Site'
);

INSERT INTO device_groups (
  organization_id,
  site_id,
  name,
  description
)
SELECT
  s.organization_id,
  s.id,
  'Default Group',
  'Default group for existing devices'
FROM sites s
WHERE s.name = 'Default Site'
  AND NOT EXISTS (
    SELECT 1
    FROM device_groups dg
    WHERE dg.organization_id = s.organization_id
      AND dg.site_id = s.id
      AND dg.name = 'Default Group'
  );

-- ---------------------------------------------------------
-- 9) Backfill existing devices to default org/site/group
-- ---------------------------------------------------------

UPDATE devices d
SET
  organization_id = o.id,
  site_id = s.id,
  device_group_id = dg.id
FROM organizations o
JOIN sites s
  ON s.organization_id = o.id
  AND s.name = 'Default Site'
JOIN device_groups dg
  ON dg.organization_id = o.id
  AND dg.site_id = s.id
  AND dg.name = 'Default Group'
WHERE d.user_id = o.owner_user_id
  AND d.organization_id IS NULL;

-- ---------------------------------------------------------
-- 10) Backfill alarm tables from device organization
-- ---------------------------------------------------------

UPDATE alarm_rules ar
SET organization_id = d.organization_id
FROM devices d
WHERE ar.device_id = d.id
  AND ar.organization_id IS NULL
  AND d.organization_id IS NOT NULL;

UPDATE alarm_events ae
SET organization_id = d.organization_id
FROM devices d
WHERE ae.device_id = d.id
  AND ae.organization_id IS NULL
  AND d.organization_id IS NOT NULL;

UPDATE alarm_states ast
SET organization_id = d.organization_id
FROM devices d
WHERE ast.device_id = d.id
  AND ast.organization_id IS NULL
  AND d.organization_id IS NOT NULL;

-- ---------------------------------------------------------
-- 11) Check result
-- ---------------------------------------------------------

-- SELECT COUNT(*) AS organizations FROM organizations;
-- SELECT COUNT(*) AS sites FROM sites;
-- SELECT COUNT(*) AS device_groups FROM device_groups;
-- SELECT id, device_code, user_id, organization_id, site_id, device_group_id
-- FROM devices
-- ORDER BY id DESC
-- LIMIT 20;
