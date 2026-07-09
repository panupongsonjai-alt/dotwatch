import crypto from 'crypto'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { createAdminAuditLog } from '../services/adminAudit.service.js'
import {
  createOrganizationAuditLog,
  listOrganizationAuditLogs as listTenantAuditLogs,
} from '../services/organizationAudit.service.js'
import { getOrganizationUsage as getOrganizationUsageReport } from '../services/organizationUsage.service.js'
import { normalizeOrganizationRole } from '../services/commercial.service.js'

const memberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'operator', 'viewer']).default('viewer'),
})

const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'operator', 'viewer']).optional(),
  isActive: z.boolean().optional(),
  is_active: z.boolean().optional(),
})

function normalizeName(value, fallback = '') {
  return String(value || fallback).trim()
}

function createSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

async function getUserOrganizations(userId) {
  const result = await pool.query(
    `
    SELECT
      o.id,
      o.name,
      o.slug,
      o.owner_user_id,
      om.role,
      o.is_active,
      o.created_at,
      o.updated_at
    FROM organizations o
    JOIN organization_members om
      ON om.organization_id = o.id
    WHERE om.user_id = $1
      AND om.is_active = true
      AND o.is_active = true
    ORDER BY o.created_at ASC
    `,
    [userId]
  )

  return result.rows
}

async function ensureOrganizationAccess(userId, organizationId, allowedRoles = []) {
  const result = await pool.query(
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

  if (!member) return null
  if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) return null

  return member
}

async function assertNotLastActiveOwner(organizationId, targetUserId) {
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS owner_count
    FROM organization_members
    WHERE organization_id = $1
      AND role = 'owner'
      AND is_active = true
    `,
    [organizationId]
  )

  const ownerCount = Number(result.rows[0]?.owner_count || 0)

  const targetResult = await pool.query(
    `
    SELECT role, is_active
    FROM organization_members
    WHERE organization_id = $1
      AND user_id = $2
    LIMIT 1
    `,
    [organizationId, targetUserId]
  )

  const target = targetResult.rows[0]

  if (target?.role === 'owner' && target.is_active && ownerCount <= 1) {
    const error = new Error('Organization must keep at least one active owner')
    error.status = 409
    throw error
  }
}

export async function listOrganizations(req, res) {
  const user = req.dbUser
  const organizations = await getUserOrganizations(user.id)

  res.json(organizations)
}

export async function createOrganization(req, res) {
  const user = req.dbUser
  const name = normalizeName(req.body.name)

  if (!name) {
    return res.status(400).json({
      message: 'Organization name is required',
    })
  }

  const baseSlug = createSlug(name) || `org-${Date.now()}`
  const slug = `${baseSlug}-${user.id}`

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const organizationResult = await client.query(
      `
      INSERT INTO organizations (
        name,
        slug,
        owner_user_id
      )
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [name, slug, user.id]
    )

    const organization = organizationResult.rows[0]

    await client.query(
      `
      INSERT INTO organization_members (
        organization_id,
        user_id,
        role
      )
      VALUES ($1, $2, 'owner')
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET
        role = 'owner',
        is_active = true,
        updated_at = NOW()
      `,
      [organization.id, user.id]
    )

    await client.query(
      `
      INSERT INTO sites (
        organization_id,
        name,
        code
      )
      VALUES ($1, 'Default Site', 'default')
      ON CONFLICT (organization_id, name) DO NOTHING
      `,
      [organization.id]
    )

    await client.query(
      `
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
        'Default group for devices'
      FROM sites s
      WHERE s.organization_id = $1
        AND s.name = 'Default Site'
      ON CONFLICT (organization_id, site_id, name) DO NOTHING
      `,
      [organization.id]
    )

    await createAdminAuditLog({
      actorUserId: user.id,
      action: 'organization.created',
      detail: `Created organization ${organization.id}`,
      metadata: { organizationId: organization.id, name },
      request: req,
      client,
    })

    await createOrganizationAuditLog({
      organizationId: organization.id,
      actorUserId: user.id,
      action: 'organization.created',
      detail: `Created organization ${name}`,
      metadata: { organizationId: organization.id, name },
      request: req,
      client,
    })

    await client.query('COMMIT')

    res.status(201).json(organization)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getOrganizationOverview(req, res) {
  const user = req.dbUser
  const organizationId = req.params.id

  const memberCheck = await ensureOrganizationAccess(user.id, organizationId)

  if (!memberCheck) {
    return res.status(404).json({
      message: 'Organization not found',
    })
  }

  const summaryResult = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_devices,
      COUNT(*) FILTER (WHERE d.status = 'online')::int AS online_devices,
      COUNT(*) FILTER (WHERE d.status = 'offline')::int AS offline_devices,
      COUNT(*) FILTER (
        WHERE COALESCE(alarm_health.critical_count, 0) > 0
      )::int AS critical_devices,
      COUNT(*) FILTER (
        WHERE COALESCE(alarm_health.warning_count, 0) > 0
          AND COALESCE(alarm_health.critical_count, 0) = 0
      )::int AS warning_devices,
      COUNT(*) FILTER (
        WHERE d.status = 'online'
          AND COALESCE(alarm_health.critical_count, 0) = 0
          AND COALESCE(alarm_health.warning_count, 0) = 0
      )::int AS healthy_devices
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE state = 'critical')::int AS critical_count,
        COUNT(*) FILTER (WHERE state = 'warning')::int AS warning_count
      FROM alarm_states
      WHERE device_id = d.id
        AND state <> 'normal'
    ) alarm_health ON true
    WHERE d.organization_id = $1
      AND d.is_active = true
    `,
    [organizationId]
  )

  const sitesResult = await pool.query(
    `
    SELECT
      s.id,
      s.name,
      s.code,
      s.address,
      s.latitude,
      s.longitude,
      COUNT(d.id)::int AS device_count
    FROM sites s
    LEFT JOIN devices d
      ON d.site_id = s.id
      AND d.is_active = true
    WHERE s.organization_id = $1
      AND s.is_active = true
    GROUP BY s.id
    ORDER BY s.name ASC
    `,
    [organizationId]
  )

  res.json({
    organization_id: Number(organizationId),
    role: memberCheck.role,
    summary: summaryResult.rows[0] || {},
    sites: sitesResult.rows,
  })
}

export async function listOrganizationMembers(req, res) {
  const user = req.dbUser
  const organizationId = req.params.id

  const member = await ensureOrganizationAccess(user.id, organizationId)

  if (!member) {
    return res.status(404).json({ message: 'Organization not found' })
  }

  const result = await pool.query(
    `
    SELECT
      om.id,
      om.organization_id,
      om.user_id,
      COALESCE(u.display_name, u.email, 'Unnamed User') AS name,
      u.email,
      om.role,
      om.is_active,
      om.created_at,
      om.updated_at
    FROM organization_members om
    JOIN users u
      ON u.id = om.user_id
    WHERE om.organization_id = $1
    ORDER BY
      CASE om.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        WHEN 'operator' THEN 2
        ELSE 3
      END,
      u.email ASC
    `,
    [organizationId]
  )

  res.json(result.rows)
}

export async function addOrganizationMember(req, res) {
  const actor = req.dbUser
  const organizationId = req.params.id
  const input = memberSchema.parse({
    email: normalizeEmail(req.body.email),
    role: normalizeOrganizationRole(req.body.role),
  })

  const actorMember = await ensureOrganizationAccess(actor.id, organizationId, [
    'owner',
    'admin',
  ])

  if (!actorMember) {
    return res.status(403).json({ message: 'Permission denied' })
  }

  if (input.role === 'owner' && actorMember.role !== 'owner') {
    return res.status(403).json({ message: 'Only owners can add owners' })
  }

  const targetUserResult = await pool.query(
    `
    SELECT id, email, display_name
    FROM users
    WHERE lower(email) = lower($1)
    LIMIT 1
    `,
    [input.email]
  )

  const targetUser = targetUserResult.rows[0]

  if (targetUser) {
    const result = await pool.query(
      `
      INSERT INTO organization_members (
        organization_id,
        user_id,
        role,
        is_active,
        updated_at
      )
      VALUES ($1, $2, $3, true, NOW())
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET
        role = EXCLUDED.role,
        is_active = true,
        updated_at = NOW()
      RETURNING *
      `,
      [organizationId, targetUser.id, input.role]
    )

    await createAdminAuditLog({
      actorUserId: actor.id,
      action: 'organization.member_added',
      detail: `Added ${input.email} to organization ${organizationId}`,
      metadata: {
        organizationId,
        targetUserId: targetUser.id,
        role: input.role,
      },
      request: req,
    })

    await createOrganizationAuditLog({
      organizationId,
      actorUserId: actor.id,
      action: 'organization.member_added',
      detail: `Added ${input.email} as ${input.role}`,
      metadata: { targetUserId: targetUser.id, role: input.role },
      request: req,
    })

    return res.status(201).json({
      type: 'member',
      member: {
        ...result.rows[0],
        email: targetUser.email,
        name: targetUser.display_name || targetUser.email,
      },
    })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const invitationResult = await pool.query(
    `
    INSERT INTO organization_invitations (
      organization_id,
      email,
      role,
      invited_by_user_id,
      token_hash,
      status,
      expires_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + INTERVAL '14 days', NOW())
    ON CONFLICT (organization_id, (lower(email)))
    WHERE status = 'pending'
    DO UPDATE SET
      role = EXCLUDED.role,
      invited_by_user_id = EXCLUDED.invited_by_user_id,
      token_hash = EXCLUDED.token_hash,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
    RETURNING id, organization_id, email, role, status, expires_at, created_at, updated_at
    `,
    [organizationId, input.email, input.role, actor.id, tokenHash]
  )

  await createAdminAuditLog({
    actorUserId: actor.id,
    action: 'organization.invitation_created',
    detail: `Created invitation for ${input.email} in organization ${organizationId}`,
    metadata: {
      organizationId,
      email: input.email,
      role: input.role,
    },
    request: req,
  })

  await createOrganizationAuditLog({
    organizationId,
    actorUserId: actor.id,
    action: 'organization.invitation_created',
    detail: `Invited ${input.email} as ${input.role}`,
    metadata: { email: input.email, role: input.role },
    request: req,
  })

  res.status(201).json({
    type: 'invitation',
    invitation: invitationResult.rows[0],
  })
}

export async function updateOrganizationMember(req, res) {
  const actor = req.dbUser
  const { id: organizationId, memberId } = req.params
  const data = updateMemberSchema.parse(req.body)
  const nextIsActive = data.isActive ?? data.is_active

  const actorMember = await ensureOrganizationAccess(actor.id, organizationId, [
    'owner',
    'admin',
  ])

  if (!actorMember) {
    return res.status(403).json({ message: 'Permission denied' })
  }

  const targetResult = await pool.query(
    `
    SELECT user_id, role
    FROM organization_members
    WHERE id = $1
      AND organization_id = $2
    LIMIT 1
    `,
    [memberId, organizationId]
  )

  const target = targetResult.rows[0]

  if (!target) {
    return res.status(404).json({ message: 'Organization member not found' })
  }

  if ((data.role === 'owner' || target.role === 'owner') && actorMember.role !== 'owner') {
    return res.status(403).json({ message: 'Only owners can manage owners' })
  }

  if (data.role && data.role !== 'owner') {
    await assertNotLastActiveOwner(organizationId, target.user_id)
  }

  if (nextIsActive === false) {
    await assertNotLastActiveOwner(organizationId, target.user_id)
  }

  const result = await pool.query(
    `
    UPDATE organization_members
    SET
      role = COALESCE($1, role),
      is_active = COALESCE($2, is_active),
      updated_at = NOW()
    WHERE id = $3
      AND organization_id = $4
    RETURNING *
    `,
    [data.role || null, nextIsActive ?? null, memberId, organizationId]
  )

  await createAdminAuditLog({
    actorUserId: actor.id,
    action: 'organization.member_updated',
    detail: `Updated member ${memberId} in organization ${organizationId}`,
    metadata: {
      organizationId,
      memberId,
      role: data.role || null,
      isActive: nextIsActive ?? null,
    },
    request: req,
  })

  await createOrganizationAuditLog({
    organizationId,
    actorUserId: actor.id,
    action: 'organization.member_updated',
    detail: `Updated member ${memberId}`,
    metadata: { memberId, role: data.role || null, isActive: nextIsActive ?? null },
    request: req,
  })

  res.json(result.rows[0])
}

export async function listOrganizationInvitations(req, res) {
  const actor = req.dbUser
  const organizationId = req.params.id

  const member = await ensureOrganizationAccess(actor.id, organizationId, [
    'owner',
    'admin',
  ])

  if (!member) {
    return res.status(403).json({ message: 'Permission denied' })
  }

  const result = await pool.query(
    `
    SELECT
      oi.id,
      oi.organization_id,
      oi.email,
      oi.role,
      oi.status,
      oi.expires_at,
      COALESCE(inviter.display_name, inviter.email, 'System') AS invited_by,
      oi.created_at,
      oi.updated_at
    FROM organization_invitations oi
    LEFT JOIN users inviter
      ON inviter.id = oi.invited_by_user_id
    WHERE oi.organization_id = $1
    ORDER BY oi.created_at DESC
    LIMIT 100
    `,
    [organizationId]
  )

  res.json(result.rows)
}

export async function cancelOrganizationInvitation(req, res) {
  const actor = req.dbUser
  const { id: organizationId, invitationId } = req.params

  const member = await ensureOrganizationAccess(actor.id, organizationId, [
    'owner',
    'admin',
  ])

  if (!member) {
    return res.status(403).json({ message: 'Permission denied' })
  }

  const result = await pool.query(
    `
    UPDATE organization_invitations
    SET
      status = 'cancelled',
      updated_at = NOW()
    WHERE id = $1
      AND organization_id = $2
      AND status = 'pending'
    RETURNING id, organization_id, email, role, status, expires_at, updated_at
    `,
    [invitationId, organizationId]
  )

  if (!result.rows.length) {
    return res.status(404).json({ message: 'Pending invitation not found' })
  }

  await createAdminAuditLog({
    actorUserId: actor.id,
    action: 'organization.invitation_cancelled',
    detail: `Cancelled invitation ${invitationId} in organization ${organizationId}`,
    metadata: {
      organizationId,
      invitationId,
    },
    request: req,
  })

  await createOrganizationAuditLog({
    organizationId,
    actorUserId: actor.id,
    action: 'organization.invitation_cancelled',
    detail: `Cancelled invitation ${invitationId}`,
    metadata: { invitationId },
    request: req,
  })

  res.json(result.rows[0])
}


export async function getOrganizationUsage(req, res) {
  const actor = req.dbUser
  const organizationId = req.params.id

  const member = await ensureOrganizationAccess(actor.id, organizationId)

  if (!member) {
    return res.status(404).json({ message: 'Organization not found' })
  }

  const usage = await getOrganizationUsageReport({ organizationId })

  if (!usage) {
    return res.status(404).json({ message: 'Organization usage not found' })
  }

  res.json({
    ...usage,
    role: member.role,
  })
}

export async function listOrganizationAuditLogs(req, res) {
  const actor = req.dbUser
  const organizationId = req.params.id
  const limit = req.query.limit

  const member = await ensureOrganizationAccess(actor.id, organizationId, [
    'owner',
    'admin',
  ])

  if (!member) {
    return res.status(403).json({ message: 'Permission denied' })
  }

  const logs = await listTenantAuditLogs({ organizationId, limit })

  res.json(logs)
}
