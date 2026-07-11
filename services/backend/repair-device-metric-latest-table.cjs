/*
  dotWatch repair script: device_metric_latest TABLE

  Why this exists:
    Current ingest code writes into device_metric_latest using
    INSERT ... ON CONFLICT (device_id, metric_key). Therefore this relation
    must be a normal TABLE with PRIMARY KEY (device_id, metric_key), not a VIEW.

  Usage from services/backend:
    $env:DATABASE_URL='postgresql://...render.com/dotwatch?sslmode=require'
    node .\repair-device-metric-latest-table.cjs
*/

const pg = require('pg')

const connectionString = process.env.DATABASE_URL

if (!connectionString || connectionString.includes('วาง External') || connectionString.includes('ใส่')) {
  console.error('DATABASE_URL is not set to the real database URL.')
  process.exit(1)
}

const isRenderDb = connectionString.includes('render.com') || connectionString.includes('render.internal')
const client = new pg.Client({
  connectionString,
  ssl: isRenderDb ? { rejectUnauthorized: false } : false,
})

const q = (identifier) => '"' + String(identifier).replace(/"/g, '""') + '"'

async function relationInfo(name) {
  const result = await client.query(
    `
      SELECT
        n.nspname AS schema_name,
        c.relname AS relation_name,
        c.relkind,
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized_view'
          WHEN 'p' THEN 'partitioned_table'
          WHEN 'f' THEN 'foreign_table'
          ELSE c.relkind::text
        END AS relation_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = $1
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END, n.nspname
      LIMIT 1
    `,
    [name]
  )

  return result.rows[0] || null
}

async function tableExists(tableName) {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
      LIMIT 1
    `,
    [tableName]
  )

  return result.rowCount > 0
}

async function getColumns(tableName) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  )

  return result.rows.map((row) => row.column_name)
}

async function ensureNoWrongRelation() {
  const existing = await relationInfo('device_metric_latest')
  if (!existing) return

  console.log(`Existing relation: ${existing.schema_name}.${existing.relation_name} (${existing.relation_type})`)

  const fullName = `${q(existing.schema_name)}.${q(existing.relation_name)}`

  if (existing.relkind === 'v') {
    await client.query(`DROP VIEW ${fullName} CASCADE`)
    console.log('Dropped wrong VIEW device_metric_latest')
    return
  }

  if (existing.relkind === 'm') {
    await client.query(`DROP MATERIALIZED VIEW ${fullName} CASCADE`)
    console.log('Dropped wrong MATERIALIZED VIEW device_metric_latest')
    return
  }

  if (existing.relkind !== 'r') {
    throw new Error(`Unsupported device_metric_latest relation type: ${existing.relation_type}`)
  }

  const columns = await getColumns('device_metric_latest')
  const required = ['device_id', 'metric_key', 'time', 'value', 'updated_at']
  const missing = required.filter((column) => !columns.includes(column))

  if (missing.length === 0) {
    console.log('Existing TABLE has required columns.')
    return
  }

  const suffix = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const archiveName = `device_metric_latest_wrong_${suffix}`

  await client.query(`ALTER TABLE ${fullName} RENAME TO ${q(archiveName)}`)
  console.log(`Renamed wrong TABLE to public.${archiveName}`)
}

async function createLatestTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.device_metric_latest (
      device_id BIGINT NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      time TIMESTAMPTZ NOT NULL,
      value DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (device_id, metric_key)
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_device_metric_latest_time
    ON public.device_metric_latest (time DESC)
  `)
}

async function backfillFromMetricReadings() {
  if (!(await tableExists('device_metric_readings'))) return 0

  const result = await client.query(`
    INSERT INTO public.device_metric_latest (
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
      NOW()
    FROM public.device_metric_readings
    WHERE device_id IS NOT NULL
      AND metric_key IS NOT NULL
      AND time IS NOT NULL
      AND value IS NOT NULL
    ORDER BY device_id, metric_key, time DESC
    ON CONFLICT (device_id, metric_key)
    DO UPDATE SET
      time = EXCLUDED.time,
      value = EXCLUDED.value,
      updated_at = NOW()
    WHERE EXCLUDED.time >= public.device_metric_latest.time
  `)

  return result.rowCount || 0
}

async function backfillFromSensorReadings() {
  if (!(await tableExists('sensor_readings'))) return 0

  const result = await client.query(`
    WITH legacy_rows AS (
      SELECT device_id, 'metric_1'::text AS metric_key, time, temperature::double precision AS value
      FROM public.sensor_readings
      WHERE temperature IS NOT NULL
      UNION ALL
      SELECT device_id, 'metric_2'::text AS metric_key, time, humidity::double precision AS value
      FROM public.sensor_readings
      WHERE humidity IS NOT NULL
    ), latest_rows AS (
      SELECT DISTINCT ON (device_id, metric_key)
        device_id,
        metric_key,
        time,
        value
      FROM legacy_rows
      WHERE device_id IS NOT NULL
        AND time IS NOT NULL
        AND value IS NOT NULL
      ORDER BY device_id, metric_key, time DESC
    )
    INSERT INTO public.device_metric_latest (
      device_id,
      metric_key,
      time,
      value,
      updated_at
    )
    SELECT device_id, metric_key, time, value, NOW()
    FROM latest_rows
    ON CONFLICT (device_id, metric_key)
    DO UPDATE SET
      time = EXCLUDED.time,
      value = EXCLUDED.value,
      updated_at = NOW()
    WHERE EXCLUDED.time >= public.device_metric_latest.time
  `)

  return result.rowCount || 0
}

async function verify() {
  const relation = await relationInfo('device_metric_latest')
  const count = await client.query('SELECT COUNT(*)::integer AS count FROM public.device_metric_latest')
  const columns = await getColumns('device_metric_latest')

  console.log('Relation check:', relation)
  console.log('Columns:', columns.join(', '))
  console.log('Rows:', count.rows[0].count)

  if (relation?.relkind !== 'r') {
    throw new Error('device_metric_latest is not a table after repair.')
  }
}

async function main() {
  await client.connect()

  try {
    await client.query('BEGIN')
    await ensureNoWrongRelation()
    await createLatestTable()
    const metricRows = await backfillFromMetricReadings()
    const legacyRows = await backfillFromSensorReadings()
    await client.query('COMMIT')

    console.log('device_metric_latest TABLE is ready.')
    console.log('Backfilled from device_metric_readings:', metricRows)
    console.log('Backfilled from sensor_readings:', legacyRows)

    await verify()
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to repair device_metric_latest TABLE:')
  console.error(error)
  process.exit(1)
})
