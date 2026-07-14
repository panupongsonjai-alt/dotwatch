import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authUser } from '../middlewares/authUser.js'
import { loadUser } from '../middlewares/loadUser.js'
import { pool } from '../db/pool.js'

const router = Router()

router.use(authUser)
router.use(loadUser)

const ALLOWED_ALARM_OPERATORS = new Set(['>', '>=', '<', '<=', '=', '==', '!='])
const ALLOWED_ALARM_SEVERITIES = new Set(['warning', 'critical'])
const MAX_BULK_RULES = 100

let alarmSchemaReadyPromise = null

function normalizeOperatorForStorage(operator) {
  return operator === '=' ? '==' : operator
}

function normalizeRuleForClient(rule = {}) {
  return {
    ...rule,
    operator: rule.operator === '==' ? '=' : rule.operator,
    notification_message: rule.notification_message || '',
    is_active: rule.is_active !== false,
  }
}

/**
 * Production compatibility guard.
 *
 * Some deployed dotWatch databases were created before alarm_rules gained
 * device_id, notification_message and timestamp columns. The dashboard can
 * already be running the newer API while the database is still on that older
 * shape, which makes both GET /alarm-rules and POST /save-all fail with 500.
 *
 * Keep the normal migration as the source of truth, but repair the small,
 * backwards-compatible alarm schema gap once per backend process so the API
 * becomes usable immediately after deploy.
 */
async function ensureAlarmRulesSchema() {
  if (alarmSchemaReadyPromise) {
    return alarmSchemaReadyPromise
  }

  alarmSchemaReadyPromise = (async () => {
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [17833713])

      await client.query(`
        CREATE TABLE IF NOT EXISTS alarm_rules (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE,
          metric TEXT NOT NULL,
          operator TEXT NOT NULL,
          threshold DOUBLE PRECISION NOT NULL,
          severity TEXT NOT NULL DEFAULT 'warning',
          notification_message TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)

      await client.query(`
        ALTER TABLE alarm_rules
          ADD COLUMN IF NOT EXISTS device_id BIGINT,
          ADD COLUMN IF NOT EXISTS metric TEXT,
          ADD COLUMN IF NOT EXISTS operator TEXT,
          ADD COLUMN IF NOT EXISTS threshold DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'warning',
          ADD COLUMN IF NOT EXISTS notification_message TEXT,
          ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
      `)

      await client.query(`
        UPDATE alarm_rules
        SET
          operator = CASE
            WHEN operator = '=' THEN '=='
            WHEN operator IN ('>', '>=', '<', '<=', '==', '!=') THEN operator
            ELSE '>'
          END,
          severity = CASE
            WHEN LOWER(TRIM(COALESCE(severity, 'warning'))) = 'critical'
              THEN 'critical'
            ELSE 'warning'
          END,
          is_active = COALESCE(is_active, TRUE),
          created_at = COALESCE(created_at, NOW()),
          updated_at = COALESCE(updated_at, created_at, NOW())
      `)

      // Runtime requests must never perform destructive cleanup. Older alarm
      // rows may still be referenced by alarm_events/alarm_states. The normal
      // migration safely remaps those references before it removes duplicates.
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_alarm_rules_user_device
        ON alarm_rules(user_id, device_id)
      `)

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  })()

  try {
    await alarmSchemaReadyPromise
  } catch (error) {
    alarmSchemaReadyPromise = null
    console.error('ensureAlarmRulesSchema error:', {
      message: error?.message,
      code: error?.code,
      constraint: error?.constraint,
      detail: error?.detail,
    })
    throw error
  }
}

function normalizeAlarmPayload(payload = {}) {
  const metric = String(payload.metric || '').trim()
  const severity = String(payload.severity || 'warning')
    .trim()
    .toLowerCase()
  const rawId = payload.id == null || payload.id === '' ? null : Number(payload.id)
  const shouldDelete = payload.delete === true || payload._delete === true

  if (!metric) {
    return {
      error: 'Value is required',
    }
  }

  if (!ALLOWED_ALARM_SEVERITIES.has(severity)) {
    return {
      error: 'Invalid severity',
    }
  }

  if (rawId != null && (!Number.isInteger(rawId) || rawId <= 0)) {
    return {
      error: 'Invalid alarm rule id',
    }
  }

  if (shouldDelete) {
    return {
      value: {
        id: rawId,
        metric,
        severity,
        delete: true,
      },
    }
  }

  const operator = normalizeOperatorForStorage(
    String(payload.operator || '').trim()
  )
  const threshold = Number(payload.threshold)
  const notificationMessage = String(payload.notification_message || '').trim()

  if (!ALLOWED_ALARM_OPERATORS.has(operator)) {
    return {
      error: 'Invalid operator',
    }
  }

  if (!Number.isFinite(threshold)) {
    return {
      error: 'Threshold must be a valid number',
    }
  }

  if (notificationMessage.length > 300) {
    return {
      error: 'Notification message must not exceed 300 characters',
    }
  }

  return {
    value: {
      id: rawId,
      metric,
      operator,
      threshold,
      severity,
      notificationMessage,
      isActive:
        typeof payload.is_active === 'boolean' ? payload.is_active : true,
      delete: false,
    },
  }
}

async function listCanonicalRulesForDevice({ client = pool, userId, deviceId }) {
  const result = await client.query(
    `
    SELECT canonical.*
    FROM (
      SELECT DISTINCT ON (
        ar.device_id,
        ar.metric,
        LOWER(TRIM(ar.severity))
      )
        ar.*,
        d.name AS device_name,
        dm.metric_name,
        dm.unit
      FROM alarm_rules ar
      LEFT JOIN devices d
        ON d.id = ar.device_id
      LEFT JOIN device_metrics dm
        ON dm.device_id = ar.device_id
        AND dm.metric_key = ar.metric
      WHERE ar.user_id = $1
        AND ar.device_id = $2
      ORDER BY
        ar.device_id,
        ar.metric,
        LOWER(TRIM(ar.severity)),
        ar.updated_at DESC NULLS LAST,
        ar.id DESC
    ) canonical
    ORDER BY canonical.updated_at DESC NULLS LAST, canonical.id DESC
    `,
    [userId, deviceId]
  )

  return result.rows.map(normalizeRuleForClient)
}

async function deleteAlarmRuleOperation({
  client,
  userId,
  deviceId,
  rule,
}) {
  await client.query(
    `
    DELETE FROM alarm_rules
    WHERE user_id = $1
      AND device_id = $2
      AND metric = $3
      AND LOWER(TRIM(severity)) = $4
    `,
    [userId, deviceId, rule.metric, rule.severity]
  )
}

async function requireOwnedAlarmDevice(deviceId, userId, client = pool) {
  const result = await client.query(
    `
    SELECT id
    FROM devices
    WHERE id = $1
      AND user_id = $2
      AND is_active = true
    LIMIT 1
    `,
    [deviceId, userId]
  )

  return result.rows[0] || null
}

async function requireDeviceMetrics(deviceId, metricKeys, client = pool) {
  if (!metricKeys.length) return new Set()

  const result = await client.query(
    `
    SELECT metric_key
    FROM device_metrics
    WHERE device_id = $1
      AND metric_key = ANY($2::text[])
    `,
    [deviceId, metricKeys]
  )

  return new Set(result.rows.map((row) => String(row.metric_key)))
}

async function assertMetricBelongsToDevice({
  client = pool,
  deviceId,
  metric,
}) {
  const result = await client.query(
    `
    SELECT metric_key
    FROM device_metrics
    WHERE device_id = $1
      AND metric_key = $2
    LIMIT 1
    `,
    [deviceId, metric]
  )

  return Boolean(result.rows[0])
}

async function findExistingRule({
  client,
  userId,
  deviceId,
  ruleId,
  metric,
  severity,
}) {
  if (ruleId) {
    const byId = await client.query(
      `
      SELECT *
      FROM alarm_rules
      WHERE id = $1
        AND user_id = $2
        AND device_id = $3
      LIMIT 1
      `,
      [ruleId, userId, deviceId]
    )

    if (byId.rows[0]) return byId.rows[0]
  }

  const byIdentity = await client.query(
    `
    SELECT *
    FROM alarm_rules
    WHERE user_id = $1
      AND device_id = $2
      AND metric = $3
      AND LOWER(TRIM(severity)) = $4
    ORDER BY updated_at DESC NULLS LAST, id DESC
    LIMIT 1
    `,
    [userId, deviceId, metric, severity]
  )

  return byIdentity.rows[0] || null
}

async function removeDuplicateIdentityRules({
  client,
  userId,
  deviceId,
  metric,
  severity,
  keepRuleId,
}) {
  await client.query(
    `
    DELETE FROM alarm_rules
    WHERE user_id = $1
      AND device_id = $2
      AND metric = $3
      AND LOWER(TRIM(severity)) = $4
      AND id <> $5
    `,
    [userId, deviceId, metric, severity, keepRuleId]
  )
}

async function upsertAlarmRule({
  client,
  userId,
  deviceId,
  rule,
}) {
  const existingRule = await findExistingRule({
    client,
    userId,
    deviceId,
    ruleId: rule.id,
    metric: rule.metric,
    severity: rule.severity,
  })

  let savedRule

  if (existingRule) {
    const result = await client.query(
      `
      UPDATE alarm_rules
      SET
        metric = $1,
        operator = $2,
        threshold = $3,
        severity = $4,
        notification_message = $5,
        is_active = $6,
        updated_at = NOW()
      WHERE id = $7
        AND user_id = $8
        AND device_id = $9
      RETURNING *
      `,
      [
        rule.metric,
        rule.operator,
        rule.threshold,
        rule.severity,
        rule.notificationMessage || null,
        rule.isActive,
        existingRule.id,
        userId,
        deviceId,
      ]
    )

    savedRule = result.rows[0]
  } else {
    await client.query('SAVEPOINT alarm_rule_insert')

    try {
      const result = await client.query(
        `
        INSERT INTO alarm_rules (
          user_id,
          device_id,
          metric,
          operator,
          threshold,
          severity,
          notification_message,
          is_active
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
        `,
        [
          userId,
          deviceId,
          rule.metric,
          rule.operator,
          rule.threshold,
          rule.severity,
          rule.notificationMessage || null,
          rule.isActive,
        ]
      )

      savedRule = result.rows[0]
      await client.query('RELEASE SAVEPOINT alarm_rule_insert')
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT alarm_rule_insert')

      if (error?.code !== '23505') {
        await client.query('RELEASE SAVEPOINT alarm_rule_insert')
        throw error
      }

      const retryExistingRule = await findExistingRule({
        client,
        userId,
        deviceId,
        metric: rule.metric,
        severity: rule.severity,
      })

      if (!retryExistingRule) {
        await client.query('RELEASE SAVEPOINT alarm_rule_insert')
        throw error
      }

      const result = await client.query(
        `
        UPDATE alarm_rules
        SET
          operator = $1,
          threshold = $2,
          notification_message = $3,
          is_active = $4,
          severity = $5,
          updated_at = NOW()
        WHERE id = $6
          AND user_id = $7
          AND device_id = $8
        RETURNING *
        `,
        [
          rule.operator,
          rule.threshold,
          rule.notificationMessage || null,
          rule.isActive,
          rule.severity,
          retryExistingRule.id,
          userId,
          deviceId,
        ]
      )

      savedRule = result.rows[0]
      await client.query('RELEASE SAVEPOINT alarm_rule_insert')
    }
  }

  if (!savedRule) {
    throw new Error('Alarm rule could not be saved')
  }

  await removeDuplicateIdentityRules({
    client,
    userId,
    deviceId,
    metric: rule.metric,
    severity: rule.severity,
    keepRuleId: savedRule.id,
  })

  return savedRule
}

async function removeOrphanAlarmRules({ client, userId, deviceId }) {
  await client.query(
    `
    DELETE FROM alarm_rules ar
    WHERE ar.user_id = $1
      AND ar.device_id = $2
      AND NOT EXISTS (
        SELECT 1
        FROM device_metrics dm
        WHERE dm.device_id = ar.device_id
          AND dm.metric_key = ar.metric
      )
    `,
    [userId, deviceId]
  )
}

/**
 * GET /api/alarm-rules
 * Returns one canonical row per device + metric + severity combination.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    await ensureAlarmRulesSchema()

    const requestedDeviceId =
      req.query.deviceId == null || req.query.deviceId === ''
        ? null
        : Number(req.query.deviceId)

    if (
      requestedDeviceId != null &&
      (!Number.isInteger(requestedDeviceId) || requestedDeviceId <= 0)
    ) {
      return res.status(400).json({ message: 'Invalid device id' })
    }

    if (requestedDeviceId != null) {
      const ownedDevice = await requireOwnedAlarmDevice(
        requestedDeviceId,
        req.dbUser.id
      )

      if (!ownedDevice) {
        return res.status(404).json({ message: 'Device not found or access denied' })
      }
    }

    const result = await pool.query(
      `
      SELECT canonical.*
      FROM (
        SELECT DISTINCT ON (
          ar.device_id,
          ar.metric,
          LOWER(TRIM(ar.severity))
        )
          ar.*,
          d.name AS device_name,
          dm.metric_name,
          dm.unit
        FROM alarm_rules ar
        LEFT JOIN devices d
          ON d.id = ar.device_id
        LEFT JOIN device_metrics dm
          ON dm.device_id = ar.device_id
          AND dm.metric_key = ar.metric
        WHERE ar.user_id = $1
          AND ($2::bigint IS NULL OR ar.device_id = $2)
        ORDER BY
          ar.device_id,
          ar.metric,
          LOWER(TRIM(ar.severity)),
          ar.updated_at DESC NULLS LAST,
          ar.id DESC
      ) canonical
      ORDER BY canonical.updated_at DESC NULLS LAST, canonical.id DESC
      `,
      [req.dbUser.id, requestedDeviceId]
    )

    res.json(result.rows.map(normalizeRuleForClient))
  })
)

/**
 * POST /api/alarm-rules/save-all
 * Saves every Warning/Critical rule for one device in a single transaction.
 */
router.post(
  '/save-all',
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.body?.device_id)
    const rules = req.body?.rules

    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      return res.status(400).json({
        message: 'Valid device is required',
      })
    }

    if (!Array.isArray(rules)) {
      return res.status(400).json({
        message: 'Rules must be an array',
      })
    }

    if (rules.length > MAX_BULK_RULES) {
      return res.status(400).json({
        message: `A maximum of ${MAX_BULK_RULES} alarm rules can be saved at once`,
      })
    }

    await ensureAlarmRulesSchema()

    const normalizedRules = []
    const identityKeys = new Set()

    for (const [index, payload] of rules.entries()) {
      const normalized = normalizeAlarmPayload(payload)

      if (normalized.error) {
        return res.status(400).json({
          message: `Rule ${index + 1}: ${normalized.error}`,
        })
      }

      const identityKey = `${normalized.value.metric}\u0000${normalized.value.severity}`

      if (identityKeys.has(identityKey)) {
        return res.status(400).json({
          message: `Duplicate ${normalized.value.severity} rule for ${normalized.value.metric}`,
        })
      }

      identityKeys.add(identityKey)
      normalizedRules.push(normalized.value)
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const ownedDevice = await requireOwnedAlarmDevice(
        deviceId,
        req.dbUser.id,
        client
      )

      if (!ownedDevice) {
        await client.query('ROLLBACK')
        return res.status(404).json({
          message: 'Device not found or access denied',
        })
      }

      await removeOrphanAlarmRules({
        client,
        userId: req.dbUser.id,
        deviceId,
      })

      const upsertRules = normalizedRules.filter((rule) => !rule.delete)
      const metricKeys = [...new Set(upsertRules.map((rule) => rule.metric))]
      const savedMetricKeys = await requireDeviceMetrics(
        deviceId,
        metricKeys,
        client
      )
      const missingMetric = metricKeys.find(
        (metricKey) => !savedMetricKeys.has(String(metricKey))
      )

      if (missingMetric) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          message: `Value ${missingMetric} was not found for this device`,
        })
      }

      let savedCount = 0
      let deletedCount = 0

      for (const rule of normalizedRules) {
        if (rule.delete) {
          await deleteAlarmRuleOperation({
            client,
            userId: req.dbUser.id,
            deviceId,
            rule,
          })
          deletedCount += 1
          continue
        }

        await upsertAlarmRule({
          client,
          userId: req.dbUser.id,
          deviceId,
          rule,
        })
        savedCount += 1
      }

      await removeOrphanAlarmRules({
        client,
        userId: req.dbUser.id,
        deviceId,
      })

      const canonicalRules = await listCanonicalRulesForDevice({
        client,
        userId: req.dbUser.id,
        deviceId,
      })

      await client.query('COMMIT')

      return res.json({
        success: true,
        saved_count: savedCount,
        deleted_count: deletedCount,
        rules: canonicalRules,
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  })
)

/**
 * POST /api/alarm-rules
 * Compatibility endpoint. It is idempotent by device + metric + severity.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.body?.device_id)

    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      return res.status(400).json({
        message: 'Valid device is required',
      })
    }

    await ensureAlarmRulesSchema()

    const normalized = normalizeAlarmPayload(req.body)

    if (normalized.error) {
      return res.status(400).json({
        message: normalized.error,
      })
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const ownedDevice = await requireOwnedAlarmDevice(
        deviceId,
        req.dbUser.id,
        client
      )

      if (!ownedDevice) {
        await client.query('ROLLBACK')
        return res.status(404).json({
          message: 'Device not found or access denied',
        })
      }

      const metricExists = await assertMetricBelongsToDevice({
        client,
        deviceId,
        metric: normalized.value.metric,
      })

      if (!metricExists) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          message: `Value ${normalized.value.metric} was not found for this device`,
        })
      }

      const savedRule = await upsertAlarmRule({
        client,
        userId: req.dbUser.id,
        deviceId,
        rule: normalized.value,
      })

      await client.query('COMMIT')
      res.status(201).json(normalizeRuleForClient(savedRule))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  })
)

/**
 * PUT /api/alarm-rules/:id
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const ruleId = Number(req.params.id)

    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return res.status(400).json({
        message: 'Invalid alarm rule id',
      })
    }

    await ensureAlarmRulesSchema()

    const normalized = normalizeAlarmPayload({
      ...req.body,
      id: ruleId,
    })

    if (normalized.error) {
      return res.status(400).json({
        message: normalized.error,
      })
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const existingResult = await client.query(
        `
        SELECT device_id
        FROM alarm_rules
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
        `,
        [ruleId, req.dbUser.id]
      )

      if (!existingResult.rows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({
          message: 'Alarm rule not found',
        })
      }

      const deviceId = Number(existingResult.rows[0].device_id)
      const ownedDevice = await requireOwnedAlarmDevice(
        deviceId,
        req.dbUser.id,
        client
      )

      if (!ownedDevice) {
        await client.query('ROLLBACK')
        return res.status(404).json({
          message: 'Device not found or access denied',
        })
      }

      const metricExists = await assertMetricBelongsToDevice({
        client,
        deviceId,
        metric: normalized.value.metric,
      })

      if (!metricExists) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          message: `Value ${normalized.value.metric} was not found for this device`,
        })
      }

      const savedRule = await upsertAlarmRule({
        client,
        userId: req.dbUser.id,
        deviceId,
        rule: normalized.value,
      })

      await client.query('COMMIT')
      res.json(normalizeRuleForClient(savedRule))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  })
)

/**
 * DELETE /api/alarm-rules/:id
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await ensureAlarmRulesSchema()

    const result = await pool.query(
      `
      DELETE FROM alarm_rules
      WHERE id = $1
        AND user_id = $2
      RETURNING id
      `,
      [req.params.id, req.dbUser.id]
    )

    if (!result.rows.length) {
      return res.status(404).json({
        message: 'Alarm rule not found',
      })
    }

    res.json({
      success: true,
    })
  })
)

export default router
