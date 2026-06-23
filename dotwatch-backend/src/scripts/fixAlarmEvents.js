import 'dotenv/config'
import pg from 'pg'

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
})

async function main() {
  await client.connect()

  const db = await client.query(`
    SELECT current_database(), current_user, inet_server_port()
  `)

  console.table(db.rows)

  await client.query(`
    ALTER TABLE alarm_events
    ADD COLUMN IF NOT EXISTS rule_id BIGINT
  `)

  const columns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'alarm_events'
    ORDER BY ordinal_position
  `)

  console.table(columns.rows)

  await client.end()
}

main().catch(async (error) => {
  console.error(error)
  await client.end().catch(() => {})
  process.exit(1)
})
