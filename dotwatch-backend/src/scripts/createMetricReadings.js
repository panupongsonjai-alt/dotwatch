import 'dotenv/config'
import pg from 'pg'

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
})

async function main() {
  await client.connect()

  await client.query(`
    CREATE EXTENSION IF NOT EXISTS timescaledb;

    CREATE TABLE IF NOT EXISTS device_metric_readings (
      time TIMESTAMPTZ NOT NULL,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      value DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    SELECT create_hypertable(
      'device_metric_readings',
      'time',
      if_not_exists => TRUE
    );

    CREATE INDEX IF NOT EXISTS idx_dmr_device_time
    ON device_metric_readings (device_id, time DESC);

    CREATE INDEX IF NOT EXISTS idx_dmr_metric_time
    ON device_metric_readings (metric_key, time DESC);

    CREATE INDEX IF NOT EXISTS idx_dmr_device_metric_time
    ON device_metric_readings (device_id, metric_key, time DESC);
  `)

  const result = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'device_metric_readings'
    ORDER BY ordinal_position;
  `)

  console.table(result.rows)

  await client.end()
}

main().catch(async (error) => {
  console.error(error)
  await client.end()
  process.exit(1)
})
