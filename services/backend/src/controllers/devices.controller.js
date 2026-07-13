import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'
import {
  decryptDeviceSecret,
  encryptDeviceSecret,
} from '../utils/deviceSecretCrypto.js'
import { env } from '../config/env.js'
import { resolveDevicePlacement } from '../services/commercial.service.js'
import { createAdminAuditLog } from '../services/adminAudit.service.js'
import {
  ORG_ADMIN_ROLES,
  ORG_MANAGE_DEVICE_ROLES,
  ORG_READ_ROLES,
  ORG_SECRET_ROLES,
  buildTenantDeviceAccessJoin,
  buildTenantDeviceAccessWhere,
  requireDeviceAccess,
} from '../services/organizationAccess.service.js'
import { createOrganizationAuditLog } from '../services/organizationAudit.service.js'
import { assertOrganizationCanCreateDevice } from '../services/organizationUsage.service.js'
import { ensureDeviceMetricSettingsSchema } from '../services/schemaCompatibility.service.js'

const HISTORY_METRIC_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$/
const HISTORY_RESOLUTIONS = new Set([
  'auto',
  'raw',
  '1m',
  '5m',
  '10m',
  '15m',
  '30m',
  '1h',
  '1d',
])

function normalizeHistoryMetricKey(value) {
  const metricKey = String(value || '').trim()

  if (!metricKey) return ''
  if (!HISTORY_METRIC_KEY_PATTERN.test(metricKey)) return null

  return metricKey
}

function normalizeHistoryResolution(value) {
  const resolution = String(value || 'auto').trim().toLowerCase()
  return HISTORY_RESOLUTIONS.has(resolution) ? resolution : 'auto'
}

function getHistoryLimit(value) {
  const requested = Number(value)

  if (!Number.isFinite(requested)) return env.historyMaxRows

  return Math.min(Math.max(Math.trunc(requested), 100), env.historyMaxRows)
}


function getFallbackBucketSeconds(diffHours, resolution = 'auto') {
  if (resolution === '1m') return 60
  if (resolution === '5m') return 300
  if (resolution === '10m') return 600
  if (resolution === '15m') return 900
  if (resolution === '30m') return 1800
  if (resolution === '1h') return 3600
  if (resolution === '1d') return 86400

  if (diffHours <= 24 * 7) return 60
  if (diffHours <= 24 * 30) return 300
  if (diffHours <= 24 * 180) return 3600
  return 86400
}

function pickHistorySource(diffHours, resolution = 'auto') {
  if (!env.historyUseContinuousAggregates || resolution === 'raw') {
    return { type: 'raw', interval: null }
  }

  if (resolution === '1d' || diffHours > 24 * 180) {
    return { type: 'aggregate', table: 'device_metric_readings_1d', interval: '1 day' }
  }

  if (resolution === '1h' || diffHours > 24 * 30) {
    return { type: 'aggregate', table: 'device_metric_readings_1h', interval: '1 hour' }
  }

  if (resolution === '5m') {
    return { type: 'aggregate_bucket', table: 'device_metric_readings_1m', interval: '5 minutes' }
  }

  if (resolution === '10m') {
    return { type: 'aggregate_bucket', table: 'device_metric_readings_1m', interval: '10 minutes' }
  }

  if (resolution === '15m') {
    return { type: 'aggregate_bucket', table: 'device_metric_readings_1m', interval: '15 minutes' }
  }

  if (resolution === '30m') {
    return { type: 'aggregate_bucket', table: 'device_metric_readings_1m', interval: '30 minutes' }
  }

  if (resolution === '1m' || diffHours > env.historyRawMaxHours) {
    return { type: 'aggregate', table: 'device_metric_readings_1m', interval: '1 minute' }
  }

  return { type: 'raw', interval: null }
}


const LEGACY_HISTORY_METRIC_COLUMNS = new Map([
  ['metric_1', 'temperature'],
  ['temperature', 'temperature'],
  ['temp', 'temperature'],
  ['metric_2', 'humidity'],
  ['humidity', 'humidity'],
  ['hum', 'humidity'],
])

async function queryRawMetricHistory({
  deviceId,
  metricKey,
  fromDate,
  toDate,
  limit,
  bucketSeconds = null,
}) {
  if (!bucketSeconds) {
    const result = await pool.query(
      `
      SELECT
        time,
        time AS bucket_time,
        metric_key,
        value,
        value AS avg_value,
        value AS min_value,
        value AS max_value,
        1 AS sample_count
      FROM device_metric_readings
      WHERE device_id = $1
        AND metric_key = $2
        AND time BETWEEN $3 AND $4
      ORDER BY time ASC
      LIMIT $5
      `,
      [deviceId, metricKey, fromDate, toDate, limit]
    )

    return result.rows
  }

  const result = await pool.query(
    `
    SELECT
      bucket_time AS time,
      bucket_time,
      metric_key,
      AVG(value)::double precision AS value,
      AVG(value)::double precision AS avg_value,
      MIN(value)::double precision AS min_value,
      MAX(value)::double precision AS max_value,
      COUNT(*)::integer AS sample_count
    FROM (
      SELECT
        to_timestamp(
          floor(extract(epoch from time) / $5) * $5
        ) AS bucket_time,
        metric_key,
        value
      FROM device_metric_readings
      WHERE device_id = $1
        AND metric_key = $2
        AND time BETWEEN $3 AND $4
    ) bucketed
    GROUP BY bucket_time, metric_key
    ORDER BY bucket_time ASC
    LIMIT $6
    `,
    [deviceId, metricKey, fromDate, toDate, bucketSeconds, limit]
  )

  return result.rows
}

async function queryLegacyMetricHistory({
  deviceId,
  metricKey,
  fromDate,
  toDate,
  limit,
  bucketSeconds = null,
}) {
  const column = LEGACY_HISTORY_METRIC_COLUMNS.get(
    String(metricKey || '').trim().toLowerCase()
  )

  if (!column) return []

  if (!bucketSeconds) {
    const result = await pool.query(
      `
      SELECT
        time,
        time AS bucket_time,
        $5::text AS metric_key,
        ${column}::double precision AS value,
        ${column}::double precision AS avg_value,
        ${column}::double precision AS min_value,
        ${column}::double precision AS max_value,
        1 AS sample_count
      FROM sensor_readings
      WHERE device_id = $1
        AND time BETWEEN $2 AND $3
        AND ${column} IS NOT NULL
      ORDER BY time ASC
      LIMIT $4
      `,
      [deviceId, fromDate, toDate, limit, metricKey]
    )

    return result.rows
  }

  const result = await pool.query(
    `
    SELECT
      bucket_time AS time,
      bucket_time,
      $6::text AS metric_key,
      AVG(metric_value)::double precision AS value,
      AVG(metric_value)::double precision AS avg_value,
      MIN(metric_value)::double precision AS min_value,
      MAX(metric_value)::double precision AS max_value,
      COUNT(*)::integer AS sample_count
    FROM (
      SELECT
        to_timestamp(
          floor(extract(epoch from time) / $5) * $5
        ) AS bucket_time,
        ${column}::double precision AS metric_value
      FROM sensor_readings
      WHERE device_id = $1
        AND time BETWEEN $2 AND $3
        AND ${column} IS NOT NULL
    ) bucketed
    GROUP BY bucket_time
    ORDER BY bucket_time ASC
    LIMIT $4
    `,
    [deviceId, fromDate, toDate, limit, bucketSeconds, metricKey]
  )

  return result.rows
}

async function queryLatestMetricHistory({
  deviceId,
  metricKey,
  fromDate,
  toDate,
}) {
  const result = await pool.query(
    `
    SELECT
      time,
      time AS bucket_time,
      metric_key,
      value,
      value AS avg_value,
      value AS min_value,
      value AS max_value,
      1 AS sample_count
    FROM device_metric_latest
    WHERE device_id = $1
      AND metric_key = $2
      AND time BETWEEN $3 AND $4
    LIMIT 1
    `,
    [deviceId, metricKey, fromDate, toDate]
  )

  return result.rows
}

async function queryMetricHistoryFallback({
  deviceId,
  metricKey,
  fromDate,
  toDate,
  limit,
  diffHours,
  resolution,
}) {
  const bucketSeconds =
    resolution === 'raw'
      ? null
      : getFallbackBucketSeconds(diffHours, resolution)

  const rawRows = await queryRawMetricHistory({
    deviceId,
    metricKey,
    fromDate,
    toDate,
    limit,
    bucketSeconds,
  })

  if (rawRows.length) {
    return {
      rows: rawRows,
      source: bucketSeconds ? 'raw-bucket' : 'raw',
      resolution: bucketSeconds ? `${bucketSeconds}s` : 'raw',
    }
  }

  const legacyRows = await queryLegacyMetricHistory({
    deviceId,
    metricKey,
    fromDate,
    toDate,
    limit,
    bucketSeconds,
  })

  if (legacyRows.length) {
    return {
      rows: legacyRows,
      source: bucketSeconds ? 'legacy-bucket' : 'legacy',
      resolution: bucketSeconds ? `${bucketSeconds}s` : 'raw',
    }
  }

  const latestRows = await queryLatestMetricHistory({
    deviceId,
    metricKey,
    fromDate,
    toDate,
  })

  return {
    rows: latestRows,
    source: latestRows.length ? 'latest-fallback' : 'empty',
    resolution: latestRows.length ? 'latest' : null,
  }
}

export async function listDevices(req, res) {
  await ensureDeviceMetricSettingsSchema()
  const user = req.dbUser

  const result = await pool.query(
    `
    SELECT
      d.id,
      d.device_code,
      d.name,
      d.group_name,
      d.status,
      d.last_seen_at,
      d.last_ingest_at,
      d.firmware_version,
      d.last_ip_address,
      d.record_interval_seconds,
      d.last_recorded_at,
      d.latitude,
      d.longitude,
      d.map_url,
      d.model_id,
      d.organization_id,
      d.site_id,
      d.device_group_id,
      o.name AS organization_name,
      s.name AS site_name,
      dg.name AS device_group_name,
      dm.model_key,
      dm.model_name,
      dm.metric_count,

      lr.temperature,
      lr.humidity,
      lr.rssi,

      COALESCE(lm.latest_time, lr.time) AS latest_time,
      COALESCE(lm.latest_metrics, '{}'::jsonb) AS latest_metrics,
      COALESCE(metric_config.metric_configs, '[]'::jsonb) AS metric_configs

    FROM devices d
    ${buildTenantDeviceAccessJoin('$1')}
    LEFT JOIN device_models dm
      ON dm.id = d.model_id
    LEFT JOIN organizations o
      ON o.id = d.organization_id
    LEFT JOIN sites s
      ON s.id = d.site_id
    LEFT JOIN device_groups dg
      ON dg.id = d.device_group_id

    LEFT JOIN LATERAL (
      SELECT time, temperature, humidity, rssi
      FROM sensor_readings
      WHERE device_id = d.id
      ORDER BY time DESC
      LIMIT 1
    ) lr ON true

    LEFT JOIN LATERAL (
      SELECT
        MAX(metric_latest.time) AS latest_time,
        jsonb_object_agg(metric_latest.metric_key, metric_latest.value) AS latest_metrics
      FROM device_metric_latest metric_latest
      WHERE metric_latest.device_id = d.id
    ) lm ON true

    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', dm_cfg.id,
              'metric_key', dm_cfg.metric_key,
              'source_key', dm_cfg.source_key,
              'metric_name', dm_cfg.metric_name,
              'metric_type', dm_cfg.metric_type,
              'unit', dm_cfg.unit,
              'icon', dm_cfg.icon,
              'visible', dm_cfg.visible,
              'sort_order', dm_cfg.sort_order,
              'decimal_places', dm_cfg.decimal_places
            )
            ORDER BY dm_cfg.sort_order ASC, dm_cfg.metric_key ASC
          ),
          '[]'::jsonb
        ) AS metric_configs
      FROM device_metrics dm_cfg
      WHERE dm_cfg.device_id = d.id
        AND dm_cfg.visible = true
        AND NOT (d.model_id = 5 AND dm_cfg.metric_key = 'metric_3')
    ) metric_config ON true

    WHERE ${buildTenantDeviceAccessWhere('$1')}
    ORDER BY d.created_at DESC
    `,
    [user.id]
  )

  res.json(result.rows)
}

export async function createDevice(req, res) {
  const user = req.dbUser

  const name = req.body.name || 'New Device'
  const modelId = Number(req.body.modelId) || 1
  const organizationId = req.body.organizationId || req.body.organization_id || null
  const siteId = req.body.siteId || req.body.site_id || null
  const deviceGroupId = req.body.deviceGroupId || req.body.device_group_id || null

  const deviceCode =
    req.body.deviceCode ||
    `DW-${crypto.randomInt(1, 999999).toString().padStart(6, '0')}`

  const deviceSecret =
    req.body.deviceSecret || crypto.randomBytes(18).toString('hex')

  const secretHash = await bcrypt.hash(deviceSecret, 10)
  const secretEncrypted = encryptDeviceSecret(deviceSecret)

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const placement = await resolveDevicePlacement({
      client,
      user,
      organizationId,
      siteId,
      deviceGroupId,
    })

    await assertOrganizationCanCreateDevice({
      organizationId: placement?.organizationId,
      client,
    })

    const modelCheck = await client.query(
      `
      SELECT id
      FROM device_models
      WHERE id = $1
        AND is_active = true
      LIMIT 1
      `,
      [modelId]
    )

    if (!modelCheck.rows.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        message: 'Invalid device model',
      })
    }

    const deviceResult = await client.query(
      `
      INSERT INTO devices (
        user_id,
        device_code,
        name,
        secret_hash,
        secret_encrypted,
        secret_encrypted_at,
        model_id,
        organization_id,
        site_id,
        device_group_id
      )
      VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8, $9)
      RETURNING
        id,
        device_code,
        name,
        model_id,
        organization_id,
        site_id,
        device_group_id,
        group_name,
        latitude,
        longitude,
        map_url,
        created_at
      `,
      [
        user.id,
        deviceCode,
        name,
        secretHash,
        secretEncrypted,
        modelId,
        placement?.organizationId || null,
        placement?.siteId || null,
        placement?.deviceGroupId || null,
      ]
    )

    const device = deviceResult.rows[0]

    await client.query(
      `
      INSERT INTO device_metrics (
        device_id,
        metric_key,
        source_key,
        metric_name,
        metric_type,
        unit,
        icon,
        visible,
        sort_order,
        decimal_places
      )
      SELECT
        $1,
        metric_key,
        metric_key,
        default_name,
        default_type,
        default_unit,
        default_icon,
        true,
        sort_order,
        2
      FROM device_model_metrics
      WHERE model_id = $2
      ORDER BY sort_order ASC
      ON CONFLICT (device_id, metric_key) DO NOTHING
      `,
      [device.id, modelId]
    )

    await createAdminAuditLog({
      actorUserId: user.id,
      action: 'device.created',
      detail: `Created device ${device.id}`,
      metadata: {
        deviceId: device.id,
        deviceCode,
        modelId,
        organizationId: placement?.organizationId || null,
        siteId: placement?.siteId || null,
        deviceGroupId: placement?.deviceGroupId || null,
      },
      request: req,
      client,
    })

    await createOrganizationAuditLog({
      organizationId: placement?.organizationId || null,
      actorUserId: user.id,
      action: 'device.created',
      detail: `Created device ${device.device_code}`,
      metadata: {
        deviceId: device.id,
        deviceCode,
        modelId,
        siteId: placement?.siteId || null,
        deviceGroupId: placement?.deviceGroupId || null,
      },
      request: req,
      client,
    })

    await client.query('COMMIT')

    res.status(201).json({
      ...device,
      deviceSecret,
    })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getDevice(req, res) {
  await ensureDeviceMetricSettingsSchema()
  const user = req.dbUser
  const { id } = req.params

  await requireDeviceAccess({
    userId: user.id,
    deviceId: id,
    allowedRoles: ORG_READ_ROLES,
  })

  const result = await pool.query(
    `
    SELECT
      d.id,
      d.device_code,
      d.name,
      d.group_name,
      d.status,
      d.last_seen_at,
      d.last_ingest_at,
      d.firmware_version,
      d.last_ip_address,
      d.record_interval_seconds,
      d.last_recorded_at,
      d.latitude,
      d.longitude,
      d.map_url,
      d.model_id,
      d.organization_id,
      d.site_id,
      d.device_group_id,
      o.name AS organization_name,
      s.name AS site_name,
      dg.name AS device_group_name,
      dm.model_key,
      dm.model_name,
      dm.metric_count,

      lr.temperature,
      lr.humidity,
      lr.rssi,

      COALESCE(lm.latest_time, lr.time) AS latest_time,
      COALESCE(lm.latest_metrics, '{}'::jsonb) AS latest_metrics,
      COALESCE(metric_config.metric_configs, '[]'::jsonb) AS metric_configs

    FROM devices d
    ${buildTenantDeviceAccessJoin('$2')}
    LEFT JOIN device_models dm
      ON dm.id = d.model_id
    LEFT JOIN organizations o
      ON o.id = d.organization_id
    LEFT JOIN sites s
      ON s.id = d.site_id
    LEFT JOIN device_groups dg
      ON dg.id = d.device_group_id

    LEFT JOIN LATERAL (
      SELECT time, temperature, humidity, rssi
      FROM sensor_readings
      WHERE device_id = d.id
      ORDER BY time DESC
      LIMIT 1
    ) lr ON true

    LEFT JOIN LATERAL (
      SELECT
        MAX(metric_latest.time) AS latest_time,
        jsonb_object_agg(metric_latest.metric_key, metric_latest.value) AS latest_metrics
      FROM device_metric_latest metric_latest
      WHERE metric_latest.device_id = d.id
    ) lm ON true

    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', dm_cfg.id,
              'metric_key', dm_cfg.metric_key,
              'source_key', dm_cfg.source_key,
              'metric_name', dm_cfg.metric_name,
              'metric_type', dm_cfg.metric_type,
              'unit', dm_cfg.unit,
              'icon', dm_cfg.icon,
              'visible', dm_cfg.visible,
              'sort_order', dm_cfg.sort_order,
              'decimal_places', dm_cfg.decimal_places
            )
            ORDER BY dm_cfg.sort_order ASC, dm_cfg.metric_key ASC
          ),
          '[]'::jsonb
        ) AS metric_configs
      FROM device_metrics dm_cfg
      WHERE dm_cfg.device_id = d.id
        AND dm_cfg.visible = true
        AND NOT (d.model_id = 5 AND dm_cfg.metric_key = 'metric_3')
    ) metric_config ON true

    WHERE d.id = $1
      AND ${buildTenantDeviceAccessWhere('$2')}
    LIMIT 1
    `,
    [id, user.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  res.json(result.rows[0])
}

export async function updateDevice(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const {
    name,
    groupName,
    latitude,
    longitude,
    mapUrl,
    organizationId,
    organization_id,
    siteId,
    site_id,
    deviceGroupId,
    device_group_id,
  } = req.body

  const requestedOrganizationId = organizationId ?? organization_id ?? null
  const requestedSiteId = siteId ?? site_id ?? null
  const requestedDeviceGroupId = deviceGroupId ?? device_group_id ?? null
  const hasPlacementChange = Boolean(
    requestedOrganizationId || requestedSiteId || requestedDeviceGroupId
  )

  await requireDeviceAccess({
    userId: user.id,
    deviceId: id,
    allowedRoles: ORG_MANAGE_DEVICE_ROLES,
  })

  const hasLatitude = latitude !== undefined && latitude !== null
  const hasLongitude = longitude !== undefined && longitude !== null

  if (hasLatitude !== hasLongitude) {
    return res.status(400).json({
      message: 'Latitude and longitude must be provided together',
    })
  }

  const normalizedLatitude = hasLatitude ? Number(latitude) : null
  const normalizedLongitude = hasLongitude ? Number(longitude) : null

  if (
    (hasLatitude && !Number.isFinite(normalizedLatitude)) ||
    (hasLongitude && !Number.isFinite(normalizedLongitude)) ||
    (hasLatitude && (normalizedLatitude < -90 || normalizedLatitude > 90)) ||
    (hasLongitude &&
      (normalizedLongitude < -180 || normalizedLongitude > 180))
  ) {
    return res.status(400).json({
      message:
        'Invalid coordinates: latitude must be between -90 and 90, and longitude between -180 and 180',
    })
  }

  let placement = {
    organizationId: requestedOrganizationId,
    siteId: requestedSiteId,
    deviceGroupId: requestedDeviceGroupId,
  }

  if (hasPlacementChange) {
    const currentDeviceResult = await pool.query(
      `
      SELECT organization_id, site_id, device_group_id
      FROM devices
      WHERE id = $1
        AND is_active = true
      LIMIT 1
      `,
      [id]
    )

    if (!currentDeviceResult.rows.length) {
      return res.status(404).json({
        message: 'Device not found',
      })
    }

    const currentDevice = currentDeviceResult.rows[0]
    const organizationForPlacement =
      requestedOrganizationId || currentDevice.organization_id

    placement = await resolveDevicePlacement({
      user,
      organizationId: organizationForPlacement,
      siteId: requestedSiteId || currentDevice.site_id,
      deviceGroupId: requestedDeviceGroupId || currentDevice.device_group_id,
    })
  }

  const result = await pool.query(
    `
    UPDATE devices
    SET
      name = COALESCE($1, name),
      group_name = COALESCE($2, group_name),
      latitude = COALESCE($3, latitude),
      longitude = COALESCE($4, longitude),
      map_url = COALESCE($5, map_url),
      organization_id = COALESCE($6, organization_id),
      site_id = COALESCE($7, site_id),
      device_group_id = COALESCE($8, device_group_id)
    WHERE id = $9
      AND is_active = true
    RETURNING
      id,
      device_code,
      name,
      group_name,
      status,
      last_seen_at,
      last_ingest_at,
      firmware_version,
      latitude,
      longitude,
      map_url,
      model_id,
      organization_id,
      site_id,
      device_group_id
    `,
    [
      name ?? null,
      groupName ?? null,
      normalizedLatitude,
      normalizedLongitude,
      mapUrl ?? null,
      placement?.organizationId || null,
      placement?.siteId || null,
      placement?.deviceGroupId || null,
      id,
    ]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  res.json(result.rows[0])
}

export async function getDeviceSecret(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const access = await requireDeviceAccess({
    userId: user.id,
    deviceId: id,
    allowedRoles: ORG_SECRET_ROLES,
  })

  const result = await pool.query(
    `
    SELECT
      id,
      device_code,
      name,
      secret_encrypted,
      secret_encrypted_at
    FROM devices
    WHERE id = $1
      AND is_active = true
    LIMIT 1
    `,
    [id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  const device = result.rows[0]

  if (!device.secret_encrypted) {
    return res.status(409).json({
      code: 'SECRET_NOT_RECOVERABLE',
      message:
        'Device Secret เดิมถูกเก็บเป็น hash จึงดูย้อนหลังไม่ได้ กรุณา Reset Secret ใหม่ 1 ครั้ง',
    })
  }

  try {
    const deviceSecret = decryptDeviceSecret(device.secret_encrypted)

    await createOrganizationAuditLog({
      organizationId: access.organization_id || null,
      actorUserId: user.id,
      action: 'device.secret_viewed',
      detail: `Viewed secret for device ${device.device_code}`,
      metadata: { deviceId: device.id, deviceCode: device.device_code },
      request: req,
    })

    res.json({
      id: device.id,
      device_code: device.device_code,
      name: device.name,
      deviceSecret,
      secretEncryptedAt: device.secret_encrypted_at,
    })
  } catch (error) {
    res.status(409).json({
      code: 'SECRET_NOT_RECOVERABLE',
      message:
        'ไม่สามารถถอดรหัส Device Secret ได้ กรุณา Reset Secret ใหม่ 1 ครั้ง',
    })
  }
}

export async function resetDeviceSecret(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const access = await requireDeviceAccess({
    userId: user.id,
    deviceId: id,
    allowedRoles: ORG_SECRET_ROLES,
  })

  const deviceSecret = crypto.randomBytes(18).toString('hex')
  const secretHash = await bcrypt.hash(deviceSecret, 10)
  const secretEncrypted = encryptDeviceSecret(deviceSecret)

  const result = await pool.query(
    `
    UPDATE devices
    SET
      secret_hash = $1,
      secret_encrypted = $2,
      secret_encrypted_at = now()
    WHERE id = $3
      AND is_active = true
    RETURNING id, device_code, name
    `,
    [secretHash, secretEncrypted, id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  await createOrganizationAuditLog({
    organizationId: access.organization_id || null,
    actorUserId: user.id,
    action: 'device.secret_reset',
    detail: `Reset secret for device ${result.rows[0].device_code}`,
    metadata: { deviceId: result.rows[0].id, deviceCode: result.rows[0].device_code },
    request: req,
  })

  res.json({
    ...result.rows[0],
    deviceSecret,
  })
}

export async function deleteDevice(req, res) {
  const user = req.dbUser
  const { id } = req.params

  const access = await requireDeviceAccess({
    userId: user.id,
    deviceId: id,
    allowedRoles: ORG_ADMIN_ROLES,
  })

  const result = await pool.query(
    `
    DELETE FROM devices
    WHERE id = $1
      AND is_active = true
    RETURNING id, device_code
    `,
    [id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  await createOrganizationAuditLog({
    organizationId: access.organization_id || null,
    actorUserId: user.id,
    action: 'device.deleted',
    detail: `Deleted device ${result.rows[0].device_code}`,
    metadata: { deviceId: result.rows[0].id, deviceCode: result.rows[0].device_code },
    request: req,
  })

  res.json({
    ok: true,
  })
}

export async function clearHistory(req, res) {
  const user = req.dbUser
  const { id } = req.params
  const startDateValue = String(
    req.query.from ||
      req.query.start ||
      req.query.startDate ||
      req.query.date ||
      req.body?.from ||
      req.body?.start ||
      req.body?.startDate ||
      req.body?.date ||
      ''
  ).trim()
  const endDateValue = String(
    req.query.to ||
      req.query.end ||
      req.query.endDate ||
      req.query.date ||
      req.body?.to ||
      req.body?.end ||
      req.body?.endDate ||
      req.body?.date ||
      startDateValue
  ).trim()
  const rawMetricKey =
    req.query.metricKey ||
    req.query.metric_key ||
    req.query.metric ||
    req.query.key ||
    req.body?.metricKey ||
    req.body?.metric_key ||
    ''
  const metricKey = normalizeHistoryMetricKey(rawMetricKey)

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDateValue) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDateValue)
  ) {
    return res.status(400).json({
      message: 'A valid history date range is required',
    })
  }

  if (rawMetricKey && metricKey === null) {
    return res.status(400).json({
      message: 'Invalid metric key',
    })
  }

  const fromDate = new Date(`${startDateValue}T00:00:00.000+07:00`)
  const toDate = new Date(`${endDateValue}T23:59:59.999+07:00`)

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({
      message: 'Invalid history date range',
    })
  }

  if (fromDate > toDate) {
    return res.status(400).json({
      message: 'Invalid history date range: from must be before to',
    })
  }

  const access = await requireDeviceAccess({
    userId: user.id,
    deviceId: id,
    allowedRoles: ORG_ADMIN_ROLES,
  })

  const client = await pool.connect()
  let deletedCount = 0
  let legacyDeletedCount = 0

  try {
    await client.query('BEGIN')

    const deleteResult = metricKey
      ? await client.query(
          `
          WITH deleted AS (
            DELETE FROM device_metric_readings
            WHERE device_id = $1
              AND time BETWEEN $2 AND $3
              AND metric_key = $4
            RETURNING 1
          )
          SELECT COUNT(*)::integer AS deleted_count
          FROM deleted
          `,
          [id, fromDate, toDate, metricKey]
        )
      : await client.query(
          `
          WITH deleted AS (
            DELETE FROM device_metric_readings
            WHERE device_id = $1
              AND time BETWEEN $2 AND $3
            RETURNING 1
          )
          SELECT COUNT(*)::integer AS deleted_count
          FROM deleted
          `,
          [id, fromDate, toDate]
        )

    deletedCount = Number(deleteResult.rows[0]?.deleted_count || 0)

    if (!metricKey) {
      const legacyDeleteResult = await client.query(
        `
        DELETE FROM sensor_readings
        WHERE device_id = $1
          AND time BETWEEN $2 AND $3
        `,
        [id, fromDate, toDate]
      )

      legacyDeletedCount = Number(legacyDeleteResult.rowCount || 0)
    }

    if (metricKey) {
      await client.query(
        `
        DELETE FROM device_metric_latest
        WHERE device_id = $1
          AND metric_key = $2
        `,
        [id, metricKey]
      )

      await client.query(
        `
        INSERT INTO device_metric_latest (
          device_id,
          metric_key,
          time,
          value,
          updated_at
        )
        SELECT DISTINCT ON (device_id, metric_key)
          device_id,
          metric_key,
          time,
          value,
          now()
        FROM device_metric_readings
        WHERE device_id = $1
          AND metric_key = $2
        ORDER BY device_id, metric_key, time DESC
        ON CONFLICT (device_id, metric_key)
        DO UPDATE SET
          time = EXCLUDED.time,
          value = EXCLUDED.value,
          updated_at = now()
        `,
        [id, metricKey]
      )
    } else {
      await client.query(
        `
        DELETE FROM device_metric_latest
        WHERE device_id = $1
        `,
        [id]
      )

      await client.query(
        `
        INSERT INTO device_metric_latest (
          device_id,
          metric_key,
          time,
          value,
          updated_at
        )
        SELECT DISTINCT ON (device_id, metric_key)
          device_id,
          metric_key,
          time,
          value,
          now()
        FROM device_metric_readings
        WHERE device_id = $1
        ORDER BY device_id, metric_key, time DESC
        ON CONFLICT (device_id, metric_key)
        DO UPDATE SET
          time = EXCLUDED.time,
          value = EXCLUDED.value,
          updated_at = now()
        `,
        [id]
      )
    }

    await client.query(
      `
      UPDATE devices
      SET last_recorded_at = NULL
      WHERE id = $1
      `,
      [id]
    )

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  await createOrganizationAuditLog({
    organizationId: access.organization_id || null,
    actorUserId: user.id,
    action: 'device.history_cleared',
    detail: `Cleared history for device ${access.device_code} from ${startDateValue} to ${endDateValue}`,
    metadata: {
      deviceId: access.id,
      deviceCode: access.device_code,
      startDate: startDateValue,
      endDate: endDateValue,
      metricKey: metricKey || 'all',
      deletedCount,
      legacyDeletedCount,
    },
    request: req,
  })

  res.json({
    ok: true,
    deviceId: Number(id),
    startDate: startDateValue,
    endDate: endDateValue,
    metricKey: metricKey || 'all',
    deletedCount,
    legacyDeletedCount,
  })
}

export async function getHistory(req, res) {
  await ensureDeviceMetricSettingsSchema()
  const user = req.dbUser
  const { id } = req.params
  const rawMetricKey =
    req.query.metricKey ||
    req.query.metric_key ||
    req.query.metric ||
    req.query.key
  const metricKey = normalizeHistoryMetricKey(rawMetricKey)

  if (rawMetricKey && metricKey === null) {
    return res.status(400).json({
      message: 'Invalid metric key',
    })
  }

  function isDateOnly(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  }

  function getBangkokDayRange(dateValue) {
    return {
      fromDate: new Date(`${dateValue}T00:00:00.000+07:00`),
      toDate: new Date(`${dateValue}T23:59:59.999+07:00`),
    }
  }

  function parseHistoryRange(query = {}) {
    const now = new Date()
    const dateValue = query.date || query.day

    if (isDateOnly(dateValue)) {
      return getBangkokDayRange(dateValue)
    }

    const fromValue = query.from || query.start
    const toValue = query.to || query.end

    if (
      isDateOnly(fromValue) &&
      (!toValue || String(toValue) === String(fromValue))
    ) {
      return getBangkokDayRange(fromValue)
    }

    let fromDate
    let toDate

    if (isDateOnly(fromValue)) {
      fromDate = new Date(`${fromValue}T00:00:00.000+07:00`)
    } else if (fromValue) {
      fromDate = new Date(fromValue)
    } else {
      fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }

    if (isDateOnly(toValue)) {
      toDate = new Date(`${toValue}T23:59:59.999+07:00`)
    } else if (toValue) {
      toDate = new Date(toValue)
    } else if (isDateOnly(fromValue)) {
      toDate = new Date(`${fromValue}T23:59:59.999+07:00`)
    } else {
      toDate = now
    }

    return {
      fromDate,
      toDate,
    }
  }

  await requireDeviceAccess({
    userId: user.id,
    deviceId: id,
    allowedRoles: ORG_READ_ROLES,
  })

  if (metricKey) {
    const metricConfigResult = await pool.query(
      `
      SELECT metric_key
      FROM device_metrics
      WHERE device_id = $1
        AND metric_key = $2
        AND visible = true
      LIMIT 1
      `,
      [id, metricKey]
    )

    if (!metricConfigResult.rows.length) {
      return res.status(404).json({
        message: 'Metric is not configured or visible for this device',
      })
    }
  }

  const { fromDate, toDate } = parseHistoryRange(req.query)

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({
      message: 'Invalid history date range',
    })
  }

  if (fromDate > toDate) {
    return res.status(400).json({
      message: 'Invalid history date range: from must be before to',
    })
  }

  const diffHours =
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60)
  const resolution = normalizeHistoryResolution(req.query.resolution)
  const limit = getHistoryLimit(req.query.limit)
  const historySource = pickHistorySource(diffHours, resolution)

  res.set('x-dotwatch-history-source', historySource.type)
  if (historySource.interval) {
    res.set('x-dotwatch-history-resolution', historySource.interval)
  }

  if (metricKey) {
    if (historySource.type === 'raw') {
      const fallback = await queryMetricHistoryFallback({
        deviceId: id,
        metricKey,
        fromDate,
        toDate,
        limit,
        diffHours,
        resolution: resolution === 'auto' ? 'raw' : resolution,
      })

      res.set('x-dotwatch-history-source', fallback.source)
      if (fallback.resolution) {
        res.set('x-dotwatch-history-resolution', fallback.resolution)
      }

      return res.json(fallback.rows)
    }

    try {
      let aggregateRows = []

      if (historySource.type === 'aggregate_bucket') {
        const result = await pool.query(
          `
          SELECT
            time_bucket($5::interval, bucket) AS time,
            time_bucket($5::interval, bucket) AS bucket_time,
            metric_key,
            AVG(avg_value)::double precision AS value,
            AVG(avg_value)::double precision AS avg_value,
            MIN(min_value)::double precision AS min_value,
            MAX(max_value)::double precision AS max_value,
            SUM(sample_count)::integer AS sample_count
          FROM ${historySource.table}
          WHERE device_id = $1
            AND metric_key = $2
            AND bucket BETWEEN $3 AND $4
          GROUP BY time_bucket($5::interval, bucket), metric_key
          ORDER BY bucket_time ASC
          LIMIT $6
          `,
          [id, metricKey, fromDate, toDate, historySource.interval, limit]
        )

        aggregateRows = result.rows
      } else {
        const result = await pool.query(
          `
          SELECT
            bucket AS time,
            bucket AS bucket_time,
            metric_key,
            avg_value::double precision AS value,
            avg_value::double precision AS avg_value,
            min_value::double precision AS min_value,
            max_value::double precision AS max_value,
            sample_count::integer AS sample_count
          FROM ${historySource.table}
          WHERE device_id = $1
            AND metric_key = $2
            AND bucket BETWEEN $3 AND $4
          ORDER BY bucket ASC
          LIMIT $5
          `,
          [id, metricKey, fromDate, toDate, limit]
        )

        aggregateRows = result.rows
      }

      if (aggregateRows.length) {
        return res.json(aggregateRows)
      }

      console.warn('History aggregate returned no rows; using raw fallback:', {
        deviceId: id,
        metricKey,
        source: historySource.table,
        resolution,
      })
    } catch (error) {
      console.warn('History aggregate query fallback:', {
        deviceId: id,
        metricKey,
        source: historySource.table,
        message: error.message,
      })
    }

    const fallback = await queryMetricHistoryFallback({
      deviceId: id,
      metricKey,
      fromDate,
      toDate,
      limit,
      diffHours,
      resolution,
    })

    res.set('x-dotwatch-history-source', fallback.source)
    if (fallback.resolution) {
      res.set('x-dotwatch-history-resolution', fallback.resolution)
    }

    return res.json(fallback.rows)
  }

  const result = await pool.query(
    `
    SELECT
      latest.time,
      latest.time AS bucket_time,
      latest.metric_key,
      latest.value,
      latest.value AS avg_value,
      latest.value AS min_value,
      latest.value AS max_value,
      1 AS sample_count
    FROM device_metric_latest latest
    JOIN device_metrics dm_cfg
      ON dm_cfg.device_id = latest.device_id
      AND dm_cfg.metric_key = latest.metric_key
      AND dm_cfg.visible = true
    WHERE latest.device_id = $1
      AND latest.time BETWEEN $2 AND $3
    ORDER BY latest.metric_key ASC
    `,
    [id, fromDate, toDate]
  )

  res.json(result.rows)
}
