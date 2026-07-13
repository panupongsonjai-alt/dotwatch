import { pool } from '../db/pool.js'

const SETTINGS_SCHEMA_LOCK_KEY = 17833712

let settingsSchemaPromise = null

/**
 * Keeps the API compatible when the backend deploy becomes live a few seconds
 * before the database migration has added the latest metric settings columns.
 *
 * The migration remains the source of truth. This guard only adds the small,
 * backwards-compatible columns required by normal API reads and writes.
 */
export async function ensureDeviceMetricSettingsSchema() {
  if (settingsSchemaPromise) return settingsSchemaPromise

  settingsSchemaPromise = (async () => {
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [
        SETTINGS_SCHEMA_LOCK_KEY,
      ])

      await client.query(`
        ALTER TABLE devices
          ADD COLUMN IF NOT EXISTS record_interval_seconds INTEGER,
          ADD COLUMN IF NOT EXISTS last_recorded_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS last_ip_address TEXT,
          ADD COLUMN IF NOT EXISTS last_wifi_ssid TEXT
      `)

      await client.query(`
        UPDATE devices
        SET record_interval_seconds = 10
        WHERE record_interval_seconds IS NULL
           OR record_interval_seconds NOT IN (10, 30, 60, 300, 600, 1800, 3600)
      `)

      await client.query(`
        ALTER TABLE devices
          ALTER COLUMN record_interval_seconds SET DEFAULT 10
      `)

      await client.query(`
        ALTER TABLE device_metrics
          ADD COLUMN IF NOT EXISTS decimal_places SMALLINT
      `)

      await client.query(`
        UPDATE device_metrics
        SET decimal_places = 2
        WHERE decimal_places IS NULL
           OR decimal_places < 0
           OR decimal_places > 6
      `)

      await client.query(`
        ALTER TABLE device_metrics
          ALTER COLUMN decimal_places SET DEFAULT 2
      `)

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      settingsSchemaPromise = null
      throw error
    } finally {
      client.release()
    }
  })()

  return settingsSchemaPromise
}
