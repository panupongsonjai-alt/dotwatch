import 'dotenv/config'
import pg from 'pg'

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
})

async function main() {
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS device_metrics (
      id BIGSERIAL PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      source_key TEXT,
      metric_name TEXT NOT NULL,
      metric_type TEXT DEFAULT 'custom',
      unit TEXT DEFAULT '',
      icon TEXT DEFAULT 'Activity',
      visible BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (device_id, metric_key)
    );
  `)

  const result = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name = 'device_metrics';
  `)

  console.table(result.rows)

  await client.end()
}

main().catch(async (error) => {
  console.error(error)
  await client.end()
  process.exit(1)
})
