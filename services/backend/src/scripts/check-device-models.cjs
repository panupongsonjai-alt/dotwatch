#!/usr/bin/env node
/* dotWatch - Check active device models */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim()
    if (!raw || raw.startsWith('#') || !raw.includes('=')) continue
    const index = raw.indexOf('=')
    const key = raw.slice(0, index).trim()
    let value = raw.slice(index + 1).trim()
    value = value.replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  loadDotEnv(path.resolve(process.cwd(), '.env'))
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is missing')

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('render.com') || databaseUrl.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  })

  await client.connect()
  try {
    const result = await client.query(
      `SELECT id, model_key, model_name, metric_count, is_active
       FROM device_models
       ORDER BY id`,
    )
    console.table(result.rows)

    const keys = result.rows.map((row) => row.model_key)
    console.log('Contains dw_20ch:', keys.includes('dw_20ch') ? 'YES' : 'NO')
    console.log('Contains esp32_dht3:', keys.includes('esp32_dht3') ? 'YES' : 'NO')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
