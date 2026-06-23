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

  const tables = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name = 'device_metric_readings'
  `)
  console.table(tables.rows)

  await client.end()
}

main().catch(async (error) => {
  console.error(error)
  await client.end()
})