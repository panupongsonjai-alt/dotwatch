import { pool } from '../db/pool.js'

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

  const memberCheck = await pool.query(
    `
    SELECT role
    FROM organization_members
    WHERE organization_id = $1
      AND user_id = $2
      AND is_active = true
    LIMIT 1
    `,
    [organizationId, user.id]
  )

  if (!memberCheck.rows.length) {
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
    WHERE s.organization_id = $1
      AND s.is_active = true
    GROUP BY s.id
    ORDER BY s.name ASC
    `,
    [organizationId]
  )

  res.json({
    organization_id: Number(organizationId),
    role: memberCheck.rows[0].role,
    summary: summaryResult.rows[0] || {},
    sites: sitesResult.rows,
  })
}
