import { pool } from '../db/pool.js'

const PLAN_KEYS = new Set(['free', 'basic', 'pro', 'enterprise'])
const ORGANIZATION_CREATE_ROLES = ['owner', 'admin', 'operator']

export function normalizePlanKey(value = 'free') {
  const planKey = String(value || 'free').trim().toLowerCase()
  return PLAN_KEYS.has(planKey) ? planKey : 'free'
}

export function normalizeOrganizationRole(value = 'viewer') {
  const role = String(value || 'viewer').trim().toLowerCase()
  if (['owner', 'admin', 'operator', 'viewer'].includes(role)) return role
  return 'viewer'
}

export async function getPlanDefinitions({ includeInactive = false } = {}) {
  const result = await pool.query(
    `
    SELECT
      plan_key AS "planKey",
      plan_name AS "planName",
      monthly_price_cents AS "monthlyPriceCents",
      currency,
      device_limit AS "deviceLimit",
      site_limit AS "siteLimit",
      user_limit AS "userLimit",
      retention_days AS "retentionDays",
      features,
      is_public AS "isPublic",
      is_active AS "isActive",
      sort_order AS "sortOrder"
    FROM plan_definitions
    WHERE ($1::boolean = true OR is_active = true)
    ORDER BY sort_order ASC, plan_key ASC
    `,
    [includeInactive]
  )

  return result.rows
}

export async function getPlanDefinition(planKey, { client = pool } = {}) {
  const result = await client.query(
    `
    SELECT *
    FROM plan_definitions
    WHERE plan_key = $1
      AND is_active = true
    LIMIT 1
    `,
    [normalizePlanKey(planKey)]
  )

  return result.rows[0] || null
}

export async function ensureDefaultOrganizationForUser({
  userId,
  email = null,
  client = pool,
}) {
  if (!userId) return null

  await client.query(
    `
    INSERT INTO organizations (
      name,
      slug,
      owner_user_id
    )
    SELECT
      $2,
      $3,
      $1
    WHERE NOT EXISTS (
      SELECT 1
      FROM organizations
      WHERE owner_user_id = $1
        AND is_active = true
    )
    `,
    [
      userId,
      email ? `Default Organization - ${email}` : `Default Organization - User ${userId}`,
      `default-user-${userId}`,
    ]
  )

  const organizationResult = await client.query(
    `
    SELECT id
    FROM organizations
    WHERE owner_user_id = $1
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [userId]
  )

  const organization = organizationResult.rows[0]
  if (!organization) return null

  await client.query(
    `
    INSERT INTO organization_members (
      organization_id,
      user_id,
      role,
      is_active,
      updated_at
    )
    VALUES ($1, $2, 'owner', true, NOW())
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET
      role = CASE
        WHEN organization_members.role = 'owner' THEN organization_members.role
        ELSE 'owner'
      END,
      is_active = true,
      updated_at = NOW()
    `,
    [organization.id, userId]
  )

  await client.query(
    `
    INSERT INTO sites (
      organization_id,
      name,
      code,
      updated_at
    )
    VALUES ($1, 'Default Site', 'default', NOW())
    ON CONFLICT (organization_id, name)
    DO UPDATE SET
      is_active = true,
      updated_at = NOW()
    `,
    [organization.id]
  )

  const siteResult = await client.query(
    `
    SELECT id
    FROM sites
    WHERE organization_id = $1
      AND name = 'Default Site'
      AND is_active = true
    LIMIT 1
    `,
    [organization.id]
  )

  const site = siteResult.rows[0]
  if (!site) {
    return {
      organizationId: organization.id,
      siteId: null,
      deviceGroupId: null,
    }
  }

  await client.query(
    `
    INSERT INTO device_groups (
      organization_id,
      site_id,
      name,
      description,
      updated_at
    )
    VALUES ($1, $2, 'Default Group', 'Default group for devices', NOW())
    ON CONFLICT (organization_id, site_id, name)
    DO UPDATE SET
      is_active = true,
      updated_at = NOW()
    `,
    [organization.id, site.id]
  )

  const groupResult = await client.query(
    `
    SELECT id
    FROM device_groups
    WHERE organization_id = $1
      AND site_id = $2
      AND name = 'Default Group'
      AND is_active = true
    LIMIT 1
    `,
    [organization.id, site.id]
  )

  return {
    organizationId: organization.id,
    siteId: site.id,
    deviceGroupId: groupResult.rows[0]?.id || null,
  }
}

export async function ensureUserSubscription({ userId, planKey = 'free', client = pool }) {
  const normalizedPlanKey = normalizePlanKey(planKey)

  await client.query(
    `
    INSERT INTO user_subscriptions (
      user_id,
      plan_key,
      status,
      current_period_start,
      metadata,
      updated_at
    )
    VALUES ($1, $2, 'active', NOW(), '{"source":"auto_create"}'::jsonb, NOW())
    ON CONFLICT (user_id)
    DO NOTHING
    `,
    [userId, normalizedPlanKey]
  )
}

export async function getUserUsage({ userId, client = pool }) {
  const result = await client.query(
    `
    SELECT
      u.id AS "userId",
      COALESCE(u.plan, 'free') AS plan,
      COALESCE(us.status, u.status, 'active') AS "subscriptionStatus",
      COALESCE(pd.device_limit, u.device_limit, 3)::int AS "deviceLimit",
      COALESCE(pd.site_limit, 1)::int AS "siteLimit",
      COALESCE(pd.user_limit, 1)::int AS "userLimit",
      COALESCE(pd.retention_days, 30)::int AS "retentionDays",
      COUNT(DISTINCT d.id)::int AS "deviceCount",
      COUNT(DISTINCT s.id)::int AS "siteCount",
      COUNT(DISTINCT om.user_id)::int AS "memberCount"
    FROM users u
    LEFT JOIN user_subscriptions us
      ON us.user_id = u.id
    LEFT JOIN plan_definitions pd
      ON pd.plan_key = COALESCE(us.plan_key, u.plan, 'free')
    LEFT JOIN devices d
      ON d.user_id = u.id
      AND d.is_active = true
    LEFT JOIN organizations o
      ON o.owner_user_id = u.id
      AND o.is_active = true
    LEFT JOIN sites s
      ON s.organization_id = o.id
      AND s.is_active = true
    LEFT JOIN organization_members om
      ON om.organization_id = o.id
      AND om.is_active = true
    WHERE u.id = $1
    GROUP BY
      u.id,
      u.plan,
      u.status,
      u.device_limit,
      us.status,
      pd.device_limit,
      pd.site_limit,
      pd.user_limit,
      pd.retention_days
    LIMIT 1
    `,
    [userId]
  )

  return result.rows[0] || null
}

export async function assertUserCanCreateDevice({ userId, client = pool }) {
  const usage = await getUserUsage({ userId, client })

  if (!usage) {
    const error = new Error('User usage not found')
    error.status = 404
    throw error
  }

  const deviceLimit = Number(usage.deviceLimit || 0)
  const deviceCount = Number(usage.deviceCount || 0)

  if (deviceLimit >= 0 && deviceCount >= deviceLimit) {
    const error = new Error(
      `Device limit reached for current plan (${deviceCount}/${deviceLimit})`
    )
    error.status = 402
    error.code = 'DEVICE_LIMIT_REACHED'
    error.details = usage
    throw error
  }

  return usage
}

async function ensureOrganizationMembership({
  client,
  userId,
  organizationId,
  allowedRoles = ORGANIZATION_CREATE_ROLES,
}) {
  const result = await client.query(
    `
    SELECT role
    FROM organization_members
    WHERE organization_id = $1
      AND user_id = $2
      AND is_active = true
    LIMIT 1
    `,
    [organizationId, userId]
  )

  const member = result.rows[0]

  if (!member || !allowedRoles.includes(member.role)) {
    const error = new Error('Permission denied for organization')
    error.status = 403
    throw error
  }

  return member
}

export async function resolveDevicePlacement({
  client = pool,
  user,
  organizationId = null,
  siteId = null,
  deviceGroupId = null,
}) {
  const userId = user?.id

  if (!userId) {
    const error = new Error('Authenticated user is required')
    error.status = 401
    throw error
  }

  if (!organizationId) {
    return ensureDefaultOrganizationForUser({
      userId,
      email: user.email,
      client,
    })
  }

  await ensureOrganizationMembership({ client, userId, organizationId })

  let resolvedSiteId = siteId || null
  let resolvedDeviceGroupId = deviceGroupId || null

  if (resolvedSiteId) {
    const siteResult = await client.query(
      `
      SELECT id
      FROM sites
      WHERE id = $1
        AND organization_id = $2
        AND is_active = true
      LIMIT 1
      `,
      [resolvedSiteId, organizationId]
    )

    if (!siteResult.rows.length) {
      const error = new Error('Site not found in organization')
      error.status = 400
      throw error
    }
  } else {
    const siteResult = await client.query(
      `
      SELECT id
      FROM sites
      WHERE organization_id = $1
        AND is_active = true
      ORDER BY
        CASE WHEN name = 'Default Site' THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1
      `,
      [organizationId]
    )

    resolvedSiteId = siteResult.rows[0]?.id || null
  }

  if (resolvedDeviceGroupId) {
    const groupResult = await client.query(
      `
      SELECT id
      FROM device_groups
      WHERE id = $1
        AND organization_id = $2
        AND is_active = true
      LIMIT 1
      `,
      [resolvedDeviceGroupId, organizationId]
    )

    if (!groupResult.rows.length) {
      const error = new Error('Device group not found in organization')
      error.status = 400
      throw error
    }
  } else if (resolvedSiteId) {
    const groupResult = await client.query(
      `
      SELECT id
      FROM device_groups
      WHERE organization_id = $1
        AND site_id = $2
        AND is_active = true
      ORDER BY
        CASE WHEN name = 'Default Group' THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1
      `,
      [organizationId, resolvedSiteId]
    )

    resolvedDeviceGroupId = groupResult.rows[0]?.id || null
  }

  return {
    organizationId,
    siteId: resolvedSiteId,
    deviceGroupId: resolvedDeviceGroupId,
  }
}
