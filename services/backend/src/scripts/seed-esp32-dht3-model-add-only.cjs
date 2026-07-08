#!/usr/bin/env node
/* dotWatch Phase 4A - Add ESP32-DHT3 as an additional model.
 * This script does NOT replace Raspberry Pi / DW20CH.
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const metrics = [
  { metric_key: 'metric_1', default_name: 'Temperature', default_type: 'temperature', default_unit: '°C', default_icon: 'Thermometer', sort_order: 0 },
  { metric_key: 'metric_2', default_name: 'Humidity', default_type: 'humidity', default_unit: '%', default_icon: 'Droplets', sort_order: 1 },
  { metric_key: 'metric_3', default_name: 'WiFi RSSI', default_type: 'signal', default_unit: 'dBm', default_icon: 'Wifi', sort_order: 2 },
]

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim()
    if (!raw || raw.startsWith('#') || !raw.includes('=')) continue
    const index = raw.indexOf('=')
    const key = raw.slice(0, index).trim()
    let value = raw.slice(index + 1).trim()
    value = value.replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  loadDotEnv(path.resolve(process.cwd(), '.env'))
  loadDotEnv(path.resolve(process.cwd(), '..', '..', '.env'))

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
    await client.query('BEGIN')

    const modelResult = await client.query(
      `INSERT INTO device_models (
         id, model_key, model_name, metric_count, description, is_active, updated_at
       )
       VALUES (5, $1, $2, $3, $4, true, NOW())
       ON CONFLICT (model_key)
       DO UPDATE SET
         model_name = EXCLUDED.model_name,
         metric_count = EXCLUDED.metric_count,
         description = EXCLUDED.description,
         is_active = true,
         updated_at = NOW()
       RETURNING id, model_key, model_name, metric_count, is_active`,
      [
        'esp32_dht3',
        'ESP32-DHT3',
        3,
        'ESP32 Wi-Fi model with DHT temperature/humidity and Wi-Fi RSSI',
      ],
    )

    const model = modelResult.rows[0]

    await client.query(
      `SELECT setval(
         pg_get_serial_sequence('device_models', 'id'),
         GREATEST((SELECT COALESCE(MAX(id), 1) FROM device_models), 1),
         true
       )`,
    )

    for (const metric of metrics) {
      await client.query(
        `INSERT INTO device_model_metrics (
           model_id, metric_key, default_name, default_type, default_unit, default_icon, sort_order, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (model_id, metric_key)
         DO UPDATE SET
           default_name = EXCLUDED.default_name,
           default_type = EXCLUDED.default_type,
           default_unit = EXCLUDED.default_unit,
           default_icon = EXCLUDED.default_icon,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        [
          model.id,
          metric.metric_key,
          metric.default_name,
          metric.default_type,
          metric.default_unit,
          metric.default_icon,
          metric.sort_order,
        ],
      )
    }

    await client.query('COMMIT')

    console.log('Added/updated ESP32-DHT3 additional model and default metrics:')
    console.table([model])

    const allModels = await client.query(
      `SELECT id, model_key, model_name, metric_count, is_active
       FROM device_models
       WHERE is_active = true
       ORDER BY id`,
    )
    console.log('Active models after seed:')
    console.table(allModels.rows)

    const metricRows = await client.query(
      `SELECT dmm.metric_key, dmm.default_name, dmm.default_unit, dmm.sort_order
       FROM device_model_metrics dmm
       JOIN device_models dm ON dm.id = dmm.model_id
       WHERE dm.model_key = 'esp32_dht3'
       ORDER BY dmm.sort_order ASC`,
    )
    console.log('ESP32-DHT3 model metrics:')
    console.table(metricRows.rows)
  } catch (error) {
    try { await client.query('ROLLBACK') } catch {}
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
