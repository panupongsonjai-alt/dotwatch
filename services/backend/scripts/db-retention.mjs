#!/usr/bin/env node
// Applies each customer's plan retention (plan_definitions.retention_days,
// overridden by organization_quota_overrides.retention_days_override) to
// stored telemetry. The retention days are shown in Admin/Billing but were
// never enforced, so telemetry and activity logs grew forever.
//
// Usage:
//   node scripts/db-retention.mjs              # dry run: report what would be deleted
//   node scripts/db-retention.mjs --apply      # delete, one device and one day at a time
//
// Options:
//   --min-days=N   never delete data younger than N days (default 30)
//   --limit=N      process at most N devices this run (default: all)
//
// Tables: device_metric_readings, sensor_readings, and activity_logs rows of
// type 'reading.received' (one per device per minute, pure telemetry echo).
// Alarm events and audit logs are not touched.
//
// Deletes run in one-day windows per device so locks stay short. On TimescaleDB,
// deleting from compressed chunks is slow; run during off-peak hours.
// Take a backup first (npm run db:backup).
import 'dotenv/config'
import pg from 'pg'

const args = process.argv.slice(2)
const apply = args.includes('--apply')

function readNumberArg(name, fallback) {
  const raw = args.find((arg) => arg.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

const minDays = Math.max(1, readNumberArg('min-days', 30))
const deviceLimit = readNumberArg('limit', 0)
const databaseUrl = String(process.env.DATABASE_URL || '').trim()

if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const useSsl =
  /render\.com|render\.internal|sslmode=require/i.test(databaseUrl) &&
  String(process.env.DATABASE_SSL_DISABLED || '').toLowerCase() !== 'true'

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: useSsl
    ? {
        rejectUnauthorized:
          String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true',
      }
    : false,
  application_name: 'dotwatch-retention',
})

const TELEMETRY_TABLES = ['device_metric_readings', 'sensor_readings']
const DAY_MS = 24 * 60 * 60 * 1000

async function relationExists(name) {
  const result = await client.query('SELECT to_regclass($1) IS NOT NULL AS ok', [
    `public.${name}`,
  ])
  return Boolean(result.rows[0]?.ok)
}

async function listDeviceRetention() {
  const hasOverrides = await relationExists('organization_quota_overrides')

  const result = await client.query(
    `
    SELECT
      d.id AS device_id,
      d.device_code,
      d.user_id,
      GREATEST(
        $1::int,
        COALESCE(
          ${hasOverrides ? 'oqo.retention_days_override,' : ''}
          pd.retention_days,
          30
        )
      )::int AS retention_days
    FROM devices d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN user_subscriptions us ON us.user_id = u.id
    LEFT JOIN plan_definitions pd
      ON pd.plan_key = COALESCE(us.plan_key, u.plan, 'free')
    ${
      hasOverrides
        ? 'LEFT JOIN organization_quota_overrides oqo ON oqo.organization_id = d.organization_id'
        : ''
    }
    ORDER BY d.id
    ${deviceLimit > 0 ? `LIMIT ${deviceLimit}` : ''}
    `,
    [minDays]
  )

  return result.rows
}

async function oldestRowTime(table, deviceId) {
  const result = await client.query(
    `SELECT MIN(time) AS oldest FROM ${table} WHERE device_id = $1`,
    [deviceId]
  )
  return result.rows[0]?.oldest ? new Date(result.rows[0].oldest) : null
}

async function countOlderThan(table, deviceId, cutoff) {
  const result = await client.query(
    `SELECT COUNT(*)::bigint AS count FROM ${table} WHERE device_id = $1 AND time < $2`,
    [deviceId, cutoff]
  )
  return Number(result.rows[0]?.count || 0)
}

async function deleteOlderThan(table, deviceId, cutoff) {
  const oldest = await oldestRowTime(table, deviceId)
  if (!oldest || oldest >= cutoff) return 0

  let deleted = 0
  let windowStart = oldest

  while (windowStart < cutoff) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + DAY_MS, cutoff.getTime()))
    const result = await client.query(
      `DELETE FROM ${table} WHERE device_id = $1 AND time >= $2 AND time < $3`,
      [deviceId, windowStart, windowEnd]
    )
    deleted += result.rowCount
    windowStart = windowEnd
  }

  return deleted
}

async function main() {
  await client.connect()
  await client.query("SET lock_timeout = '5s'")

  const target = await client.query(
    'SELECT current_database() AS database, current_user AS "user"'
  )
  console.log('Target:', target.rows[0])
  console.log(apply ? 'Mode: APPLY (rows will be deleted)' : 'Mode: dry run')
  console.log(`Minimum retention: ${minDays} days`)

  const tables = []
  for (const table of TELEMETRY_TABLES) {
    if (await relationExists(table)) tables.push(table)
  }
  const hasActivity = await relationExists('activity_logs')

  const devices = await listDeviceRetention()
  const totals = Object.fromEntries(tables.map((table) => [table, 0]))
  let activityTotal = 0

  for (const device of devices) {
    const cutoff = new Date(Date.now() - device.retention_days * DAY_MS)
    const perTable = {}

    for (const table of tables) {
      const count = apply
        ? await deleteOlderThan(table, device.device_id, cutoff)
        : await countOlderThan(table, device.device_id, cutoff)
      perTable[table] = count
      totals[table] += count
    }

    if (hasActivity) {
      const activitySql = apply
        ? `DELETE FROM activity_logs
           WHERE device_id = $1 AND activity_type = 'reading.received' AND created_at < $2`
        : `SELECT COUNT(*)::bigint AS count FROM activity_logs
           WHERE device_id = $1 AND activity_type = 'reading.received' AND created_at < $2`
      const result = await client.query(activitySql, [device.device_id, cutoff])
      const count = apply ? result.rowCount : Number(result.rows[0]?.count || 0)
      perTable.activity_logs = count
      activityTotal += count
    }

    const touched = Object.values(perTable).some((count) => count > 0)
    if (touched) {
      console.log(
        `${device.device_code} (keep ${device.retention_days} days):`,
        perTable
      )
    }
  }

  console.log('\nTotals:', { ...totals, activity_logs_reading_received: activityTotal })
  console.log(`Devices checked: ${devices.length}`)

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to delete. Back up the database first.')
  } else {
    console.log('Done. Run VACUUM (ANALYZE) on the affected tables during off-peak hours.')
  }
}

main()
  .catch((error) => {
    console.error('Retention failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => client.end().catch(() => {}))
