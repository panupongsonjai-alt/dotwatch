const pg = require('pg')

const connectionString = process.env.DATABASE_URL

if (!connectionString || connectionString.includes('วาง External')) {
  console.error('DATABASE_URL is not set to the real Render External Database URL')
  process.exit(1)
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()

  const result = await client.query(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_name = 'device_metric_latest'
  `)

  console.log(result.rows)

  await client.end()
}

main().catch(async (error) => {
  console.error(error)
  try {
    await client.end()
  } catch {}
  process.exit(1)
})
