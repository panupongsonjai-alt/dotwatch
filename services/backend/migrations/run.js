import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const MIGRATION_LOCK_KEY = 1783359069

const { Client } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rawDatabaseUrl = process.env.DATABASE_URL

function maskDatabaseUrl(value) {
  try {
    const url = new URL(value)
    const auth = url.username || url.password ? '***:***@' : ''
    const port = url.port ? `:${url.port}` : ''
    const query = url.search ? '?***' : ''
    return `${url.protocol}//${auth}${url.hostname}${port}${url.pathname}${query}`
  } catch {
    return '***invalid DATABASE_URL***'
  }
}

function looksLikePlaceholder(value) {
  if (!value || !String(value).trim()) return true

  return [
    /วาง/i,
    /ตรงนี้/i,
    /Render External Database URL/i,
    /YOUR_/i,
    /your_/i,
    /REPLACE/i,
    /CHANGE_ME/i,
    /example\.com/i,
    /<[^>]+>/,
    /\{[^}]+\}/,
    /postgres(?:ql)?:\/\/user:password@host/i,
  ].some((pattern) => pattern.test(String(value)))
}

function validateDatabaseUrl(value) {
  if (looksLikePlaceholder(value)) {
    throw new Error(
      'DATABASE_URL still looks like a placeholder. Copy the real Render External Database URL before running migrations.'
    )
  }

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('DATABASE_URL is not a valid absolute PostgreSQL URL.')
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      `DATABASE_URL scheme must be postgres:// or postgresql://, got '${parsed.protocol}'.`
    )
  }

  if (!parsed.hostname) {
    throw new Error('DATABASE_URL host is empty.')
  }

  const placeholderHosts = new Set([
    'base',
    'host',
    'hostname',
    'db-host',
    'your-host',
    'render-host',
  ])

  if (placeholderHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      `DATABASE_URL host '${parsed.hostname}' looks like a placeholder. Use the real Render PostgreSQL host.`
    )
  }

  const databaseName = parsed.pathname.replace(/^\//, '')
  if (!databaseName) {
    throw new Error('DATABASE_URL database name is empty.')
  }

  return { value, parsed, databaseName, masked: maskDatabaseUrl(value) }
}

let databaseUrlInfo
try {
  if (!rawDatabaseUrl) {
    throw new Error('Missing required environment variable: DATABASE_URL')
  }
  databaseUrlInfo = validateDatabaseUrl(rawDatabaseUrl)
} catch (error) {
  console.error(`dotWatch migration blocked: ${error.message}`)
  console.error('Set DATABASE_URL to the real Render External Database URL. Do not paste the placeholder text from the instructions.')
  process.exit(1)
}

const databaseUrl = databaseUrlInfo.value

console.log(`DB URL: ${databaseUrlInfo.masked}`)

const isRenderDb =
  databaseUrl.includes('render.com') || databaseUrl.includes('render.internal')

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback

  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false

  return fallback
}

function getDatabaseSslConfig() {
  if (parseBoolean(process.env.DATABASE_SSL_DISABLED, false)) return false

  const rejectUnauthorized = parseBoolean(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    false
  )

  if (isRenderDb || databaseUrl.includes('sslmode=require')) {
    return { rejectUnauthorized }
  }

  return false
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: getDatabaseSslConfig(),
})

async function run(sql, params = []) {
  await client.query(sql, params)
}


async function runSqlFileIfExists(fileName) {
  const fullPath = path.join(__dirname, fileName)

  if (!fs.existsSync(fullPath)) {
    console.warn(`SKIP optional SQL file: ${fileName} - file not found`)
    return false
  }

  try {
    const sql = fs.readFileSync(fullPath, 'utf8')
    await client.query(sql)
    console.log(`OK SQL file: ${fileName}`)
    return true
  } catch (error) {
    console.error(`FAILED SQL file: ${fileName}`)
    throw error
  }
}

async function runOptional(label, sql) {
  try {
    await client.query(sql)
    console.log(`OK optional: ${label}`)
    return true
  } catch (error) {
    console.warn(`SKIP optional: ${label} - ${error.message}`)
    return false
  }
}

async function acquireMigrationLock() {
  const result = await client.query(
    'SELECT pg_try_advisory_lock($1::integer) AS locked',
    [MIGRATION_LOCK_KEY]
  )

  if (!result.rows[0]?.locked) {
    throw new Error(
      'Another dotWatch migration appears to be running. Stop the duplicate deploy/run and try again.'
    )
  }

  console.log('OK migration lock acquired')
}

async function releaseMigrationLock() {
  try {
    await client.query('SELECT pg_advisory_unlock($1::integer)', [MIGRATION_LOCK_KEY])
  } catch (error) {
    console.warn(`WARN migration lock release failed: ${error.message}`)
  }
}

async function getRelationKind(relationName) {
  const result = await client.query(
    `
    SELECT c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
    LIMIT 1
    `,
    [relationName]
  )

  return result.rows[0]?.relkind || null
}

async function assertSafeDatabaseTarget() {
  const result = await client.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      inet_server_addr()::text AS server_addr,
      version() AS version
  `)

  const row = result.rows[0]
  console.log(
    `DB target: database=${row.database_name}, user=${row.database_user}, server=${row.server_addr || 'local/hidden'}`
  )

  if (!/dotwatch/i.test(row.database_name || '') && process.env.DOTWATCH_ALLOW_NON_DOTWATCH_DB !== '1') {
    throw new Error(
      `Refusing to migrate database '${row.database_name}'. ` +
        'Set DOTWATCH_ALLOW_NON_DOTWATCH_DB=1 only if you are certain this is the correct dotWatch database.'
    )
  }
}

async function getColumnType(tableName, columnName) {
  const result = await client.query(
    `
    SELECT data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    LIMIT 1
    `,
    [tableName, columnName]
  )

  return result.rows[0] || null
}

async function assertCompatibleBaseSchema() {
  const usersId = await getColumnType('users', 'id')
  const devicesId = await getColumnType('devices', 'id')

  if (usersId && !['bigint'].includes(usersId.data_type)) {
    throw new Error(
      `Incompatible legacy schema: users.id is ${usersId.data_type}/${usersId.udt_name}. ` +
        'This backend expects BIGINT ids. Use a fresh Render PostgreSQL database or migrate legacy UUID tables manually.'
    )
  }

  if (devicesId && !['bigint'].includes(devicesId.data_type)) {
    throw new Error(
      `Incompatible legacy schema: devices.id is ${devicesId.data_type}/${devicesId.udt_name}. ` +
        'This backend expects BIGINT ids. Use a fresh Render PostgreSQL database or migrate legacy UUID tables manually.'
    )
  }
}

async function createCoreTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      firebase_uid TEXT UNIQUE NOT NULL,
      email TEXT,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      plan TEXT NOT NULL DEFAULT 'free',
      device_limit INTEGER NOT NULL DEFAULT 3,
      renewal_at TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS display_name TEXT,
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
      ADD COLUMN IF NOT EXISTS device_limit INTEGER NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS renewal_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await run(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL;`)

  await run(`
    CREATE TABLE IF NOT EXISTS device_models (
      id BIGSERIAL PRIMARY KEY,
      model_key TEXT UNIQUE NOT NULL,
      model_name TEXT NOT NULL,
      metric_count INTEGER NOT NULL DEFAULT 2,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS device_model_metrics (
      id BIGSERIAL PRIMARY KEY,
      model_id BIGINT NOT NULL REFERENCES device_models(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      default_name TEXT NOT NULL,
      default_type TEXT DEFAULT 'custom',
      default_unit TEXT DEFAULT '',
      default_icon TEXT DEFAULT 'Activity',
      sort_order INTEGER DEFAULT 0,
      decimal_places SMALLINT NOT NULL DEFAULT 2,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (model_id, metric_key)
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS devices (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      group_name TEXT,
      secret_hash TEXT NOT NULL,
      secret_encrypted TEXT,
      secret_encrypted_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'offline',
      firmware_version TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ,
      last_ingest_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      map_url TEXT,
      model_id BIGINT REFERENCES device_models(id)
    );
  `)

  await run(`
    ALTER TABLE devices
      ADD COLUMN IF NOT EXISTS group_name TEXT,
      ADD COLUMN IF NOT EXISTS secret_encrypted TEXT,
      ADD COLUMN IF NOT EXISTS secret_encrypted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS firmware_version TEXT,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_ingest_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS record_interval_seconds INTEGER NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS last_recorded_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS map_url TEXT,
      ADD COLUMN IF NOT EXISTS model_id BIGINT;
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS sensor_readings (
      time TIMESTAMPTZ NOT NULL,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      temperature DOUBLE PRECISION NOT NULL,
      humidity DOUBLE PRECISION NOT NULL,
      rssi INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS device_metric_readings (
      time TIMESTAMPTZ NOT NULL,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      value DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS device_metrics (
      id BIGSERIAL PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      source_key TEXT,
      metric_name TEXT NOT NULL,
      metric_type TEXT DEFAULT 'custom',
      unit TEXT DEFAULT '',
      icon TEXT DEFAULT 'Activity',
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    ALTER TABLE device_metrics
      ADD COLUMN IF NOT EXISTS source_key TEXT,
      ADD COLUMN IF NOT EXISTS metric_type TEXT DEFAULT 'custom',
      ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'Activity',
      ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS decimal_places SMALLINT NOT NULL DEFAULT 2,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await run(`
    UPDATE devices
    SET record_interval_seconds = 10
    WHERE record_interval_seconds IS NULL
       OR record_interval_seconds NOT IN (10, 30, 60, 300, 600, 1800, 3600);
  `)

  await run(`
    UPDATE device_metrics
    SET decimal_places = 2
    WHERE decimal_places IS NULL
       OR decimal_places < 0
       OR decimal_places > 6;
  `)
}

async function createMetricLatestTable() {
  const relationKind = await getRelationKind('device_metric_latest')

  if (relationKind === 'v') {
    console.warn('WARN device_metric_latest is a VIEW. Dropping it and recreating as TABLE for ingest compatibility.')
    await run('DROP VIEW public.device_metric_latest CASCADE;')
  } else if (relationKind === 'm') {
    console.warn('WARN device_metric_latest is a MATERIALIZED VIEW. Dropping it and recreating as TABLE for ingest compatibility.')
    await run('DROP MATERIALIZED VIEW public.device_metric_latest CASCADE;')
  } else if (relationKind && relationKind !== 'r') {
    throw new Error(`Unsupported public.device_metric_latest relation type: ${relationKind}`)
  }

  await run(`
    CREATE TABLE IF NOT EXISTS device_metric_latest (
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      time TIMESTAMPTZ NOT NULL,
      value DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (device_id, metric_key)
    );
  `)

  await run(`
    CREATE INDEX IF NOT EXISTS idx_device_metric_latest_time
    ON device_metric_latest (time DESC);
  `)

  await run(`
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
    WHERE device_id IS NOT NULL
      AND metric_key IS NOT NULL
      AND time IS NOT NULL
      AND value IS NOT NULL
    ORDER BY device_id, metric_key, time DESC
    ON CONFLICT (device_id, metric_key)
    DO UPDATE SET
      time = EXCLUDED.time,
      value = EXCLUDED.value,
      updated_at = now()
    WHERE EXCLUDED.time >= device_metric_latest.time;
  `)

  await run(`
    WITH legacy_rows AS (
      SELECT device_id, 'metric_1'::text AS metric_key, time, temperature::double precision AS value
      FROM sensor_readings
      WHERE temperature IS NOT NULL
      UNION ALL
      SELECT device_id, 'metric_2'::text AS metric_key, time, humidity::double precision AS value
      FROM sensor_readings
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
    INSERT INTO device_metric_latest (
      device_id,
      metric_key,
      time,
      value,
      updated_at
    )
    SELECT device_id, metric_key, time, value, now()
    FROM latest_rows
    ON CONFLICT (device_id, metric_key)
    DO UPDATE SET
      time = EXCLUDED.time,
      value = EXCLUDED.value,
      updated_at = now()
    WHERE EXCLUDED.time >= device_metric_latest.time;
  `)
}

async function createAlarmAndActivityTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS alarm_rules (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      metric TEXT NOT NULL,
      operator TEXT NOT NULL,
      threshold DOUBLE PRECISION NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    ALTER TABLE alarm_rules
      ADD COLUMN IF NOT EXISTS device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS notification_message TEXT,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `)

  await run(`
    UPDATE alarm_rules
    SET
      is_active = COALESCE(is_active, TRUE),
      created_at = COALESCE(created_at, NOW()),
      updated_at = COALESCE(updated_at, created_at, NOW())
    WHERE is_active IS NULL
       OR created_at IS NULL
       OR updated_at IS NULL;
  `)

  await run(`
    ALTER TABLE alarm_rules
      ALTER COLUMN is_active SET DEFAULT TRUE,
      ALTER COLUMN created_at SET DEFAULT NOW(),
      ALTER COLUMN updated_at SET DEFAULT NOW();
  `)

  await run(`
    UPDATE alarm_rules
    SET operator = '=='
    WHERE operator = '=';
  `)

  await run(`
    UPDATE alarm_rules
    SET severity = LOWER(TRIM(severity))
    WHERE severity IS NOT NULL
      AND severity <> LOWER(TRIM(severity));
  `)

  await run(`
    DELETE FROM alarm_rules
    WHERE device_id IS NULL;
  `)

  await run(`
    ALTER TABLE alarm_rules
      ALTER COLUMN device_id SET NOT NULL;
  `)

  await run(`
    WITH ranked_rules AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, device_id, metric, LOWER(TRIM(severity))
          ORDER BY updated_at DESC NULLS LAST, id DESC
        ) AS duplicate_rank
      FROM alarm_rules
      WHERE device_id IS NOT NULL
    )
    DELETE FROM alarm_rules ar
    USING ranked_rules rr
    WHERE ar.id = rr.id
      AND rr.duplicate_rank > 1;
  `)

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_alarm_rules_user_device_metric_severity
    ON alarm_rules (
      user_id,
      device_id,
      metric,
      (LOWER(TRIM(severity)))
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS alarm_events (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE,
      rule_id BIGINT REFERENCES alarm_rules(id) ON DELETE SET NULL,
      metric TEXT NOT NULL,
      operator TEXT,
      threshold DOUBLE PRECISION,
      value DOUBLE PRECISION,
      severity TEXT NOT NULL DEFAULT 'warning',
      status TEXT NOT NULL DEFAULT 'active',
      notification_message TEXT,
      triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    ALTER TABLE alarm_events
      ADD COLUMN IF NOT EXISTS rule_id BIGINT REFERENCES alarm_rules(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS notification_message TEXT,
      ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS alarm_states (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      metric TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'normal',
      severity TEXT,
      rule_id BIGINT REFERENCES alarm_rules(id) ON DELETE SET NULL,
      operator TEXT,
      threshold DOUBLE PRECISION,
      current_value DOUBLE PRECISION,
      triggered_at TIMESTAMPTZ,
      recovered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (device_id, metric)
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id BIGINT REFERENCES devices(id) ON DELETE SET NULL,
      activity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      severity TEXT NOT NULL DEFAULT 'info',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

async function createOrganizationTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS organizations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS organization_members (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'owner',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, user_id)
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS sites (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT,
      address TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, name)
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS device_groups (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, site_id, name)
    );
  `)

  await run(`
    ALTER TABLE devices
      ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS device_group_id BIGINT REFERENCES device_groups(id) ON DELETE SET NULL;
  `)

  await run(`
    ALTER TABLE alarm_rules
      ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;
  `)

  await run(`
    ALTER TABLE alarm_events
      ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;
  `)

  await run(`
    ALTER TABLE alarm_states
      ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;
  `)
}

async function createDemoTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS demo_generators (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      interval_seconds INTEGER NOT NULL DEFAULT 30,
      generate_alarms BOOLEAN NOT NULL DEFAULT TRUE,
      simulate_offline BOOLEAN NOT NULL DEFAULT TRUE,
      temperature_drift BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS demo_statistics (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      generated_readings BIGINT NOT NULL DEFAULT 0,
      generated_alarms BIGINT NOT NULL DEFAULT 0,
      last_run_at TIMESTAMPTZ
    );
  `)
}

async function createIndexes() {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
    `CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_devices_code ON devices(device_code);`,
    `CREATE INDEX IF NOT EXISTS idx_devices_model ON devices(model_id);`,
    `CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);`,
    `CREATE INDEX IF NOT EXISTS idx_sensor_device_time ON sensor_readings(device_id, time DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_metric_readings_device_time ON device_metric_readings(device_id, time DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_metric_readings_device_metric_time ON device_metric_readings(device_id, metric_key, time DESC);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_device_metrics_unique_key ON device_metrics(device_id, metric_key);`,
    `CREATE INDEX IF NOT EXISTS idx_device_metrics_device_sort ON device_metrics(device_id, sort_order, id);`,
    `CREATE INDEX IF NOT EXISTS idx_alarm_rules_user ON alarm_rules(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_alarm_rules_device ON alarm_rules(device_id);`,
    `CREATE INDEX IF NOT EXISTS idx_alarm_events_user_time ON alarm_events(user_id, triggered_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_alarm_states_user_state ON alarm_states(user_id, state);`,
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_user_time ON activity_logs(user_id, created_at DESC);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug_unique ON organizations(slug) WHERE slug IS NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_sites_organization ON sites(organization_id);`,
    `CREATE INDEX IF NOT EXISTS idx_device_groups_organization ON device_groups(organization_id);`,
  ]

  for (const sql of indexes) {
    await run(sql)
  }
}

function createMetricRows(modelId, count, overrides = {}) {
  const rows = []

  for (let index = 1; index <= count; index += 1) {
    const metricKey = `metric_${index}`
    const override = overrides[metricKey] || {}

    rows.push({
      modelId,
      metricKey,
      defaultName: override.defaultName || `Name-${String(index).padStart(2, '0')}`,
      defaultType: override.defaultType || 'custom',
      defaultUnit: override.defaultUnit || '',
      defaultIcon: override.defaultIcon || 'Activity',
      sortOrder: index - 1,
    })
  }

  return rows
}

async function seedDeviceModels() {
  const models = [
    {
      id: 1,
      modelKey: 'dw_2ch',
      modelName: 'DW2CH',
      metricCount: 2,
      description: 'ESP / 2 Channels เช่น Temperature และ Humidity',
    },
    {
      id: 2,
      modelKey: 'dw_10ch',
      modelName: 'DW10CH',
      metricCount: 10,
      description: 'ESP / 10 Channels สำหรับหลาย Sensor หรือหลาย Channel',
    },
    {
      id: 3,
      modelKey: 'dw_20ch',
      modelName: 'DW20CH',
      metricCount: 20,
      description: 'Raspberry Pi / 20 Channels Gateway',
    },
    {
      id: 4,
      modelKey: 'custom',
      modelName: 'Custom Device',
      metricCount: 0,
      description: 'กำหนด Metric เอง',
    },
    {
      id: 5,
      modelKey: 'esp32_dht3',
      modelName: 'ESP32-DHT3',
      metricCount: 2,
      description: 'ESP32 Wi-Fi model with DHT temperature and humidity',
    },
  ]

  for (const model of models) {
    await run(
      `
      INSERT INTO device_models (
        id,
        model_key,
        model_name,
        metric_count,
        description,
        is_active,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, true, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        model_key = EXCLUDED.model_key,
        model_name = EXCLUDED.model_name,
        metric_count = EXCLUDED.metric_count,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = NOW()
      `,
      [
        model.id,
        model.modelKey,
        model.modelName,
        model.metricCount,
        model.description,
      ]
    )
  }

  await run(`
    SELECT setval(
      pg_get_serial_sequence('device_models', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 1) FROM device_models), 1),
      true
    );
  `)

  const metricRows = [
    ...createMetricRows(1, 2, {
      metric_1: {
        defaultName: 'Temperature',
        defaultType: 'temperature',
        defaultUnit: '°C',
        defaultIcon: 'Thermometer',
      },
      metric_2: {
        defaultName: 'Humidity',
        defaultType: 'humidity',
        defaultUnit: '%',
        defaultIcon: 'Droplets',
      },
    }),
    ...createMetricRows(2, 10),
    ...createMetricRows(3, 20),
    ...createMetricRows(5, 2, {
      metric_1: {
        defaultName: 'Temperature',
        defaultType: 'temperature',
        defaultUnit: '°C',
        defaultIcon: 'Thermometer',
      },
      metric_2: {
        defaultName: 'Humidity',
        defaultType: 'humidity',
        defaultUnit: '%',
        defaultIcon: 'Droplets',
      },
    }),
  ]

  for (const row of metricRows) {
    await run(
      `
      INSERT INTO device_model_metrics (
        model_id,
        metric_key,
        default_name,
        default_type,
        default_unit,
        default_icon,
        sort_order,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (model_id, metric_key)
      DO UPDATE SET
        default_name = EXCLUDED.default_name,
        default_type = EXCLUDED.default_type,
        default_unit = EXCLUDED.default_unit,
        default_icon = EXCLUDED.default_icon,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
      `,
      [
        row.modelId,
        row.metricKey,
        row.defaultName,
        row.defaultType,
        row.defaultUnit,
        row.defaultIcon,
        row.sortOrder,
      ]
    )
  }

  // RSSI remains available as operational connectivity metadata, but it is
  // no longer a configurable/display metric for ESP32-DHT3 devices.
  await run(`
    DELETE FROM alarm_rules ar
    USING devices d, device_models dm
    WHERE ar.device_id = d.id
      AND d.model_id = dm.id
      AND dm.model_key = 'esp32_dht3'
      AND ar.metric IN ('metric_3', 'rssi', 'wifi_rssi');
  `)

  await run(`
    DELETE FROM device_metrics cfg
    USING devices d, device_models dm
    WHERE cfg.device_id = d.id
      AND d.model_id = dm.id
      AND dm.model_key = 'esp32_dht3'
      AND (
        cfg.metric_key = 'metric_3'
        OR lower(COALESCE(cfg.metric_name, '')) LIKE '%rssi%'
        OR (
          lower(COALESCE(cfg.metric_type, '')) = 'signal'
          AND lower(COALESCE(cfg.unit, '')) = 'dbm'
        )
      );
  `)

  await run(`
    DELETE FROM device_model_metrics
    WHERE model_id IN (
      SELECT id
      FROM device_models
      WHERE model_key = 'esp32_dht3'
    )
      AND metric_key = 'metric_3';
  `)

  await run(`
    DELETE FROM device_metric_latest latest
    USING devices d, device_models dm
    WHERE latest.device_id = d.id
      AND d.model_id = dm.id
      AND dm.model_key = 'esp32_dht3'
      AND latest.metric_key IN ('metric_3', 'rssi', 'wifi_rssi');
  `)
}

async function backfillDefaultOrganizations() {
  await run(`
    INSERT INTO organizations (name, slug, owner_user_id)
    SELECT
      'Default Organization - User ' || u.id,
      'default-user-' || u.id,
      u.id
    FROM users u
    WHERE NOT EXISTS (
      SELECT 1
      FROM organizations o
      WHERE o.owner_user_id = u.id
    );
  `)

  await run(`
    INSERT INTO organization_members (organization_id, user_id, role)
    SELECT o.id, o.owner_user_id, 'owner'
    FROM organizations o
    WHERE o.owner_user_id IS NOT NULL
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET
      role = EXCLUDED.role,
      is_active = true,
      updated_at = NOW();
  `)

  await run(`
    INSERT INTO sites (organization_id, name, code)
    SELECT o.id, 'Default Site', 'default'
    FROM organizations o
    ON CONFLICT (organization_id, name) DO NOTHING;
  `)

  await run(`
    INSERT INTO device_groups (organization_id, site_id, name, description)
    SELECT
      s.organization_id,
      s.id,
      'Default Group',
      'Default group for devices'
    FROM sites s
    WHERE s.name = 'Default Site'
    ON CONFLICT (organization_id, site_id, name) DO NOTHING;
  `)

  await run(`
    UPDATE devices d
    SET
      organization_id = o.id,
      site_id = s.id,
      device_group_id = dg.id
    FROM organizations o
    JOIN sites s
      ON s.organization_id = o.id
      AND s.name = 'Default Site'
    JOIN device_groups dg
      ON dg.organization_id = o.id
      AND dg.site_id = s.id
      AND dg.name = 'Default Group'
    WHERE d.user_id = o.owner_user_id
      AND d.organization_id IS NULL;
  `)
}

async function createMetricContinuousAggregatesIfAvailable() {
  await runOptional(
    'device_metric_readings_1m continuous aggregate',
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS device_metric_readings_1m
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 minute', time) AS bucket,
      device_id,
      metric_key,
      AVG(value) AS avg_value,
      MIN(value) AS min_value,
      MAX(value) AS max_value,
      COUNT(*) AS sample_count
    FROM device_metric_readings
    GROUP BY bucket, device_id, metric_key
    WITH NO DATA;
    `
  )

  await runOptional(
    'device_metric_readings_1h continuous aggregate',
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS device_metric_readings_1h
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 hour', time) AS bucket,
      device_id,
      metric_key,
      AVG(value) AS avg_value,
      MIN(value) AS min_value,
      MAX(value) AS max_value,
      COUNT(*) AS sample_count
    FROM device_metric_readings
    GROUP BY bucket, device_id, metric_key
    WITH NO DATA;
    `
  )

  await runOptional(
    'device_metric_readings_1d continuous aggregate',
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS device_metric_readings_1d
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 day', time) AS bucket,
      device_id,
      metric_key,
      AVG(value) AS avg_value,
      MIN(value) AS min_value,
      MAX(value) AS max_value,
      COUNT(*) AS sample_count
    FROM device_metric_readings
    GROUP BY bucket, device_id, metric_key
    WITH NO DATA;
    `
  )

  const aggregateIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1m_lookup ON device_metric_readings_1m (device_id, metric_key, bucket DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1h_lookup ON device_metric_readings_1h (device_id, metric_key, bucket DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_device_metric_readings_1d_lookup ON device_metric_readings_1d (device_id, metric_key, bucket DESC);`,
  ]

  for (const sql of aggregateIndexes) {
    await runOptional('metric aggregate index', sql)
  }

  await runOptional(
    'device_metric_readings_1m refresh policy',
    `
    SELECT remove_continuous_aggregate_policy('device_metric_readings_1m', if_exists => true);
    SELECT add_continuous_aggregate_policy(
      'device_metric_readings_1m',
      start_offset => INTERVAL '7 days',
      end_offset => INTERVAL '1 minute',
      schedule_interval => INTERVAL '1 minute'
    );
    `
  )

  await runOptional(
    'device_metric_readings_1h refresh policy',
    `
    SELECT remove_continuous_aggregate_policy('device_metric_readings_1h', if_exists => true);
    SELECT add_continuous_aggregate_policy(
      'device_metric_readings_1h',
      start_offset => INTERVAL '180 days',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour'
    );
    `
  )

  await runOptional(
    'device_metric_readings_1d refresh policy',
    `
    SELECT remove_continuous_aggregate_policy('device_metric_readings_1d', if_exists => true);
    SELECT add_continuous_aggregate_policy(
      'device_metric_readings_1d',
      start_offset => INTERVAL '2 years',
      end_offset => INTERVAL '1 day',
      schedule_interval => INTERVAL '1 day'
    );
    `
  )
}

async function enableTimescaleIfAvailable() {
  const extensionOk = await runOptional(
    'timescaledb extension',
    `CREATE EXTENSION IF NOT EXISTS timescaledb;`
  )

  if (!extensionOk) return

  await runOptional(
    'sensor_readings hypertable',
    `SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);`
  )

  await runOptional(
    'device_metric_readings hypertable',
    `SELECT create_hypertable('device_metric_readings', 'time', if_not_exists => TRUE);`
  )
}

async function main() {
  await client.connect()

  try {
    await acquireMigrationLock()
    await assertSafeDatabaseTarget()
    await assertCompatibleBaseSchema()
    await createCoreTables()
    await createMetricLatestTable()
    await createAlarmAndActivityTables()
    await createOrganizationTables()
    await runSqlFileIfExists('017_phase5_commercial_foundation.sql')
    await runSqlFileIfExists('019_phase7_multi_tenant_access_control.sql')
    await runSqlFileIfExists('020_phase9f_required_nullability_normalization.sql')
    await createDemoTables()
    await createIndexes()
    await seedDeviceModels()
    await backfillDefaultOrganizations()
    await enableTimescaleIfAvailable()
    await createMetricContinuousAggregatesIfAvailable()

    console.log('dotWatch migration completed')
  } finally {
    await releaseMigrationLock()
    await client.end()
  }
}

main().catch((error) => {
  console.error('dotWatch migration failed:')
  console.error(error)
  process.exit(1)
})
