import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Client } = pg
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  return fallback
}

function getSslConfig() {
  if (parseBoolean(process.env.DATABASE_SSL_DISABLED, false)) return false
  if (
    databaseUrl.includes('render.com') ||
    databaseUrl.includes('render.internal') ||
    databaseUrl.includes('sslmode=require')
  ) {
    return {
      rejectUnauthorized: parseBoolean(
        process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
        false
      ),
    }
  }
  return false
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: getSslConfig(),
  statement_timeout: 15000,
  query_timeout: 15000,
  connectionTimeoutMillis: 15000,
})

async function query(label, sql) {
  try {
    const result = await client.query(sql)
    console.log(`\n${label}`)
    console.table(result.rows)
  } catch (error) {
    console.warn(`\n${label}: SKIP - ${error.message}`)
  }
}

async function main() {
  await client.connect()
  try {
    await query('Database', `
      SELECT current_database() AS database, current_user AS user, NOW() AS checked_at
    `)

    await query('Core table counts', `
      SELECT 'users' AS table_name, COUNT(*)::bigint AS rows FROM users
      UNION ALL SELECT 'devices', COUNT(*)::bigint FROM devices
      UNION ALL SELECT 'sensor_readings', COUNT(*)::bigint FROM sensor_readings
      UNION ALL SELECT 'device_metric_readings', COUNT(*)::bigint FROM device_metric_readings
      UNION ALL SELECT 'device_metric_latest', COUNT(*)::bigint FROM device_metric_latest
      ORDER BY table_name
    `)

    await query('Latest device ingest', `
      SELECT
        d.id,
        d.device_code,
        d.name,
        d.status,
        d.last_ingest_at,
        EXTRACT(EPOCH FROM (NOW() - d.last_ingest_at))::int AS seconds_since_ingest
      FROM devices d
      ORDER BY d.last_ingest_at DESC NULLS LAST
      LIMIT 20
    `)

    await query('Metric latest coverage', `
      SELECT
        device_id,
        COUNT(*)::int AS latest_metric_count,
        MAX(time) AS newest_metric_time,
        MIN(time) AS oldest_metric_time
      FROM device_metric_latest
      GROUP BY device_id
      ORDER BY newest_metric_time DESC NULLS LAST
      LIMIT 50
    `)

    await query('Timescale hypertables', `
      SELECT hypertable_name, num_chunks, compression_enabled
      FROM timescaledb_information.hypertables
      WHERE hypertable_schema = 'public'
      ORDER BY hypertable_name
    `)

    await query('Continuous aggregates', `
      SELECT view_name, materialized_only
      FROM timescaledb_information.continuous_aggregates
      WHERE view_schema = 'public'
      ORDER BY view_name
    `)

    await query('Retention/compression jobs', `
      SELECT job_id, proc_name, schedule_interval, hypertable_name
      FROM timescaledb_information.jobs
      WHERE hypertable_schema = 'public'
      ORDER BY job_id
    `)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('DB health check failed:')
  console.error(error)
  process.exit(1)
})
