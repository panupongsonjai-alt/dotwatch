#!/usr/bin/env node
/* dotWatch Phase 4A - Add ESP32-DHT3 as an additional model
 *
 * This script only inserts/updates device_models.model_key = 'esp32_dht3'
 * and its default model metrics.
 *
 * It does NOT delete, deactivate, or replace Raspberry Pi / DW20CH.
 *
 * Usage:
 *   cd services/backend
 *   node src/scripts/seed-esp32-dht3-model-add-only.cjs
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ESP32_MODEL = {
  modelKey: 'esp32_dht3',
  modelName: 'ESP32-DHT3',
  metricCount: 3,
  description:
    'Additional ESP32 Wi-Fi model with DHT temperature/humidity and Wi-Fi RSSI. Metrics: metric_1 temperature, metric_2 humidity, metric_3 rssi.',
}

const ESP32_METRICS = [
  {
    metricKey: 'metric_1',
    defaultName: 'Temperature',
    defaultType: 'temperature',
    defaultUnit: '°C',
    defaultIcon: 'Thermometer',
    sortOrder: 1,
  },
  {
    metricKey: 'metric_2',
    defaultName: 'Humidity',
    defaultType: 'humidity',
    defaultUnit: '%',
    defaultIcon: 'Droplets',
    sortOrder: 2,
  },
  {
    metricKey: 'metric_3',
    defaultName: 'WiFi RSSI',
    defaultType: 'signal',
    defaultUnit: 'dBm',
    defaultIcon: 'Wifi',
    sortOrder: 3,
  },
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
    value = value.replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  loadDotEnv(path.resolve(process.cwd(), '.env'))
  loadDotEnv(path.resolve(process.cwd(), '..', '..', '.env'))

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing. Set it in services/backend/.env or PowerShell env.')
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('render.com') || databaseUrl.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : undefined,
  })

  await client.connect()

  try {
    await client.query('BEGIN')

    const result = await client.query(
      `INSERT INTO device_models (
         model_key,
         model_name,
         metric_count,
         description,
         is_active,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       ON CONFLICT (model_key)
       DO UPDATE SET
         model_name = EXCLUDED.model_name,
         metric_count = EXCLUDED.metric_count,
         description = EXCLUDED.description,
         is_active = true,
         updated_at = NOW()
       RETURNING id, model_key, model_name, metric_count, is_active`,
      [
        ESP32_MODEL.modelKey,
        ESP32_MODEL.modelName,
        ESP32_MODEL.metricCount,
        ESP32_MODEL.description,
      ],
    )

    const modelId = result.rows[0].id

    for (const metric of ESP32_METRICS) {
      await client.query(
        `INSERT INTO device_model_metrics (
           model_id,
           metric_key,
           default_name,
           default_type,
           default_unit,
           default_icon,
           sort_order,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (model_id, metric_key)
         DO UPDATE SET
           default_name = EXCLUDED.default_name,
           default_type = EXCLUDED.default_type,
           default_unit = EXCLUDED.default_unit,
           default_icon = EXCLUDED.default_icon,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        [
          modelId,
          metric.metricKey,
          metric.defaultName,
          metric.defaultType,
          metric.defaultUnit,
          metric.defaultIcon,
          metric.sortOrder,
        ],
      )
    }

    await client.query('COMMIT')

    console.log('Added/updated additional model only:')
    console.table(result.rows)

    const modelMetrics = await client.query(
      `SELECT dmm.metric_key, dmm.default_name, dmm.default_type, dmm.default_unit, dmm.sort_order
       FROM device_models dm
       JOIN device_model_metrics dmm ON dmm.model_id = dm.id
       WHERE dm.model_key = $1
       ORDER BY dmm.sort_order`,
      [ESP32_MODEL.modelKey],
    )

    console.log('ESP32-DHT3 default model metrics:')
    console.table(modelMetrics.rows)

    const allModels = await client.query(
      `SELECT id, model_key, model_name, metric_count, is_active
       FROM device_models
       WHERE is_active = true
       ORDER BY id`,
    )

    console.log('Active models after seed. Raspberry Pi / DW20CH should still be present:')
    console.table(allModels.rows)
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
