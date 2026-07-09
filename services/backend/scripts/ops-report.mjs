import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../src/db/pool.js'
import { checkDatabaseHealth } from '../src/utils/health.js'
import { env } from '../src/config/env.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')
const reportDir = path.join(repoRoot, '_reports', 'ops')

function nowStamp() {
  const d = new Date()
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

async function maybeQuery(name, sql, params = []) {
  const startedAt = Date.now()
  try {
    const result = await pool.query(sql, params)
    return {
      name,
      ok: true,
      latencyMs: Date.now() - startedAt,
      rows: result.rows,
    }
  } catch (error) {
    return {
      name,
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: env.isDevelopment ? error.message : 'Query failed',
    }
  }
}

async function main() {
  const database = await checkDatabaseHealth()
  const checks = []

  checks.push(await maybeQuery('database_identity', `
    SELECT current_database() AS database_name, current_user AS database_user, version() AS postgres_version
  `))

  checks.push(await maybeQuery('core_table_counts', `
    SELECT 'users' AS table_name, count(*)::bigint AS row_count FROM users
    UNION ALL SELECT 'devices', count(*)::bigint FROM devices
    UNION ALL SELECT 'device_metric_readings', count(*)::bigint FROM device_metric_readings
    UNION ALL SELECT 'device_metric_latest', count(*)::bigint FROM device_metric_latest
    UNION ALL SELECT 'activity_logs', count(*)::bigint FROM activity_logs
    ORDER BY table_name
  `))

  checks.push(await maybeQuery('recent_ingest_window', `
    SELECT
      max(time) AS latest_reading_time,
      count(*) FILTER (WHERE time >= now() - interval '15 minutes')::bigint AS readings_last_15m,
      count(*) FILTER (WHERE time >= now() - interval '1 hour')::bigint AS readings_last_1h,
      count(DISTINCT device_id) FILTER (WHERE time >= now() - interval '1 hour')::bigint AS active_devices_last_1h
    FROM device_metric_readings
  `))

  checks.push(await maybeQuery('device_status_summary', `
    SELECT status, count(*)::bigint AS device_count
    FROM devices
    WHERE is_active = true
    GROUP BY status
    ORDER BY status
  `))

  checks.push(await maybeQuery('slow_recent_devices', `
    SELECT id, device_code, name, status, last_ingest_at
    FROM devices
    WHERE is_active = true
    ORDER BY last_ingest_at DESC NULLS LAST
    LIMIT 20
  `))

  checks.push(await maybeQuery('migration_files_summary', `
    SELECT current_database() AS database_name
  `))

  const failedChecks = checks.filter((check) => !check.ok)
  const report = {
    ok: database.status === 'connected' && failedChecks.length === 0,
    service: 'dotwatch-backend',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
    release: env.releaseVersion || 'local',
    database,
    failedCheckCount: failedChecks.length,
    checks,
  }

  await fs.mkdir(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, `backend-ops-report-${nowStamp()}.json`)
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(`Backend ops report written: ${reportPath}`)
  console.log(JSON.stringify({ ok: report.ok, failedCheckCount: report.failedCheckCount, database: database.status }, null, 2))

  await pool.end()
  process.exit(report.ok ? 0 : 1)
}

main().catch(async (error) => {
  console.error('Backend ops report failed:', error.message)
  try { await pool.end() } catch { /* ignore */ }
  process.exit(1)
})
