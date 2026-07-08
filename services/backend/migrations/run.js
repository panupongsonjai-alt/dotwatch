import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Client } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('Missing required environment variable: DATABASE_URL')
  process.exit(1)
}

const isRenderDb =
  databaseUrl.includes('render.com') || databaseUrl.includes('render.internal')

const client = new Client({
  connectionString: databaseUrl,
  ssl: isRenderDb
    ? {
        rejectUnauthorized: false,
      }
    : false,
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
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)
}

async function createMetricLatestTable() {
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
    ORDER BY device_id, metric_key, time DESC
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
      device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE,
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
      triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await run(`
    ALTER TABLE alarm_events
      ADD COLUMN IF NOT EXISTS rule_id BIGINT REFERENCES alarm_rules(id) ON DELETE SET NULL,
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
      metricCount: 3,
      description: 'ESP32 Wi-Fi model with DHT temperature/humidity and Wi-Fi RSSI',
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
    ...createMetricRows(5, 3, {
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
      metric_3: {
        defaultName: 'WiFi RSSI',
        defaultType: 'signal',
        defaultUnit: 'dBm',
        defaultIcon: 'Wifi',
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
    await assertCompatibleBaseSchema()
    await createCoreTables()
    await createMetricLatestTable()
    await createAlarmAndActivityTables()
    await createOrganizationTables()
    await runSqlFileIfExists('017_phase5_commercial_foundation.sql')
    await createDemoTables()
    await createIndexes()
    await seedDeviceModels()
    await backfillDefaultOrganizations()
    await enableTimescaleIfAvailable()
    await createMetricContinuousAggregatesIfAvailable()

    console.log('dotWatch migration completed')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('dotWatch migration failed:')
  console.error(error)
  process.exit(1)
})
