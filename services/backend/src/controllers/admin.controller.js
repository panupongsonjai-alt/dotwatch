import { z } from 'zod'
import { pool } from '../db/pool.js'
import { createAdminAuditLog } from '../services/adminAudit.service.js'
import {
  getPlanDefinition,
  getPlanDefinitions,
  normalizePlanKey,
} from '../services/commercial.service.js'

const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'overdue', 'suspended', 'cancelled']),
})

const updateUserPlanSchema = z.object({
  plan: z.enum(['free', 'basic', 'pro', 'enterprise']),
  deviceLimit: z.number().int().min(0).max(100000).optional(),
  renewalAt: z.string().datetime().nullable().optional(),
  status: z.enum(['trialing', 'active', 'overdue', 'suspended', 'cancelled']).optional(),
})

const updateUserRoleSchema = z.object({
  role: z.enum(['user', 'admin', 'super_admin']),
})

const deviceModelMetricSchema = z.object({
  metricKey: z
    .string()
    .trim()
    .regex(/^metric_[1-9][0-9]*$/, 'metricKey must look like metric_1'),
  defaultName: z.string().trim().min(1).max(80),
  defaultType: z.string().trim().min(1).max(40).default('custom'),
  defaultUnit: z.string().trim().max(24).default(''),
  defaultIcon: z.string().trim().max(40).default('Activity'),
  sortOrder: z.number().int().min(0).max(999).optional(),
})

const deviceModelBaseSchema = z.object({
  modelKey: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_\-]+$/, 'modelKey must use lowercase letters, numbers, dash or underscore'),
  modelName: z.string().trim().min(2).max(80),
  metricCount: z.number().int().min(0).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  metrics: z.array(deviceModelMetricSchema).optional(),
})

const createDeviceModelSchema = deviceModelBaseSchema
const updateDeviceModelSchema = deviceModelBaseSchema.partial().extend({
  metrics: z.array(deviceModelMetricSchema).optional(),
})

const PLAN_DEVICE_LIMITS = {
  free: 3,
  basic: 10,
  pro: 30,
  enterprise: 100,
}

function isPrivilegedUser(user = {}) {
  return ['admin', 'super_admin'].includes(user.role || 'user')
}

function isSuperAdmin(user = {}) {
  return user.role === 'super_admin'
}

async function getTargetUser(userId) {
  const result = await pool.query(
    `
    SELECT id, role, status, email
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  )

  return result.rows[0] || null
}

async function assertCanManageTargetUser(actor, targetUserId) {
  const targetUser = await getTargetUser(targetUserId)

  if (!targetUser) {
    return {
      ok: false,
      status: 404,
      message: 'User not found',
    }
  }

  if (!isSuperAdmin(actor) && isPrivilegedUser(targetUser)) {
    return {
      ok: false,
      status: 403,
      message: 'Super admin access required',
    }
  }

  return {
    ok: true,
    targetUser,
  }
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
      (SELECT COUNT(*)::int FROM devices WHERE is_active = true AND status = 'critical') AS "criticalDevices",
      (SELECT COUNT(*)::int FROM organizations WHERE is_active = true) AS "totalOrganizations",
      (SELECT COUNT(*)::int FROM sites WHERE is_active = true) AS "totalSites",
      (SELECT COUNT(*)::int FROM user_subscriptions WHERE status = 'active') AS "activeSubscriptions",
      (SELECT COUNT(*)::int FROM user_subscriptions WHERE status IN ('overdue', 'suspended')) AS "atRiskSubscriptions"
  `)

  res.json(result.rows[0])
}

export async function getAdminCommercialSummary(req, res) {
  const [planRows, usageRows, subscriptionRows] = await Promise.all([
    pool.query(
      `
      SELECT
        pd.plan_key AS "planKey",
        pd.plan_name AS "planName",
        pd.device_limit AS "deviceLimit",
        pd.site_limit AS "siteLimit",
        pd.user_limit AS "userLimit",
        pd.retention_days AS "retentionDays",
        COUNT(us.user_id)::int AS "subscriberCount",
        COUNT(us.user_id) FILTER (WHERE us.status = 'active')::int AS "activeSubscriberCount"
      FROM plan_definitions pd
      LEFT JOIN user_subscriptions us
        ON us.plan_key = pd.plan_key
      WHERE pd.is_active = true
      GROUP BY pd.plan_key
      ORDER BY pd.sort_order ASC, pd.plan_key ASC
      `
    ),
    pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE device_count >= device_limit)::int AS "usersAtDeviceLimit",
        COUNT(*) FILTER (WHERE device_count >= GREATEST(device_limit - 1, 0))::int AS "usersNearDeviceLimit",
        COALESCE(SUM(device_count), 0)::int AS "totalAssignedDevices",
        COALESCE(SUM(device_limit), 0)::int AS "totalDeviceCapacity"
      FROM (
        SELECT
          u.id,
          COALESCE(pd.device_limit, u.device_limit, 3)::int AS device_limit,
          COUNT(d.id)::int AS device_count
        FROM users u
        LEFT JOIN user_subscriptions us ON us.user_id = u.id
        LEFT JOIN plan_definitions pd ON pd.plan_key = COALESCE(us.plan_key, u.plan, 'free')
        LEFT JOIN devices d ON d.user_id = u.id AND d.is_active = true
        GROUP BY u.id, pd.device_limit, u.device_limit
      ) usage
      `
    ),
    pool.query(
      `
      SELECT
        status,
        COUNT(*)::int AS count
      FROM user_subscriptions
      GROUP BY status
      ORDER BY status ASC
      `
    ),
  ])

  res.json({
    plans: planRows.rows,
    usage: usageRows.rows[0] || {},
    subscriptionsByStatus: subscriptionRows.rows,
  })
}

export async function listAdminPlans(req, res) {
  const plans = await getPlanDefinitions({ includeInactive: true })
  res.json(plans)
}

export async function listAdminUsers(req, res) {
  const result = await pool.query(`
    SELECT
      u.id,
      u.firebase_uid,
      COALESCE(u.display_name, u.email, 'Unnamed User') AS name,
      u.email,
      COALESCE(u.role, 'user') AS role,
      COALESCE(us.plan_key, u.plan, 'free') AS plan,
      COALESCE(us.status, u.status, 'active') AS status,
      COALESCE(pd.device_limit, u.device_limit, 3) AS "deviceLimit",
      COALESCE(pd.site_limit, 1) AS "siteLimit",
      COALESCE(pd.user_limit, 1) AS "userLimit",
      COALESCE(pd.retention_days, 30) AS "retentionDays",
      COUNT(DISTINCT d.id)::int AS "deviceCount",
      COUNT(DISTINCT o.id)::int AS "organizationCount",
      COUNT(DISTINCT s.id)::int AS "siteCount",
      to_char(u.created_at, 'YYYY-MM-DD') AS "createdAt",
      COALESCE(to_char(u.last_login_at, 'YYYY-MM-DD HH24:MI'), '-') AS "lastLoginAt",
      COALESCE(to_char(us.current_period_end, 'YYYY-MM-DD'), to_char(u.renewal_at, 'YYYY-MM-DD'), '-') AS "renewalAt"
    FROM users u
    LEFT JOIN user_subscriptions us
      ON us.user_id = u.id
    LEFT JOIN plan_definitions pd
      ON pd.plan_key = COALESCE(us.plan_key, u.plan, 'free')
    LEFT JOIN devices d
      ON d.user_id = u.id
      AND d.is_active = true
    LEFT JOIN organizations o
      ON o.owner_user_id = u.id
      AND o.is_active = true
    LEFT JOIN sites s
      ON s.organization_id = o.id
      AND s.is_active = true
    GROUP BY u.id, us.plan_key, us.status, us.current_period_end, pd.device_limit, pd.site_limit, pd.user_limit, pd.retention_days
    ORDER BY u.created_at DESC
  `)

  res.json(result.rows)
}

export async function updateAdminUserStatus(req, res) {
  const { status } = updateUserStatusSchema.parse(req.body)
  const { userId } = req.params

  const permission = await assertCanManageTargetUser(req.dbUser, userId)

  if (!permission.ok) {
    return res.status(permission.status).json({
      message: permission.message,
    })
  }

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

  await pool.query(
    `
    UPDATE user_subscriptions
    SET
      status = $2,
      updated_at = NOW()
    WHERE user_id = $1
    `,
    [userId, status === 'active' ? 'active' : status]
  )

  await createAdminAuditLog({
    actorUserId: req.dbUser.id,
    action: 'user.status_changed',
    detail: `Changed user ${userId} status to ${status}`,
    metadata: { userId, status },
    request: req,
  })

  res.json(result.rows[0])
}

export async function updateAdminUserPlan(req, res) {
  const data = updateUserPlanSchema.parse(req.body)
  const { userId } = req.params

  const permission = await assertCanManageTargetUser(req.dbUser, userId)

  if (!permission.ok) {
    return res.status(permission.status).json({
      message: permission.message,
    })
  }

  const planKey = normalizePlanKey(data.plan)
  const planDefinition = await getPlanDefinition(planKey)
  const deviceLimit =
    data.deviceLimit ??
    planDefinition?.device_limit ??
    PLAN_DEVICE_LIMITS[planKey] ??
    3
  const subscriptionStatus = data.status || 'active'

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const result = await client.query(
      `
      UPDATE users
      SET
        plan = $2,
        device_limit = $3,
        renewal_at = COALESCE($4::timestamptz, renewal_at),
        status = CASE
          WHEN $5::text IN ('overdue', 'suspended', 'cancelled') THEN $5::text
          ELSE status
        END,
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
      [userId, planKey, deviceLimit, data.renewalAt || null, subscriptionStatus]
    )

    if (!result.rowCount) {
      await client.query('ROLLBACK')
      return res.status(404).json({
        message: 'User not found',
      })
    }

    await client.query(
      `
      INSERT INTO user_subscriptions (
        user_id,
        plan_key,
        status,
        current_period_start,
        current_period_end,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3, NOW(), $4::timestamptz, $5::jsonb, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        plan_key = EXCLUDED.plan_key,
        status = EXCLUDED.status,
        current_period_end = COALESCE(EXCLUDED.current_period_end, user_subscriptions.current_period_end),
        metadata = user_subscriptions.metadata || EXCLUDED.metadata,
        updated_at = NOW()
      `,
      [
        userId,
        planKey,
        subscriptionStatus,
        data.renewalAt || null,
        JSON.stringify({
          source: 'admin_update',
          actorUserId: req.dbUser.id,
          updatedAt: new Date().toISOString(),
        }),
      ]
    )

    await createAdminAuditLog({
      actorUserId: req.dbUser.id,
      action: 'user.plan_changed',
      detail: `Changed user ${userId} plan to ${planKey}`,
      metadata: {
        userId,
        plan: planKey,
        deviceLimit,
        subscriptionStatus,
      },
      request: req,
      client,
    })

    await client.query('COMMIT')

    res.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function updateAdminUserRole(req, res) {
  const { role } = updateUserRoleSchema.parse(req.body)
  const { userId } = req.params

  if (!isSuperAdmin(req.dbUser)) {
    return res.status(403).json({ message: 'Super admin access required' })
  }

  const result = await pool.query(
    `
    UPDATE users
    SET
      role = $2,
      updated_at = NOW()
    WHERE id = $1
    RETURNING
      id,
      firebase_uid,
      COALESCE(display_name, email, 'Unnamed User') AS name,
      email,
      COALESCE(role, 'user') AS role,
      COALESCE(plan, 'free') AS plan,
      COALESCE(status, 'active') AS status,
      COALESCE(device_limit, 3) AS "deviceLimit"
    `,
    [userId, role]
  )

  if (!result.rowCount) {
    return res.status(404).json({ message: 'User not found' })
  }

  await createAdminAuditLog({
    actorUserId: req.dbUser.id,
    action: 'user.role_changed',
    detail: `Changed user ${userId} role to ${role}`,
    metadata: { userId, role },
    request: req,
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
      COALESCE(o.name, '-') AS organization,
      COALESCE(s.name, '-') AS site,
      COALESCE(dg.name, '-') AS "deviceGroup",
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
    LEFT JOIN organizations o ON o.id = d.organization_id
    LEFT JOIN sites s ON s.id = d.site_id
    LEFT JOIN device_groups dg ON dg.id = d.device_group_id
    LEFT JOIN device_models dm ON dm.id = d.model_id
    WHERE d.is_active = true
    ORDER BY d.created_at DESC
  `)

  res.json(result.rows)
}


function normalizeDeviceModelPayload(data) {
  const metricCount = Number(data.metricCount ?? data.metric_count ?? 0)
  const rawMetrics = Array.isArray(data.metrics) ? data.metrics : []
  const metrics = rawMetrics.map((metric, index) => ({
    metricKey: metric.metricKey || metric.metric_key || `metric_${index + 1}`,
    defaultName:
      metric.defaultName ||
      metric.default_name ||
      metric.metricName ||
      metric.metric_name ||
      `Metric ${index + 1}`,
    defaultType:
      metric.defaultType || metric.default_type || metric.metricType || 'custom',
    defaultUnit: metric.defaultUnit || metric.default_unit || metric.unit || '',
    defaultIcon: metric.defaultIcon || metric.default_icon || metric.icon || 'Activity',
    sortOrder:
      metric.sortOrder !== undefined
        ? Number(metric.sortOrder)
        : metric.sort_order !== undefined
          ? Number(metric.sort_order)
          : index,
  }))

  return {
    modelKey: data.modelKey || data.model_key,
    modelName: data.modelName || data.model_name,
    metricCount,
    description: data.description ?? '',
    isActive:
      data.isActive !== undefined
        ? Boolean(data.isActive)
        : data.is_active !== undefined
          ? Boolean(data.is_active)
          : true,
    metrics,
  }
}

function buildDefaultMetrics(metricCount) {
  return Array.from({ length: Number(metricCount || 0) }, (_, index) => ({
    metricKey: `metric_${index + 1}`,
    defaultName: `Metric ${index + 1}`,
    defaultType: 'custom',
    defaultUnit: '',
    defaultIcon: 'Activity',
    sortOrder: index,
  }))
}

async function upsertDeviceModelMetrics(client, modelId, metrics, metricCount) {
  const rows = metrics?.length ? metrics : buildDefaultMetrics(metricCount)
  const normalizedRows = rows.slice(0, Math.max(Number(metricCount || rows.length), rows.length))

  for (let index = 0; index < normalizedRows.length; index += 1) {
    const metric = normalizedRows[index]
    await client.query(
      `
      INSERT INTO device_model_metrics (
        model_id,
        metric_key,
        default_name,
        default_type,
        default_unit,
        default_icon,
        sort_order,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (model_id, metric_key)
      DO UPDATE SET
        default_name = EXCLUDED.default_name,
        default_type = EXCLUDED.default_type,
        default_unit = EXCLUDED.default_unit,
        default_icon = EXCLUDED.default_icon,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
      `,
      [
        modelId,
        metric.metricKey,
        metric.defaultName,
        metric.defaultType || 'custom',
        metric.defaultUnit || '',
        metric.defaultIcon || 'Activity',
        metric.sortOrder ?? index,
      ]
    )
  }

  const metricKeys = normalizedRows.map((metric) => metric.metricKey)
  if (metricKeys.length) {
    await client.query(
      `
      DELETE FROM device_model_metrics
      WHERE model_id = $1
        AND metric_key <> ALL($2::text[])
      `,
      [modelId, metricKeys]
    )
  } else {
    await client.query(`DELETE FROM device_model_metrics WHERE model_id = $1`, [modelId])
  }
}

export async function listAdminDeviceModels(req, res) {
  const includeInactive = String(req.query.includeInactive || 'true') !== 'false'

  const result = await pool.query(
    `
    SELECT
      dm.id,
      dm.model_key AS "modelKey",
      dm.model_name AS "modelName",
      dm.metric_count AS "metricCount",
      COALESCE(dm.description, '') AS description,
      COALESCE(dm.is_active, true) AS "isActive",
      COUNT(DISTINCT d.id)::int AS "deviceCount",
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', dmm.id,
            'metricKey', dmm.metric_key,
            'defaultName', dmm.default_name,
            'defaultType', dmm.default_type,
            'defaultUnit', dmm.default_unit,
            'defaultIcon', dmm.default_icon,
            'sortOrder', dmm.sort_order
          )
          ORDER BY dmm.sort_order ASC, dmm.metric_key ASC
        ) FILTER (WHERE dmm.id IS NOT NULL),
        '[]'::jsonb
      ) AS metrics
    FROM device_models dm
    LEFT JOIN devices d
      ON d.model_id = dm.id
      AND d.is_active = true
    LEFT JOIN device_model_metrics dmm
      ON dmm.model_id = dm.id
    WHERE ($1::boolean = true OR dm.is_active = true)
    GROUP BY dm.id
    ORDER BY dm.is_active DESC, dm.id ASC
    `,
    [includeInactive]
  )

  res.json(result.rows)
}

export async function createAdminDeviceModel(req, res) {
  const parsed = createDeviceModelSchema.parse(normalizeDeviceModelPayload(req.body))
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const result = await client.query(
      `
      INSERT INTO device_models (
        model_key,
        model_name,
        metric_count,
        description,
        is_active,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING
        id,
        model_key AS "modelKey",
        model_name AS "modelName",
        metric_count AS "metricCount",
        description,
        is_active AS "isActive"
      `,
      [
        parsed.modelKey,
        parsed.modelName,
        parsed.metricCount,
        parsed.description || '',
        parsed.isActive ?? true,
      ]
    )

    const model = result.rows[0]
    await upsertDeviceModelMetrics(client, model.id, parsed.metrics || [], parsed.metricCount)

    await createAdminAuditLog({
      actorUserId: req.dbUser.id,
      action: 'device_model.created',
      detail: `Created device model ${model.modelKey}`,
      metadata: { modelId: model.id, modelKey: model.modelKey },
      request: req,
      client,
    })

    await client.query('COMMIT')
    res.status(201).json(model)
  } catch (error) {
    await client.query('ROLLBACK')

    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Model key already exists' })
    }

    throw error
  } finally {
    client.release()
  }
}

export async function updateAdminDeviceModel(req, res) {
  const { modelId } = req.params
  const currentResult = await pool.query(
    `SELECT id, model_key, model_name, metric_count, description, is_active FROM device_models WHERE id = $1 LIMIT 1`,
    [modelId]
  )

  if (!currentResult.rowCount) {
    return res.status(404).json({ message: 'Device model not found' })
  }

  const current = currentResult.rows[0]
  const normalized = normalizeDeviceModelPayload({
    modelKey: current.model_key,
    modelName: current.model_name,
    metricCount: current.metric_count,
    description: current.description || '',
    isActive: current.is_active,
    ...req.body,
  })
  const parsed = updateDeviceModelSchema.parse(normalized)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const result = await client.query(
      `
      UPDATE device_models
      SET
        model_key = COALESCE($2, model_key),
        model_name = COALESCE($3, model_name),
        metric_count = COALESCE($4, metric_count),
        description = COALESCE($5, description),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        model_key AS "modelKey",
        model_name AS "modelName",
        metric_count AS "metricCount",
        description,
        is_active AS "isActive"
      `,
      [
        modelId,
        parsed.modelKey,
        parsed.modelName,
        parsed.metricCount,
        parsed.description,
        parsed.isActive,
      ]
    )

    const model = result.rows[0]
    if (Array.isArray(parsed.metrics)) {
      await upsertDeviceModelMetrics(client, model.id, parsed.metrics, model.metricCount)
    }

    await createAdminAuditLog({
      actorUserId: req.dbUser.id,
      action: 'device_model.updated',
      detail: `Updated device model ${model.modelKey}`,
      metadata: { modelId: model.id, modelKey: model.modelKey },
      request: req,
      client,
    })

    await client.query('COMMIT')
    res.json(model)
  } catch (error) {
    await client.query('ROLLBACK')

    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Model key already exists' })
    }

    throw error
  } finally {
    client.release()
  }
}

export async function deleteAdminDeviceModel(req, res) {
  const { modelId } = req.params
  const result = await pool.query(
    `
    UPDATE device_models
    SET is_active = false,
        updated_at = NOW()
    WHERE id = $1
    RETURNING
      id,
      model_key AS "modelKey",
      model_name AS "modelName",
      metric_count AS "metricCount",
      description,
      is_active AS "isActive"
    `,
    [modelId]
  )

  if (!result.rowCount) {
    return res.status(404).json({ message: 'Device model not found' })
  }

  await createAdminAuditLog({
    actorUserId: req.dbUser.id,
    action: 'device_model.deactivated',
    detail: `Deactivated device model ${result.rows[0].modelKey}`,
    metadata: { modelId: result.rows[0].id, modelKey: result.rows[0].modelKey },
    request: req,
  })

  res.json(result.rows[0])
}

export async function listAdminAuditLogs(req, res) {
  const result = await pool.query(`
    SELECT
      al.id,
      al.action,
      al.detail,
      al.metadata,
      al.ip_address AS "ipAddress",
      al.request_id AS "requestId",
      COALESCE(actor.display_name, actor.email, 'System') AS actor,
      to_char(al.created_at, 'YYYY-MM-DD HH24:MI') AS "createdAt"
    FROM admin_audit_logs al
    LEFT JOIN users actor ON actor.id = al.actor_user_id
    ORDER BY al.created_at DESC
    LIMIT 100
  `)

  res.json(result.rows)
}
