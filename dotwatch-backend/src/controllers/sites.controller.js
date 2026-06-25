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

export async function listSites(req, res) {
  const user = req.dbUser
  const organizationId = req.query.organizationId || req.query.organization_id

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

  const result = await pool.query(
    `
    SELECT
      s.id,
      s.organization_id,
      s.name,
      s.code,
      s.address,
      s.latitude,
      s.longitude,
      s.is_active,
      COUNT(d.id)::int AS device_count,
      s.created_at,
      s.updated_at
    FROM sites s
    LEFT JOIN devices d
      ON d.site_id = s.id
    WHERE s.organization_id = $1
      AND s.is_active = true
    GROUP BY s.id
    ORDER BY s.name ASC
    `,
    [organizationId]
  )

  res.json(result.rows)
}

export async function createSite(req, res) {
  const user = req.dbUser
  const organizationId = req.body.organizationId || req.body.organization_id
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
    INSERT INTO sites (
      organization_id,
      name,
      code,
      address,
      latitude,
      longitude
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      organizationId,
      name,
      req.body.code || null,
      req.body.address || null,
      req.body.latitude ?? null,
      req.body.longitude ?? null,
    ]
  )

  res.status(201).json(result.rows[0])
}

export async function updateSite(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const siteResult = await pool.query(
    `
    SELECT organization_id
    FROM sites
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  )

  if (!siteResult.rows.length) {
    return res.status(404).json({
      message: 'Site not found',
    })
  }

  const member = await ensureOrganizationAccess(
    user.id,
    siteResult.rows[0].organization_id,
    ['owner', 'admin']
  )

  if (!member) {
    return res.status(403).json({
      message: 'Permission denied',
    })
  }

  const result = await pool.query(
    `
    UPDATE sites
    SET
      name = COALESCE($1, name),
      code = COALESCE($2, code),
      address = COALESCE($3, address),
      latitude = COALESCE($4, latitude),
      longitude = COALESCE($5, longitude),
      updated_at = NOW()
    WHERE id = $6
    RETURNING *
    `,
    [
      req.body.name ?? null,
      req.body.code ?? null,
      req.body.address ?? null,
      req.body.latitude ?? null,
      req.body.longitude ?? null,
      id,
    ]
  )

  res.json(result.rows[0])
}
