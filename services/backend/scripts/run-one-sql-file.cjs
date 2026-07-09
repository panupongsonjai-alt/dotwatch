const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  const sqlFile = process.argv[2]

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  if (!sqlFile) {
    throw new Error('SQL file path is required')
  }

  const absoluteSqlFile = path.resolve(process.cwd(), sqlFile)

  if (!fs.existsSync(absoluteSqlFile)) {
    throw new Error(`SQL file not found: ${absoluteSqlFile}`)
  }

  const isRender = /render\.com/i.test(databaseUrl) || /sslmode=require/i.test(databaseUrl)

  const client = new Client({
    connectionString: databaseUrl,
    ssl: isRender ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()

  const target = await client.query(`
    SELECT
      current_database() AS database,
      current_user AS "user",
      inet_server_addr()::text AS server_addr,
      version() AS version
  `)

  console.log('Target:', target.rows[0])
  console.log('SQL file:', absoluteSqlFile)

  const sql = fs.readFileSync(absoluteSqlFile, 'utf8')
  await client.query(sql)

  console.log('SQL completed OK')

  await client.end()
}

main().catch((error) => {
  console.error('SQL failed:')
  console.error(error.message)
  process.exit(1)
})
