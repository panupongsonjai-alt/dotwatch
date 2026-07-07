import { pool } from '../db/pool.js'

function normalizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return {}
  return metadata
}

export async function createAdminAuditLog({
  actorUserId = null,
  action,
  detail,
  metadata = {},
  request = null,
  client = pool,
}) {
  if (!action || !detail) return null

  const ipAddress =
    request?.headers?.['x-forwarded-for'] ||
    request?.ip ||
    request?.socket?.remoteAddress ||
    null

  try {
    const result = await client.query(
      `
      INSERT INTO admin_audit_logs (
        actor_user_id,
        action,
        detail,
        metadata,
        ip_address,
        request_id
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6)
      RETURNING *
      `,
      [
        actorUserId,
        action,
        detail,
        JSON.stringify(normalizeMetadata(metadata)),
        ipAddress ? String(ipAddress).slice(0, 255) : null,
        request?.requestId || null,
      ]
    )

    return result.rows[0] || null
  } catch (error) {
    // Audit logging must never break the main business flow.
    console.warn('Admin audit log skipped:', error.message)
    return null
  }
}
