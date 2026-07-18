import { pool } from '../db/pool.js'
import { logger } from '../utils/logger.js'

const SNAPSHOT_MAX_AGE_MINUTES = 360
const INITIAL_REFRESH_TIMEOUT_MS = 12000
const BACKGROUND_REFRESH_TIMEOUT_MS = 120000
const REFRESH_ADVISORY_LOCK_KEY = 1783359072

let activeRefreshPromise = null

const OPTIONAL_RELATIONS = [
  'mobile_push_tokens',
  'device_metric_readings_1m',
  'device_metric_readings_1h',
  'device_metric_readings_1d',
]

async function getExistingOptionalRelations(client) {
  const result = await client.query(
    `
    SELECT
      relation_name,
      to_regclass('public.' || relation_name) IS NOT NULL AS exists
    FROM unnest($1::text[]) AS names(relation_name)
    `,
    [OPTIONAL_RELATIONS]
  )

  return new Set(
    result.rows.filter((row) => row.exists).map((row) => row.relation_name)
  )
}

function buildUsageQuery(existingRelations) {
  const accountRows = [
    `SELECT u.id AS user_id, pg_column_size(u)::bigint AS bytes FROM users u`,
    `SELECT us.user_id, pg_column_size(us)::bigint AS bytes FROM user_subscriptions us`,
    `SELECT om.user_id, pg_column_size(om)::bigint AS bytes FROM organization_members om`,
    `SELECT dg.user_id, pg_column_size(dg)::bigint AS bytes FROM demo_generators dg`,
    `SELECT ds.user_id, pg_column_size(ds)::bigint AS bytes FROM demo_statistics ds`,
  ]

  if (existingRelations.has('mobile_push_tokens')) {
    accountRows.push(
      `SELECT mpt.user_id, pg_column_size(mpt)::bigint AS bytes FROM mobile_push_tokens mpt`
    )
  }

  const deviceRows = [
    `SELECT d.user_id, pg_column_size(d)::bigint AS bytes FROM devices d`,
    `SELECT d.user_id, pg_column_size(dm)::bigint AS bytes
     FROM device_metrics dm
     JOIN devices d ON d.id = dm.device_id`,
    `SELECT d.user_id, pg_column_size(dml)::bigint AS bytes
     FROM device_metric_latest dml
     JOIN devices d ON d.id = dml.device_id`,
    `SELECT d.user_id, pg_column_size(wvd)::bigint AS bytes
     FROM weather_virtual_devices wvd
     JOIN devices d ON d.id = wvd.device_id`,
  ]

  const telemetryRows = [
    `SELECT d.user_id, pg_column_size(sr)::bigint AS bytes
     FROM sensor_readings sr
     JOIN devices d ON d.id = sr.device_id`,
    `SELECT d.user_id, pg_column_size(dmr)::bigint AS bytes
     FROM device_metric_readings dmr
     JOIN devices d ON d.id = dmr.device_id`,
  ]

  for (const relationName of [
    'device_metric_readings_1m',
    'device_metric_readings_1h',
    'device_metric_readings_1d',
  ]) {
    if (!existingRelations.has(relationName)) continue

    telemetryRows.push(
      `SELECT d.user_id, pg_column_size(aggregate_row)::bigint AS bytes
       FROM ${relationName} aggregate_row
       JOIN devices d ON d.id = aggregate_row.device_id`
    )
  }

  const eventRows = [
    `SELECT ar.user_id, pg_column_size(ar)::bigint AS bytes FROM alarm_rules ar`,
    `SELECT ae.user_id, pg_column_size(ae)::bigint AS bytes FROM alarm_events ae`,
    `SELECT ast.user_id, pg_column_size(ast)::bigint AS bytes FROM alarm_states ast`,
    `SELECT nfd.user_id, pg_column_size(nfd)::bigint AS bytes FROM notification_feed_deletions nfd`,
    `SELECT al.user_id, pg_column_size(al)::bigint AS bytes FROM activity_logs al`,
  ]

  const organizationRows = [
    `SELECT o.owner_user_id AS user_id, pg_column_size(o)::bigint AS bytes
     FROM organizations o
     WHERE o.owner_user_id IS NOT NULL`,
    `SELECT o.owner_user_id AS user_id, pg_column_size(s)::bigint AS bytes
     FROM sites s
     JOIN organizations o ON o.id = s.organization_id
     WHERE o.owner_user_id IS NOT NULL`,
    `SELECT o.owner_user_id AS user_id, pg_column_size(dg)::bigint AS bytes
     FROM device_groups dg
     JOIN organizations o ON o.id = dg.organization_id
     WHERE o.owner_user_id IS NOT NULL`,
    `SELECT o.owner_user_id AS user_id, pg_column_size(oqo)::bigint AS bytes
     FROM organization_quota_overrides oqo
     JOIN organizations o ON o.id = oqo.organization_id
     WHERE o.owner_user_id IS NOT NULL`,
    `SELECT o.owner_user_id AS user_id, pg_column_size(oal)::bigint AS bytes
     FROM organization_audit_logs oal
     JOIN organizations o ON o.id = oal.organization_id
     WHERE o.owner_user_id IS NOT NULL`,
    `SELECT o.owner_user_id AS user_id, pg_column_size(oi)::bigint AS bytes
     FROM organization_invitations oi
     JOIN organizations o ON o.id = oi.organization_id
     WHERE o.owner_user_id IS NOT NULL`,
  ]

  const aggregateCte = (name, rows) => `
    ${name} AS (
      SELECT user_id, COALESCE(SUM(bytes), 0)::bigint AS bytes
      FROM (
        ${rows.join('\n        UNION ALL\n        ')}
      ) usage_rows
      WHERE user_id IS NOT NULL
      GROUP BY user_id
    )`

  return `
    WITH
    ${aggregateCte('account_usage', accountRows)},
    ${aggregateCte('device_usage', deviceRows)},
    ${aggregateCte('telemetry_usage', telemetryRows)},
    ${aggregateCte('event_usage', eventRows)},
    ${aggregateCte('organization_usage', organizationRows)},
    resolved_usage AS (
      SELECT
        u.id AS user_id,
        COALESCE(au.bytes, 0)::bigint AS account_bytes,
        COALESCE(du.bytes, 0)::bigint AS device_bytes,
        COALESCE(tu.bytes, 0)::bigint AS telemetry_bytes,
        COALESCE(eu.bytes, 0)::bigint AS event_bytes,
        COALESCE(ou.bytes, 0)::bigint AS organization_bytes
      FROM users u
      LEFT JOIN account_usage au ON au.user_id = u.id
      LEFT JOIN device_usage du ON du.user_id = u.id
      LEFT JOIN telemetry_usage tu ON tu.user_id = u.id
      LEFT JOIN event_usage eu ON eu.user_id = u.id
      LEFT JOIN organization_usage ou ON ou.user_id = u.id
    )
    INSERT INTO user_database_usage_snapshots (
      user_id,
      account_bytes,
      device_bytes,
      telemetry_bytes,
      event_bytes,
      organization_bytes,
      total_bytes,
      details,
      calculated_at
    )
    SELECT
      user_id,
      account_bytes,
      device_bytes,
      telemetry_bytes,
      event_bytes,
      organization_bytes,
      (
        account_bytes
        + device_bytes
        + telemetry_bytes
        + event_bytes
        + organization_bytes
      )::bigint AS total_bytes,
      jsonb_build_object(
        'measurement', 'logical_row_bytes',
        'includesSharedIndexes', false,
        'optionalRelations', $1::jsonb
      ) AS details,
      NOW() AS calculated_at
    FROM resolved_usage
    ON CONFLICT (user_id)
    DO UPDATE SET
      account_bytes = EXCLUDED.account_bytes,
      device_bytes = EXCLUDED.device_bytes,
      telemetry_bytes = EXCLUDED.telemetry_bytes,
      event_bytes = EXCLUDED.event_bytes,
      organization_bytes = EXCLUDED.organization_bytes,
      total_bytes = EXCLUDED.total_bytes,
      details = EXCLUDED.details,
      calculated_at = EXCLUDED.calculated_at
    RETURNING user_id, total_bytes
  `
}

async function performRefresh({ timeoutMs }) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL statement_timeout = '${Math.max(1000, timeoutMs)}ms'`)

    const lockResult = await client.query(
      'SELECT pg_try_advisory_xact_lock($1) AS acquired',
      [REFRESH_ADVISORY_LOCK_KEY]
    )

    if (!lockResult.rows[0]?.acquired) {
      await client.query('ROLLBACK')
      return { refreshed: false, reason: 'locked' }
    }

    const existingRelations = await getExistingOptionalRelations(client)
    const query = buildUsageQuery(existingRelations)
    const refreshResult = await client.query(query, [
      JSON.stringify([...existingRelations].sort()),
    ])

    await client.query('COMMIT')

    const totalBytes = refreshResult.rows.reduce(
      (sum, row) => sum + Number(row.total_bytes || 0),
      0
    )

    logger.info(
      {
        event: 'admin_user_database_usage_refreshed',
        userCount: refreshResult.rowCount,
        totalBytes,
        optionalRelations: [...existingRelations].sort(),
      },
      'Refreshed per-user database usage snapshots'
    )

    return {
      refreshed: true,
      userCount: refreshResult.rowCount,
      totalBytes,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export function refreshUserDatabaseUsageSnapshots({
  timeoutMs = BACKGROUND_REFRESH_TIMEOUT_MS,
} = {}) {
  if (!activeRefreshPromise) {
    activeRefreshPromise = performRefresh({ timeoutMs }).finally(() => {
      activeRefreshPromise = null
    })
  }

  return activeRefreshPromise
}

export async function ensureUserDatabaseUsageSnapshots() {
  const statusResult = await pool.query(
    `
    SELECT
      COUNT(u.id)::int AS "userCount",
      COUNT(snapshot.user_id)::int AS "snapshotCount",
      MIN(snapshot.calculated_at) AS "oldestCalculatedAt",
      BOOL_AND(
        snapshot.calculated_at >= NOW() - ($1::int * INTERVAL '1 minute')
      ) FILTER (WHERE snapshot.user_id IS NOT NULL) AS "allFresh"
    FROM users u
    LEFT JOIN user_database_usage_snapshots snapshot
      ON snapshot.user_id = u.id
    `,
    [SNAPSHOT_MAX_AGE_MINUTES]
  )

  const status = statusResult.rows[0] || {}
  const userCount = Number(status.userCount || 0)
  const snapshotCount = Number(status.snapshotCount || 0)
  const needsRefresh =
    userCount > 0 &&
    (snapshotCount < userCount || status.allFresh !== true)

  if (!needsRefresh) {
    return { refreshed: false, reason: 'fresh' }
  }

  if (snapshotCount === 0) {
    try {
      return await refreshUserDatabaseUsageSnapshots({
        timeoutMs: INITIAL_REFRESH_TIMEOUT_MS,
      })
    } catch (error) {
      refreshUserDatabaseUsageSnapshots().catch((backgroundError) => {
        logger.warn(
          {
            event: 'admin_user_database_usage_initial_background_refresh_failed',
            err: backgroundError,
          },
          'Initial per-user database usage background refresh failed'
        )
      })

      throw error
    }
  }

  refreshUserDatabaseUsageSnapshots().catch((error) => {
    logger.warn(
      {
        event: 'admin_user_database_usage_background_refresh_failed',
        err: error,
      },
      'Per-user database usage background refresh failed'
    )
  })

  return {
    refreshed: false,
    reason: 'background_refresh_started',
    oldestCalculatedAt: status.oldestCalculatedAt || null,
  }
}
