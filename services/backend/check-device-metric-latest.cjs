const pg = require('pg')

const connectionString = process.env.DATABASE_URL

if (!connectionString || connectionString.includes('วาง External')) {
  console.error('DATABASE_URL is not set to the real database URL')
  process.exit(1)
}

const isRenderDb = connectionString.includes('render.com') || connectionString.includes('render.internal')
const client = new pg.Client({
  connectionString,
  ssl: isRenderDb ? { rejectUnauthorized: false } : false,
})

async function main() {
  await client.connect()

  const relation = await client.query(`
    SELECT
      n.nspname AS schema_name,
      c.relname AS relation_name,
      c.relkind,
      CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        ELSE c.relkind::text
      END AS relation_type
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'device_metric_latest'
    LIMIT 1
  `)

  if (relation.rowCount === 0) {
    throw new Error('public.device_metric_latest does not exist')
  }

  const info = relation.rows[0]
  console.log('Relation:', info)

  if (info.relkind !== 'r') {
    throw new Error('public.device_metric_latest must be a TABLE, not ' + info.relation_type)
  }

  const columns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_metric_latest'
    ORDER BY ordinal_position
  `)

  console.table(columns.rows)

  const required = ['device_id', 'metric_key', 'time', 'value', 'updated_at']
  const names = new Set(columns.rows.map((row) => row.column_name))
  const missing = required.filter((column) => !names.has(column))

  if (missing.length) {
    throw new Error('Missing required columns: ' + missing.join(', '))
  }

  const count = await client.query('SELECT COUNT(*)::integer AS rows FROM public.device_metric_latest')
  console.log('Rows:', count.rows[0].rows)

  await client.end()
}

main().catch(async (error) => {
  console.error(error.message || error)
  try {
    await client.end()
  } catch {}
  process.exit(1)
})
