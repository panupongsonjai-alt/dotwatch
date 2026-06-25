import { pool } from '../db/pool.js'

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

  if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
    return null
  }

  return member
}

export async function listDeviceGroups(req, res) {
  const user = req.dbUser
  const organizationId = req.query.organizationId || req.query.organization_id
  const siteId = req.query.siteId || req.query.site_id

  if (!organizationId) {
    return res.status(400).json({
      message: 'organizationId is required',
    })
  }

  const member = await ensureOrganizationAccess(user.id, organizationId)

  if (!member) {
    return res.status(404).json({
      message: 'Organization not found',
    })
  }

  const params = [organizationId]
  let siteFilter = ''

  if (siteId) {
    params.push(siteId)
    siteFilter = `AND dg.site_id = $${params.length}`
  }

  const result = await pool.query(
    `
    SELECT
      dg.id,
      dg.organization_id,
      dg.site_id,
      s.name AS site_name,
      dg.name,
      dg.description,
      dg.is_active,
      COUNT(d.id)::int AS device_count,
      dg.created_at,
      dg.updated_at
    FROM device_groups dg
    LEFT JOIN sites s
      ON s.id = dg.site_id
    LEFT JOIN devices d
      ON d.device_group_id = dg.id
    WHERE dg.organization_id = $1
      AND dg.is_active = true
      ${siteFilter}
    GROUP BY dg.id, s.name
    ORDER BY s.name ASC, dg.name ASC
    `,
    params
  )

  res.json(result.rows)
}

export async function createDeviceGroup(req, res) {
  const user = req.dbUser
  const organizationId = req.body.organizationId || req.body.organization_id
  const siteId = req.body.siteId || req.body.site_id
  const name = String(req.body.name || '').trim()

  if (!organizationId || !name) {
    return res.status(400).json({
      message: 'organizationId and name are required',
    })
  }

  const member = await ensureOrganizationAccess(user.id, organizationId, [
    'owner',
    'admin',
  ])

  if (!member) {
    return res.status(403).json({
      message: 'Permission denied',
    })
  }

  const result = await pool.query(
    `
    INSERT INTO device_groups (
      organization_id,
      site_id,
      name,
      description
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [
      organizationId,
      siteId || null,
      name,
      req.body.description || null,
    ]
  )

  res.status(201).json(result.rows[0])
}

export async function updateDeviceGroup(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const groupResult = await pool.query(
    `
    SELECT organization_id
    FROM device_groups
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  )

  if (!groupResult.rows.length) {
    return res.status(404).json({
      message: 'Device group not found',
    })
  }

  const member = await ensureOrganizationAccess(
    user.id,
    groupResult.rows[0].organization_id,
    ['owner', 'admin']
  )

  if (!member) {
    return res.status(403).json({
      message: 'Permission denied',
    })
  }

  const result = await pool.query(
    `
    UPDATE device_groups
    SET
      site_id = COALESCE($1, site_id),
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      updated_at = NOW()
    WHERE id = $4
    RETURNING *
    `,
    [
      req.body.siteId ?? req.body.site_id ?? null,
      req.body.name ?? null,
      req.body.description ?? null,
      id,
    ]
  )

  res.json(result.rows[0])
}
