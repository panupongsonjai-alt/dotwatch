#!/usr/bin/env node
/* dotWatch - Check active device models and ESP32-DHT3 default metrics */

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
    ssl:
      databaseUrl.includes('render.com') || databaseUrl.includes('sslmode=require')
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

    const metrics = await client.query(
      `SELECT dmm.metric_key, dmm.default_name, dmm.default_type, dmm.default_unit, dmm.sort_order
       FROM device_models dm
       JOIN device_model_metrics dmm ON dmm.model_id = dm.id
       WHERE dm.model_key = 'esp32_dht3'
       ORDER BY dmm.sort_order`,
    )

    console.log('ESP32-DHT3 model metrics:')
    console.table(metrics.rows)

    if (!keys.includes('dw_20ch')) {
      throw new Error('dw_20ch is missing. ESP32 must not replace Raspberry Pi / DW20CH.')
    }

    if (!keys.includes('esp32_dht3')) {
      throw new Error('esp32_dht3 is missing.')
    }

    if (metrics.rowCount !== 3) {
      throw new Error(`esp32_dht3 should have 3 default metrics, found ${metrics.rowCount}`)
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
