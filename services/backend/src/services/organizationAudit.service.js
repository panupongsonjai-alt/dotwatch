import { pool } from '../db/pool.js'

function normalizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return {}
  return metadata
}

function getRequestIp(request) {
  return (
    request?.headers?.['x-forwarded-for'] ||
    request?.ip ||
    request?.socket?.remoteAddress ||
    null
  )
}

export async function createOrganizationAuditLog({
  organizationId,
  actorUserId = null,
  action,
  detail,
  metadata = {},
  request = null,
  client = pool,
}) {
  if (!organizationId || !action || !detail) return null

  try {
    const result = await client.query(
      `
      INSERT INTO organization_audit_logs (
        organization_id,
        actor_user_id,
        action,
        detail,
        metadata,
        ip_address,
        request_id
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
      RETURNING *
      `,
      [
        organizationId,
        actorUserId,
        action,
        detail,
        JSON.stringify(normalizeMetadata(metadata)),
        getRequestIp(request) ? String(getRequestIp(request)).slice(0, 255) : null,
        request?.requestId || null,
      ]
    )

    return result.rows[0] || null
  } catch (error) {
    // Tenant audit logging must never break the main business flow.
    console.warn('Organization audit log skipped:', error.message)
    return null
  }
}

export async function listOrganizationAuditLogs({
  organizationId,
  limit = 100,
  client = pool,
}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 300)

  const result = await client.query(
    `
    SELECT
      oal.id,
      oal.organization_id,
      oal.actor_user_id,
      COALESCE(u.display_name, u.email, 'System') AS actor_name,
      u.email AS actor_email,
      oal.action,
      oal.detail,
      oal.metadata,
      oal.request_id,
      oal.created_at
    FROM organization_audit_logs oal
    LEFT JOIN users u
      ON u.id = oal.actor_user_id
    WHERE oal.organization_id = $1
    ORDER BY oal.created_at DESC
    LIMIT $2
    `,
    [organizationId, safeLimit]
  )

  return result.rows
}
