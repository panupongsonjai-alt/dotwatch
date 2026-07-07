import pg from 'pg'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })
dotenv.config()

const { Client } = pg

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('Missing DATABASE_URL. Set it in services/backend/.env or the current shell.')
  process.exit(1)
}

const isRenderDb =
  databaseUrl.includes('render.com') || databaseUrl.includes('render.internal')

const client = new Client({
  connectionString: databaseUrl,
  ssl: isRenderDb ? { rejectUnauthorized: false } : false,
})

async function queryOne(label, sql, params = []) {
  try {
    const result = await client.query(sql, params)
    return { label, ok: true, rows: result.rows }
  } catch (error) {
    return { label, ok: false, error: error.message, rows: [] }
  }
}

function printRows(title, rows = []) {
  console.log(`\n## ${title}`)

  if (!rows.length) {
    console.log('(no rows)')
    return
  }

  console.table(rows)
}

function printResult(result) {
  if (!result.ok) {
    console.log(`\n## ${result.label}`)
    console.log(`SKIPPED: ${result.error}`)
    return
  }

  printRows(result.label, result.rows)
}

await client.connect()

try {
  const checks = []

  checks.push(
    await queryOne(
      'Table row estimates',
      `
      SELECT
        c.relname AS table_name,
        c.reltuples::bigint AS estimated_rows,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'devices',
          'device_metric_readings',
          'device_metric_latest',
          'activity_logs',
          'alarm_events'
        )
      ORDER BY pg_total_relation_size(c.oid) DESC;
      `
    )
  )

  checks.push(
    await queryOne(
      'Latest metric coverage',
      `
      SELECT
        COUNT(*)::bigint AS latest_rows,
        COUNT(DISTINCT device_id)::bigint AS devices_with_latest,
        MAX(time) AS newest_metric_time,
        MIN(time) AS oldest_metric_time
      FROM device_metric_latest;
      `
    )
  )

  checks.push(
    await queryOne(
      'Recent ingest volume',
      `
      SELECT
        COUNT(*) FILTER (WHERE time > now() - INTERVAL '1 hour')::bigint AS rows_1h,
        COUNT(*) FILTER (WHERE time > now() - INTERVAL '24 hours')::bigint AS rows_24h,
        COUNT(DISTINCT device_id) FILTER (WHERE time > now() - INTERVAL '24 hours')::bigint AS active_devices_24h,
        COUNT(DISTINCT metric_key) FILTER (WHERE time > now() - INTERVAL '24 hours')::bigint AS active_metrics_24h
      FROM device_metric_readings;
      `
    )
  )

  checks.push(
    await queryOne(
      'Continuous aggregates',
      `
      SELECT
        view_name,
        materialized_only
      FROM timescaledb_information.continuous_aggregates
      WHERE view_name IN (
        'device_metric_readings_1m',
        'device_metric_readings_1h',
        'device_metric_readings_1d'
      )
      ORDER BY view_name;
      `
    )
  )

  checks.push(
    await queryOne(
      'Timescale jobs',
      `
      SELECT
        hypertable_name,
        proc_name,
        schedule_interval,
        config
      FROM timescaledb_information.jobs
      WHERE hypertable_name = 'device_metric_readings'
         OR hypertable_name LIKE 'device_metric_readings_%'
      ORDER BY hypertable_name, proc_name;
      `
    )
  )

  checks.push(
    await queryOne(
      'Largest chunks',
      `
      SELECT
        chunk_schema,
        chunk_name,
        pg_size_pretty(total_bytes) AS total_size,
        pg_size_pretty(index_bytes) AS index_size
      FROM chunks_detailed_size('device_metric_readings')
      ORDER BY total_bytes DESC
      LIMIT 10;
      `
    )
  )

  for (const check of checks) {
    printResult(check)
  }

  console.log('\nPhase 4 performance report completed.')
} finally {
  await client.end()
}
