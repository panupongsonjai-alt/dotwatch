import { pool } from '../db/pool.js'
import { getOrganizationUsage } from '../services/organizationUsage.service.js'

function getRequestedOrganizationId(req, organizations) {
  const requested = req.query.organizationId || req.query.organization_id
  if (!requested) return organizations[0]?.id || null

  const requestedId = Number(requested)
  if (!Number.isSafeInteger(requestedId) || requestedId <= 0) return null

  return organizations.find((organization) => Number(organization.id) === requestedId)
    ?.id || null
}

export async function getTenantContext(req, res) {
  const user = req.dbUser

  const organizationsResult = await pool.query(
    `
    SELECT
      o.id,
      o.name,
      o.slug,
      o.owner_user_id,
      om.role,
      o.created_at,
      o.updated_at,
      COUNT(DISTINCT d.id) FILTER (WHERE d.is_active = true)::int AS device_count,
      COUNT(DISTINCT s.id) FILTER (WHERE s.is_active = true)::int AS site_count,
      COUNT(DISTINCT members.user_id) FILTER (WHERE members.is_active = true)::int AS member_count
    FROM organizations o
    JOIN organization_members om
      ON om.organization_id = o.id
      AND om.user_id = $1
      AND om.is_active = true
    LEFT JOIN devices d
      ON d.organization_id = o.id
    LEFT JOIN sites s
      ON s.organization_id = o.id
    LEFT JOIN organization_members members
      ON members.organization_id = o.id
    WHERE o.is_active = true
    GROUP BY o.id, om.role
    ORDER BY
      CASE om.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        WHEN 'operator' THEN 2
        ELSE 3
      END,
      o.created_at ASC
    `,
    [user.id]
  )

  const organizations = organizationsResult.rows
  const activeOrganizationId = getRequestedOrganizationId(req, organizations)
  const activeUsage = activeOrganizationId
    ? await getOrganizationUsage({ organizationId: activeOrganizationId })
    : null

  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      status: user.status,
      plan: user.plan,
    },
    activeOrganizationId,
    activeUsage,
    organizations,
  })
}
