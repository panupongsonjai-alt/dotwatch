import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Client } = pg

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('BLOCK: Missing DATABASE_URL')
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

  const rejectUnauthorized = parseBoolean(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    false
  )

  if (
    databaseUrl.includes('render.com') ||
    databaseUrl.includes('render.internal') ||
    databaseUrl.includes('sslmode=require')
  ) {
    return { rejectUnauthorized }
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

const issues = []

function add(level, area, message) {
  issues.push({ level, area, message })
}

async function exists(sql, params = []) {
  const result = await client.query(sql, params)
  return Boolean(result.rows[0]?.exists)
}

async function getOne(sql, params = []) {
  const result = await client.query(sql, params)
  return result.rows[0] || null
}

async function checkTarget() {
  const row = await getOne(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      inet_server_addr()::text AS server_addr,
      inet_server_port() AS server_port,
      version() AS version
  `)

  console.log('Database target')
  console.log(`- database : ${row.database_name}`)
  console.log(`- user     : ${row.database_user}`)
  console.log(`- server   : ${row.server_addr || 'local/hidden'}:${row.server_port || ''}`)
  console.log(`- version  : ${row.version}`)

  if (!/dotwatch/i.test(row.database_name || '') && process.env.DOTWATCH_ALLOW_NON_DOTWATCH_DB !== '1') {
    add(
      'BLOCK',
      'Target',
      `Database name '${row.database_name}' does not look like dotWatch. Set DOTWATCH_ALLOW_NON_DOTWATCH_DB=1 only if intentional.`
    )
  }
}

async function checkExtensions() {
  const timescale = await exists(
    `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') AS exists`
  )

  if (timescale) {
    console.log('OK extension: timescaledb installed')
  } else {
    add('WARN', 'TimescaleDB', 'timescaledb extension is not installed or not available. Raw tables can work, but hypertables/continuous aggregates will be skipped.')
  }
}

async function checkCoreTables() {
  const requiredTables = [
    'users',
    'devices',
    'device_models',
    'device_model_metrics',
    'sensor_readings',
    'device_metric_readings',
    'device_metric_latest',
  ]

  for (const table of requiredTables) {
    const ok = await exists(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
      `,
      [table]
    )

    if (!ok) add('BLOCK', 'Tables', `Missing public.${table}`)
  }
}

async function checkRelationKinds() {
  const row = await getOne(
    `
    SELECT c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'device_metric_latest'
    LIMIT 1
    `
  )

  if (!row) {
    add('BLOCK', 'device_metric_latest', 'Missing relation public.device_metric_latest')
    return
  }

  if (row.relkind !== 'r') {
    add(
      'BLOCK',
      'device_metric_latest',
      `public.device_metric_latest must be a TABLE (relkind r), but current relkind is '${row.relkind}'`
    )
  } else {
    console.log('OK relation: device_metric_latest is a table')
  }
}

async function checkColumns() {
  const requiredColumns = [
    ['devices', 'id', 'bigint'],
    ['devices', 'device_code', 'text'],
    ['devices', 'secret_hash', 'text'],
    ['devices', 'secret_encrypted', 'text'],
    ['devices', 'model_id', 'bigint'],
    ['device_metric_readings', 'time', 'timestamp with time zone'],
    ['device_metric_readings', 'device_id', 'bigint'],
    ['device_metric_readings', 'metric_key', 'text'],
    ['device_metric_readings', 'value', 'double precision'],
    ['device_metric_latest', 'device_id', 'bigint'],
    ['device_metric_latest', 'metric_key', 'text'],
    ['device_metric_latest', 'time', 'timestamp with time zone'],
    ['device_metric_latest', 'value', 'double precision'],
  ]

  for (const [table, column, expected] of requiredColumns) {
    const row = await getOne(
      `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
      `,
      [table, column]
    )

    if (!row) {
      add('BLOCK', 'Columns', `Missing public.${table}.${column}`)
    } else if (row.data_type !== expected) {
      add('WARN', 'Columns', `public.${table}.${column} is ${row.data_type}; expected ${expected}`)
    }
  }
}

async function checkIndexes() {
  const requiredIndexes = [
    'devices_device_code_key',
    'device_metric_latest_pkey',
    'idx_device_metric_latest_time',
  ]

  for (const index of requiredIndexes) {
    const ok = await exists(
      `
      SELECT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = $1
      ) AS exists
      `,
      [index]
    )

    if (!ok) add('WARN', 'Indexes', `Missing index/constraint: ${index}`)
  }
}

async function checkDataHealth() {
  const latest = await getOne(`SELECT COUNT(*)::int AS count FROM device_metric_latest`)
  const readings = await getOne(`SELECT COUNT(*)::int AS count FROM device_metric_readings`)
  const devices = await getOne(`SELECT COUNT(*)::int AS count FROM devices`)
  const nullSecrets = await getOne(`SELECT COUNT(*)::int AS count FROM devices WHERE secret_hash IS NULL OR secret_hash = ''`)
  const orphanMetricReadings = await getOne(`
    SELECT COUNT(*)::int AS count
    FROM device_metric_readings r
    LEFT JOIN devices d ON d.id = r.device_id
    WHERE d.id IS NULL
  `)

  console.log('Data snapshot')
  console.log(`- devices                : ${devices.count}`)
  console.log(`- metric readings         : ${readings.count}`)
  console.log(`- metric latest rows      : ${latest.count}`)

  if (nullSecrets.count > 0) add('BLOCK', 'Data', `${nullSecrets.count} device(s) have missing secret_hash`)
  if (orphanMetricReadings.count > 0) add('BLOCK', 'Data', `${orphanMetricReadings.count} orphan device_metric_readings row(s) found`)
}

async function checkHypertables() {
  const hasTimescale = await exists(
    `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') AS exists`
  )
  if (!hasTimescale) return

  const hypertables = await client.query(`
    SELECT hypertable_name
    FROM timescaledb_information.hypertables
    WHERE hypertable_schema = 'public'
      AND hypertable_name IN ('sensor_readings', 'device_metric_readings')
    ORDER BY hypertable_name
  `)
  const names = new Set(hypertables.rows.map((row) => row.hypertable_name))

  for (const name of ['sensor_readings', 'device_metric_readings']) {
    if (!names.has(name)) add('WARN', 'TimescaleDB', `public.${name} is not a hypertable`)
  }
}

async function main() {
  await client.connect()

  try {
    await checkTarget()
    await checkExtensions()
    await checkCoreTables()
    await checkRelationKinds()
    await checkColumns()
    await checkIndexes()
    await checkHypertables()
    await checkDataHealth()
  } finally {
    await client.end()
  }

  if (issues.length === 0) {
    console.log('\nDatabase preflight: OK')
    return
  }

  console.log('\nDatabase preflight issues')
  console.table(issues)

  const blocking = issues.filter((issue) => issue.level === 'BLOCK')
  if (blocking.length > 0) {
    console.error(`Database preflight: FAILED (${blocking.length} blocking issue(s))`)
    process.exit(1)
  }

  console.warn('Database preflight: OK with warnings')
}

main().catch((error) => {
  console.error('Database preflight failed:')
  console.error(error)
  process.exit(1)
})
