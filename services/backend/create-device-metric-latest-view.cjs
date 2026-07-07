/*
  dotWatch production DB repair helper
  Creates/updates the device_metric_latest view used by /api/devices.

  Usage from services/backend:
    $env:DATABASE_URL='postgresql://...render.com/dotwatch?sslmode=require'
    node create-device-metric-latest-view.cjs
*/

const pg = require('pg')

const connectionString = process.env.DATABASE_URL

if (!connectionString || connectionString.includes('วาง External')) {
  console.error('DATABASE_URL is not set. Set it to the real Render External Database URL first.')
  process.exit(1)
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`)
  }
  return `"${name}"`
}

async function tableExists(tableName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName],
  )
  return Boolean(result.rows[0]?.exists)
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

function pickColumn(columns, candidates, requiredName) {
  const names = new Set(columns.map((column) => column.column_name))
  for (const candidate of candidates) {
    if (names.has(candidate)) return candidate
  }
  throw new Error(
    `Could not find ${requiredName}. Tried: ${candidates.join(', ')}. Available columns: ${[...names].join(', ')}`,
  )
}

async function createFromDeviceMetricReadings() {
  const columns = await getColumns('device_metric_readings')
  const deviceIdColumn = pickColumn(columns, ['device_id'], 'device id column')
  const timeColumn = pickColumn(columns, ['time', 'timestamp', 'recorded_at', 'created_at'], 'timestamp column')
  const metricKeyColumn = pickColumn(columns, ['metric_key', 'source_key', 'key', 'metric_name', 'name'], 'metric key column')
  const valueColumn = pickColumn(columns, ['value', 'metric_value', 'reading_value', 'number_value', 'numeric_value'], 'metric value column')

  const deviceId = quoteIdent(deviceIdColumn)
  const time = quoteIdent(timeColumn)
  const metricKey = quoteIdent(metricKeyColumn)
  const value = quoteIdent(valueColumn)

  const metricColumns = Array.from({ length: 20 }, (_, index) => {
    const metricName = `metric_${index + 1}`
    return `NULLIF(latest_metrics ->> '${metricName}', '')::double precision AS ${quoteIdent(metricName)}`
  }).join(',\n  ')

  const sql = `
    CREATE OR REPLACE VIEW device_metric_latest AS
    WITH latest_per_metric AS (
      SELECT DISTINCT ON (${deviceId}, ${metricKey})
        ${deviceId} AS device_id,
        ${metricKey}::text AS metric_key,
        ${value} AS metric_value,
        ${time} AS metric_time
      FROM public.device_metric_readings
      WHERE ${deviceId} IS NOT NULL
        AND ${metricKey} IS NOT NULL
        AND ${time} IS NOT NULL
      ORDER BY ${deviceId}, ${metricKey}, ${time} DESC
    ),
    rolled_up AS (
      SELECT
        device_id,
        MAX(metric_time) AS latest_time,
        jsonb_object_agg(metric_key, metric_value ORDER BY metric_key) AS latest_metrics
      FROM latest_per_metric
      GROUP BY device_id
    )
    SELECT
      device_id,
      latest_time,
      latest_metrics,
      ${metricColumns},
      NULLIF(latest_metrics ->> 'temperature', '')::double precision AS temperature,
      NULLIF(latest_metrics ->> 'humidity', '')::double precision AS humidity,
      NULLIF(latest_metrics ->> 'rssi', '')::integer AS rssi
    FROM rolled_up;
  `

  await client.query(sql)
  return { source: 'device_metric_readings', columns: { deviceIdColumn, timeColumn, metricKeyColumn, valueColumn } }
}

async function createFromSensorReadings() {
  const columns = await getColumns('sensor_readings')
  const names = new Set(columns.map((column) => column.column_name))

  const deviceIdColumn = pickColumn(columns, ['device_id'], 'device id column')
  const timeColumn = pickColumn(columns, ['time', 'timestamp', 'recorded_at', 'created_at'], 'timestamp column')

  const deviceId = quoteIdent(deviceIdColumn)
  const time = quoteIdent(timeColumn)
  const hasTemperature = names.has('temperature')
  const hasHumidity = names.has('humidity')
  const hasRssi = names.has('rssi')
  const hasMetrics = names.has('metrics')

  const latestMetricsExpression = hasMetrics
    ? `COALESCE(metrics, jsonb_build_object(
        'metric_1', ${hasTemperature ? 'temperature' : 'NULL'},
        'metric_2', ${hasHumidity ? 'humidity' : 'NULL'},
        'metric_3', ${hasRssi ? 'rssi' : 'NULL'}
      )) AS latest_metrics`
    : `jsonb_build_object(
        'metric_1', ${hasTemperature ? 'temperature' : 'NULL'},
        'metric_2', ${hasHumidity ? 'humidity' : 'NULL'},
        'metric_3', ${hasRssi ? 'rssi' : 'NULL'}
      ) AS latest_metrics`

  const metricColumns = Array.from({ length: 20 }, (_, index) => {
    const metricName = `metric_${index + 1}`
    return `NULLIF(latest_metrics ->> '${metricName}', '')::double precision AS ${quoteIdent(metricName)}`
  }).join(',\n  ')

  const sql = `
    CREATE OR REPLACE VIEW device_metric_latest AS
    WITH latest AS (
      SELECT DISTINCT ON (${deviceId})
        ${deviceId} AS device_id,
        ${time} AS latest_time,
        ${hasTemperature ? 'temperature' : 'NULL::double precision'} AS temperature,
        ${hasHumidity ? 'humidity' : 'NULL::double precision'} AS humidity,
        ${hasRssi ? 'rssi' : 'NULL::integer'} AS rssi,
        ${latestMetricsExpression}
      FROM public.sensor_readings
      WHERE ${deviceId} IS NOT NULL
        AND ${time} IS NOT NULL
      ORDER BY ${deviceId}, ${time} DESC
    )
    SELECT
      device_id,
      latest_time,
      latest_metrics,
      ${metricColumns},
      temperature,
      humidity,
      rssi
    FROM latest;
  `

  await client.query(sql)
  return { source: 'sensor_readings', columns: { deviceIdColumn, timeColumn } }
}

async function main() {
  await client.connect()

  const hasDeviceMetricReadings = await tableExists('device_metric_readings')
  const hasSensorReadings = await tableExists('sensor_readings')

  let result
  if (hasDeviceMetricReadings) {
    result = await createFromDeviceMetricReadings()
  } else if (hasSensorReadings) {
    result = await createFromSensorReadings()
  } else {
    throw new Error('Neither device_metric_readings nor sensor_readings exists in this database.')
  }

  const check = await client.query(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'device_metric_latest'
  `)

  console.log('Created/updated view: device_metric_latest')
  console.log('Source table:', result.source)
  console.log('Detected columns:', result.columns)
  console.log('View check:', check.rows)

  await client.end()
}

main().catch(async (error) => {
  console.error('Failed to create device_metric_latest view:')
  console.error(error)
  try {
    await client.end()
  } catch {}
  process.exit(1)
})
