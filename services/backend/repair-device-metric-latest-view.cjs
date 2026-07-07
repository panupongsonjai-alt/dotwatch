/*
  dotWatch repair script: device_metric_latest

  Usage (PowerShell):
    cd "D:\\IoT Project\\dotwatch\\services\\backend"
    $env:DATABASE_URL='postgresql://...render.com/dotwatch?sslmode=require'
    node .\\repair-device-metric-latest-view.cjs

  This script repairs a wrong relation named device_metric_latest by dropping it
  only after identifying its relation type, then recreates it as a normal VIEW.
*/

const pg = require('pg')

const connectionString = process.env.DATABASE_URL

if (!connectionString || connectionString.includes('วาง External') || connectionString.includes('ใส่')) {
  console.error('DATABASE_URL is not set to the real Render External Database URL.')
  process.exit(1)
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
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
    [name],
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
    [tableName],
  )
  return result.rowCount > 0
}

async function getColumns(tableName) {
  const result = await client.query(
    `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  )
  return result.rows
}

function pickColumn(columns, candidates) {
  const names = new Set(columns.map((c) => c.column_name))
  return candidates.find((name) => names.has(name)) || null
}

async function dropExistingDeviceMetricLatest() {
  const existing = await relationInfo('device_metric_latest')

  if (!existing) {
    console.log('Existing relation: device_metric_latest not found')
    return
  }

  console.log(`Existing relation: ${existing.schema_name}.${existing.relation_name} (${existing.relation_type})`)

  const fullName = `${q(existing.schema_name)}.${q(existing.relation_name)}`

  if (existing.relkind === 'v') {
    await client.query(`DROP VIEW ${fullName} CASCADE`)
    console.log('Dropped existing view: device_metric_latest')
    return
  }

  if (existing.relkind === 'm') {
    await client.query(`DROP MATERIALIZED VIEW ${fullName} CASCADE`)
    console.log('Dropped existing materialized view: device_metric_latest')
    return
  }

  if (existing.relkind === 'r' || existing.relkind === 'p') {
    await client.query(`DROP TABLE ${fullName} CASCADE`)
    console.log('Dropped existing table/partitioned table: device_metric_latest')
    return
  }

  if (existing.relkind === 'f') {
    await client.query(`DROP FOREIGN TABLE ${fullName} CASCADE`)
    console.log('Dropped existing foreign table: device_metric_latest')
    return
  }

  throw new Error(`Unsupported existing relation type for device_metric_latest: ${existing.relkind}`)
}

async function createFromDeviceMetricReadings() {
  const columns = await getColumns('device_metric_readings')
  const timeColumn = pickColumn(columns, ['time', 'timestamp', 'recorded_at', 'created_at'])
  const deviceIdColumn = pickColumn(columns, ['device_id'])
  const metricKeyColumn = pickColumn(columns, ['metric_key', 'source_key', 'key', 'metric'])
  const valueColumn = pickColumn(columns, ['metric_value', 'value', 'value_number', 'number_value', 'reading_value'])

  if (!timeColumn || !deviceIdColumn || !metricKeyColumn || !valueColumn) {
    console.log('device_metric_readings columns:', columns.map((c) => c.column_name).join(', '))
    throw new Error('device_metric_readings exists, but required columns could not be detected.')
  }

  console.log('Creating device_metric_latest from device_metric_readings')
  console.log(`Using columns: device=${deviceIdColumn}, time=${timeColumn}, key=${metricKeyColumn}, value=${valueColumn}`)

  await client.query(`
    CREATE VIEW public.device_metric_latest AS
    WITH latest_per_metric AS (
      SELECT DISTINCT ON (${q(deviceIdColumn)}, ${q(metricKeyColumn)})
        ${q(deviceIdColumn)} AS device_id,
        ${q(timeColumn)} AS latest_time,
        ${q(metricKeyColumn)}::text AS metric_key,
        ${q(valueColumn)}::double precision AS metric_value
      FROM public.device_metric_readings
      ORDER BY ${q(deviceIdColumn)}, ${q(metricKeyColumn)}, ${q(timeColumn)} DESC
    ), aggregated AS (
      SELECT
        device_id,
        MAX(latest_time) AS latest_time,
        JSONB_OBJECT_AGG(metric_key, metric_value ORDER BY metric_key) AS latest_metrics,
        MAX(metric_value) FILTER (WHERE metric_key IN ('temperature', 'temp', 'metric_1')) AS temperature,
        MAX(metric_value) FILTER (WHERE metric_key IN ('humidity', 'hum', 'metric_2')) AS humidity,
        MAX(metric_value) FILTER (WHERE metric_key IN ('rssi', 'metric_3')) AS rssi
      FROM latest_per_metric
      GROUP BY device_id
    )
    SELECT
      device_id,
      latest_time,
      temperature,
      humidity,
      CASE
        WHEN rssi IS NULL THEN NULL
        ELSE rssi::integer
      END AS rssi,
      COALESCE(latest_metrics, '{}'::jsonb) AS latest_metrics
    FROM aggregated
  `)

  return 'device_metric_readings'
}

async function createFromSensorReadings() {
  const columns = await getColumns('sensor_readings')
  const timeColumn = pickColumn(columns, ['time', 'timestamp', 'recorded_at', 'created_at'])
  const deviceIdColumn = pickColumn(columns, ['device_id'])
  const temperatureColumn = pickColumn(columns, ['temperature', 'temp'])
  const humidityColumn = pickColumn(columns, ['humidity', 'hum'])
  const rssiColumn = pickColumn(columns, ['rssi'])
  const metricsColumn = pickColumn(columns, ['metrics', 'latest_metrics'])

  if (!timeColumn || !deviceIdColumn) {
    console.log('sensor_readings columns:', columns.map((c) => c.column_name).join(', '))
    throw new Error('sensor_readings exists, but required device_id/time columns could not be detected.')
  }

  console.log('Creating device_metric_latest from sensor_readings')
  console.log(`Using columns: device=${deviceIdColumn}, time=${timeColumn}`)

  const temperatureExpression = temperatureColumn ? q(temperatureColumn) : 'NULL::double precision'
  const humidityExpression = humidityColumn ? q(humidityColumn) : 'NULL::double precision'
  const rssiExpression = rssiColumn ? q(rssiColumn) : 'NULL::integer'
  const metricsExpression = metricsColumn
    ? `COALESCE(${q(metricsColumn)}, jsonb_build_object('metric_1', ${temperatureExpression}, 'metric_2', ${humidityExpression}, 'metric_3', ${rssiExpression}))`
    : `jsonb_build_object('metric_1', ${temperatureExpression}, 'metric_2', ${humidityExpression}, 'metric_3', ${rssiExpression})`

  await client.query(`
    CREATE VIEW public.device_metric_latest AS
    WITH latest AS (
      SELECT DISTINCT ON (${q(deviceIdColumn)})
        ${q(deviceIdColumn)} AS device_id,
        ${q(timeColumn)} AS latest_time,
        ${temperatureExpression} AS temperature,
        ${humidityExpression} AS humidity,
        ${rssiExpression} AS rssi,
        ${metricsExpression} AS latest_metrics
      FROM public.sensor_readings
      ORDER BY ${q(deviceIdColumn)}, ${q(timeColumn)} DESC
    )
    SELECT
      device_id,
      latest_time,
      temperature,
      humidity,
      rssi,
      COALESCE(latest_metrics, '{}'::jsonb) AS latest_metrics
    FROM latest
  `)

  return 'sensor_readings'
}

async function verifyView() {
  const viewResult = await client.query(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'device_metric_latest'
  `)

  const sampleResult = await client.query(`
    SELECT *
    FROM public.device_metric_latest
    LIMIT 3
  `)

  console.log('View check:', viewResult.rows)
  console.log('Sample rows:', sampleResult.rows)
}

async function main() {
  await client.connect()

  try {
    await client.query('BEGIN')

    await dropExistingDeviceMetricLatest()

    let source = null
    if (await tableExists('device_metric_readings')) {
      source = await createFromDeviceMetricReadings()
    } else if (await tableExists('sensor_readings')) {
      source = await createFromSensorReadings()
    } else {
      throw new Error('Neither device_metric_readings nor sensor_readings exists.')
    }

    await client.query('COMMIT')

    console.log(`Created view: public.device_metric_latest`)
    console.log(`Source table: ${source}`)

    await verifyView()
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to repair device_metric_latest:')
  console.error(error)
  process.exit(1)
})
