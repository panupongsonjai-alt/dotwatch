import { z } from 'zod'
import { pool } from '../db/pool.js'

const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'overdue', 'suspended', 'cancelled']),
})

const updateUserPlanSchema = z.object({
  plan: z.enum(['free', 'basic', 'pro', 'enterprise']),
  deviceLimit: z.number().int().min(0).max(100000).optional(),
  renewalAt: z.string().datetime().nullable().optional(),
})

const PLAN_DEVICE_LIMITS = {
  free: 3,
  basic: 10,
  pro: 30,
  enterprise: 100,
}

export async function getAdminMe(req, res) {
  const user = req.dbUser

  res.json({
    id: user.id,
    firebase_uid: user.firebase_uid,
    email: user.email,
    name: user.display_name || user.email || 'Admin',
    role: user.role || 'user',
    status: user.status || 'active',
    plan: user.plan || 'free',
  })
}

export async function getAdminStats(req, res) {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS "totalUsers",
      (SELECT COUNT(*)::int FROM users WHERE COALESCE(status, 'active') = 'active') AS "activeUsers",
      (SELECT COUNT(*)::int FROM users WHERE COALESCE(status, 'active') = 'overdue') AS "overdueUsers",
      (SELECT COUNT(*)::int FROM users WHERE COALESCE(status, 'active') = 'suspended') AS "suspendedUsers",
      (SELECT COUNT(*)::int FROM devices WHERE is_active = true) AS "totalDevices",
      (SELECT COUNT(*)::int FROM devices WHERE is_active = true AND status = 'online') AS "onlineDevices",
      (SELECT COUNT(*)::int FROM devices WHERE is_active = true AND status = 'offline') AS "offlineDevices",
      (SELECT COUNT(*)::int FROM devices WHERE is_active = true AND status = 'warning') AS "warningDevices",
      (SELECT COUNT(*)::int FROM devices WHERE is_active = true AND status = 'critical') AS "criticalDevices"
  `)

  res.json(result.rows[0])
}

export async function listAdminUsers(req, res) {
  const result = await pool.query(`
    SELECT
      u.id,
      u.firebase_uid,
      COALESCE(u.display_name, u.email, 'Unnamed User') AS name,
      u.email,
      COALESCE(u.role, 'user') AS role,
      COALESCE(u.plan, 'free') AS plan,
      COALESCE(u.status, 'active') AS status,
      COALESCE(u.device_limit, 3) AS "deviceLimit",
      COUNT(d.id)::int AS "deviceCount",
      to_char(u.created_at, 'YYYY-MM-DD') AS "createdAt",
      COALESCE(to_char(u.last_login_at, 'YYYY-MM-DD HH24:MI'), '-') AS "lastLoginAt",
      COALESCE(to_char(u.renewal_at, 'YYYY-MM-DD'), '-') AS "renewalAt"
    FROM users u
    LEFT JOIN devices d
      ON d.user_id = u.id
      AND d.is_active = true
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `)

  res.json(result.rows)
}

export async function updateAdminUserStatus(req, res) {
  const { status } = updateUserStatusSchema.parse(req.body)
  const { userId } = req.params

  const result = await pool.query(
    `
    UPDATE users
    SET
      status = $2,
      updated_at = now()
    WHERE id = $1
    RETURNING
      id,
      firebase_uid,
      COALESCE(display_name, email, 'Unnamed User') AS name,
      email,
      COALESCE(role, 'user') AS role,
      COALESCE(plan, 'free') AS plan,
      COALESCE(status, 'active') AS status,
      COALESCE(device_limit, 3) AS "deviceLimit",
      to_char(created_at, 'YYYY-MM-DD') AS "createdAt",
      COALESCE(to_char(last_login_at, 'YYYY-MM-DD HH24:MI'), '-') AS "lastLoginAt",
      COALESCE(to_char(renewal_at, 'YYYY-MM-DD'), '-') AS "renewalAt"
    `,
    [userId, status]
  )

  if (!result.rowCount) {
    return res.status(404).json({
      message: 'User not found',
    })
  }

  await createAuditLog({
    actorUserId: req.dbUser.id,
    action: 'user.status_changed',
    detail: `Changed user ${userId} status to ${status}`,
  })

  res.json(result.rows[0])
}

export async function updateAdminUserPlan(req, res) {
  const data = updateUserPlanSchema.parse(req.body)
  const { userId } = req.params

  const deviceLimit = data.deviceLimit ?? PLAN_DEVICE_LIMITS[data.plan] ?? 3

  const result = await pool.query(
    `
    UPDATE users
    SET
      plan = $2,
      device_limit = $3,
      renewal_at = COALESCE($4::timestamptz, renewal_at),
      updated_at = now()
    WHERE id = $1
    RETURNING
      id,
      firebase_uid,
      COALESCE(display_name, email, 'Unnamed User') AS name,
      email,
      COALESCE(role, 'user') AS role,
      COALESCE(plan, 'free') AS plan,
      COALESCE(status, 'active') AS status,
      COALESCE(device_limit, 3) AS "deviceLimit",
      to_char(created_at, 'YYYY-MM-DD') AS "createdAt",
      COALESCE(to_char(last_login_at, 'YYYY-MM-DD HH24:MI'), '-') AS "lastLoginAt",
      COALESCE(to_char(renewal_at, 'YYYY-MM-DD'), '-') AS "renewalAt"
    `,
    [userId, data.plan, deviceLimit, data.renewalAt || null]
  )

  if (!result.rowCount) {
    return res.status(404).json({
      message: 'User not found',
    })
  }

  await createAuditLog({
    actorUserId: req.dbUser.id,
    action: 'user.plan_changed',
    detail: `Changed user ${userId} plan to ${data.plan}`,
  })

  res.json(result.rows[0])
}

export async function listAdminDevices(req, res) {
  const result = await pool.query(`
    SELECT
      d.id,
      d.device_code AS "deviceCode",
      d.name,
      COALESCE(u.display_name, u.email, 'Unknown Owner') AS owner,
      u.email AS "ownerEmail",
      COALESCE(dm.model_name, '-') AS model,
      COALESCE(dm.model_key, '-') AS "modelKey",
      d.status,
      COALESCE(to_char(d.last_seen_at, 'YYYY-MM-DD HH24:MI'), '-') AS "lastSeenAt",
      COALESCE(to_char(d.last_ingest_at, 'YYYY-MM-DD HH24:MI'), '-') AS "lastIngestAt",
      COALESCE(d.firmware_version, '-') AS "firmwareVersion",
      d.latitude,
      d.longitude
    FROM devices d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN device_models dm ON dm.id = d.model_id
    WHERE d.is_active = true
    ORDER BY d.created_at DESC
  `)

  res.json(result.rows)
}

export async function listAdminAuditLogs(req, res) {
  const result = await pool.query(`
    SELECT
      al.id,
      al.action,
      al.detail,
      COALESCE(actor.display_name, actor.email, 'System') AS actor,
      to_char(al.created_at, 'YYYY-MM-DD HH24:MI') AS "createdAt"
    FROM admin_audit_logs al
    LEFT JOIN users actor ON actor.id = al.actor_user_id
    ORDER BY al.created_at DESC
    LIMIT 100
  `)

  res.json(result.rows)
}

async function createAuditLog({ actorUserId, action, detail }) {
  await pool.query(
    `
    INSERT INTO admin_audit_logs (
      actor_user_id,
      action,
      detail
    )
    VALUES ($1, $2, $3)
    `,
    [actorUserId, action, detail]
  )
}
