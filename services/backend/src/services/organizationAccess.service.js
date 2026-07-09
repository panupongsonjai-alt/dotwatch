import { pool } from '../db/pool.js'

export const ORGANIZATION_ROLES = ['owner', 'admin', 'operator', 'viewer']
export const ORG_READ_ROLES = ['owner', 'admin', 'operator', 'viewer']
export const ORG_MANAGE_DEVICE_ROLES = ['owner', 'admin', 'operator']
export const ORG_SECRET_ROLES = ['owner', 'admin']
export const ORG_ADMIN_ROLES = ['owner', 'admin']
export const ORG_OWNER_ROLES = ['owner']

export function normalizeOrganizationId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) return null
  return id
}

export function normalizeOrganizationRole(value = 'viewer') {
  const role = String(value || 'viewer').trim().toLowerCase()
  return ORGANIZATION_ROLES.includes(role) ? role : 'viewer'
}

export function organizationRoleAllowed(role, allowedRoles = ORG_READ_ROLES) {
  const normalizedRole = normalizeOrganizationRole(role)
  return allowedRoles.includes(normalizedRole)
}

export async function getOrganizationMembership({
  userId,
  organizationId,
  client = pool,
}) {
  const normalizedOrganizationId = normalizeOrganizationId(organizationId)

  if (!userId || !normalizedOrganizationId) return null

  const result = await client.query(
    `
    SELECT
      om.id AS member_id,
      om.organization_id,
      om.user_id,
      om.role,
      om.is_active,
      o.name AS organization_name,
      o.slug AS organization_slug,
      o.owner_user_id
    FROM organization_members om
    JOIN organizations o
      ON o.id = om.organization_id
    WHERE om.organization_id = $1
      AND om.user_id = $2
      AND om.is_active = true
      AND o.is_active = true
    LIMIT 1
    `,
    [normalizedOrganizationId, userId]
  )

  return result.rows[0] || null
}

export async function requireOrganizationAccess({
  userId,
  organizationId,
  allowedRoles = ORG_READ_ROLES,
  client = pool,
  notFoundMessage = 'Organization not found',
  permissionMessage = 'Permission denied',
}) {
  const membership = await getOrganizationMembership({
    userId,
    organizationId,
    client,
  })

  if (!membership) {
    const error = new Error(notFoundMessage)
    error.status = 404
    throw error
  }

  if (!organizationRoleAllowed(membership.role, allowedRoles)) {
    const error = new Error(permissionMessage)
    error.status = 403
    throw error
  }

  return membership
}

export async function getDeviceAccess({
  userId,
  deviceId,
  client = pool,
}) {
  if (!userId || !deviceId) return null

  const result = await client.query(
    `
    SELECT
      d.id,
      d.user_id,
      d.device_code,
      d.name,
      d.organization_id,
      d.site_id,
      d.device_group_id,
      d.is_active,
      COALESCE(om.role, CASE WHEN d.user_id = $2 THEN 'owner' ELSE NULL END) AS organization_role,
      (d.user_id = $2) AS is_owner_user
    FROM devices d
    LEFT JOIN organization_members om
      ON om.organization_id = d.organization_id
      AND om.user_id = $2
      AND om.is_active = true
    WHERE d.id = $1
      AND d.is_active = true
      AND (
        d.user_id = $2
        OR om.user_id IS NOT NULL
      )
    LIMIT 1
    `,
    [deviceId, userId]
  )

  return result.rows[0] || null
}

export async function requireDeviceAccess({
  userId,
  deviceId,
  allowedRoles = ORG_READ_ROLES,
  client = pool,
  notFoundMessage = 'Device not found',
  permissionMessage = 'Permission denied',
}) {
  const access = await getDeviceAccess({ userId, deviceId, client })

  if (!access) {
    const error = new Error(notFoundMessage)
    error.status = 404
    throw error
  }

  if (!organizationRoleAllowed(access.organization_role, allowedRoles)) {
    const error = new Error(permissionMessage)
    error.status = 403
    throw error
  }

  return access
}

export function buildTenantDeviceAccessJoin(userIdPlaceholder = '$1') {
  return `
    LEFT JOIN organization_members tenant_access
      ON tenant_access.organization_id = d.organization_id
      AND tenant_access.user_id = ${userIdPlaceholder}
      AND tenant_access.is_active = true
  `
}

export function buildTenantDeviceAccessWhere(userIdPlaceholder = '$1') {
  return `
    d.is_active = true
    AND (
      d.user_id = ${userIdPlaceholder}
      OR tenant_access.user_id IS NOT NULL
    )
  `
}
