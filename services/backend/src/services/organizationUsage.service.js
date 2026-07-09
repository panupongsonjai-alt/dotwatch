import { pool } from '../db/pool.js'

function toInt(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function limitStatus(count, limit) {
  const safeLimit = toInt(limit, 0)
  const safeCount = toInt(count, 0)

  if (safeLimit < 0) return 'unlimited'
  if (safeCount >= safeLimit) return 'blocked'
  if (safeLimit > 0 && safeCount / safeLimit >= 0.8) return 'warning'
  return 'ok'
}

export async function getOrganizationUsage({ organizationId, client = pool }) {
  const result = await client.query(
    `
    WITH org_base AS (
      SELECT
        o.id,
        o.name,
        o.slug,
        o.owner_user_id,
        COALESCE(us.plan_key, u.plan, 'free') AS plan_key
      FROM organizations o
      LEFT JOIN users u
        ON u.id = o.owner_user_id
      LEFT JOIN user_subscriptions us
        ON us.user_id = o.owner_user_id
      WHERE o.id = $1
        AND o.is_active = true
      LIMIT 1
    ), counts AS (
      SELECT
        ob.id AS organization_id,
        COUNT(DISTINCT d.id) FILTER (WHERE d.is_active = true)::int AS device_count,
        COUNT(DISTINCT s.id) FILTER (WHERE s.is_active = true)::int AS site_count,
        COUNT(DISTINCT om.user_id) FILTER (WHERE om.is_active = true)::int AS member_count,
        COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending' AND oi.expires_at > NOW())::int AS pending_invitation_count
      FROM org_base ob
      LEFT JOIN devices d
        ON d.organization_id = ob.id
      LEFT JOIN sites s
        ON s.organization_id = ob.id
      LEFT JOIN organization_members om
        ON om.organization_id = ob.id
      LEFT JOIN organization_invitations oi
        ON oi.organization_id = ob.id
      GROUP BY ob.id
    )
    SELECT
      ob.id AS "organizationId",
      ob.name AS "organizationName",
      ob.slug,
      ob.owner_user_id AS "ownerUserId",
      COALESCE(pd.plan_key, 'free') AS "planKey",
      COALESCE(pd.plan_name, 'Free') AS "planName",
      COALESCE(q.device_limit_override, pd.device_limit, 3)::int AS "deviceLimit",
      COALESCE(q.site_limit_override, pd.site_limit, 1)::int AS "siteLimit",
      COALESCE(q.user_limit_override, pd.user_limit, 1)::int AS "userLimit",
      COALESCE(q.retention_days_override, pd.retention_days, 30)::int AS "retentionDays",
      COALESCE(c.device_count, 0)::int AS "deviceCount",
      COALESCE(c.site_count, 0)::int AS "siteCount",
      COALESCE(c.member_count, 0)::int AS "memberCount",
      COALESCE(c.pending_invitation_count, 0)::int AS "pendingInvitationCount",
      q.notes AS "quotaNotes"
    FROM org_base ob
    LEFT JOIN plan_definitions pd
      ON pd.plan_key = ob.plan_key
    LEFT JOIN organization_quota_overrides q
      ON q.organization_id = ob.id
    LEFT JOIN counts c
      ON c.organization_id = ob.id
    `,
    [organizationId]
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    ...row,
    status: {
      devices: limitStatus(row.deviceCount, row.deviceLimit),
      sites: limitStatus(row.siteCount, row.siteLimit),
      users: limitStatus(row.memberCount, row.userLimit),
    },
  }
}

export async function assertOrganizationCanCreateDevice({
  organizationId,
  client = pool,
}) {
  if (!organizationId) return null

  const usage = await getOrganizationUsage({ organizationId, client })

  if (!usage) {
    const error = new Error('Organization usage not found')
    error.status = 404
    throw error
  }

  if (usage.deviceLimit >= 0 && usage.deviceCount >= usage.deviceLimit) {
    const error = new Error(
      `Organization device limit reached (${usage.deviceCount}/${usage.deviceLimit})`
    )
    error.status = 402
    error.code = 'ORG_DEVICE_LIMIT_REACHED'
    error.details = usage
    throw error
  }

  return usage
}
