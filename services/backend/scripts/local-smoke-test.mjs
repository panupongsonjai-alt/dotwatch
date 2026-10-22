#!/usr/bin/env node
// End-to-end smoke test against a LOCAL backend started with
// DEV_AUTH_BYPASS=true, NODE_ENV=development and INGEST_MIN_INTERVAL_SECONDS=0.
// Used by scripts/local-verify.ps1; can also be run on its own:
//   SMOKE_API_URL=http://localhost:4100 node scripts/local-smoke-test.mjs
//
// It creates a temporary device (SMOKE-<timestamp>), exercises ingest,
// alarms, history, value settings and secret reset, then deletes the device.
// It refuses to run against a non-local database.
import 'dotenv/config'
import pg from 'pg'

const API = String(process.env.SMOKE_API_URL || 'http://localhost:4100').replace(/\/$/, '')
const databaseUrl = String(process.env.DATABASE_URL || '').trim()

function isLocalDatabase(url) {
  try {
    const host = new URL(url).hostname
    return ['localhost', '127.0.0.1', '::1', 'db', 'host.docker.internal'].includes(host)
  } catch {
    return false
  }
}

if (!databaseUrl || !isLocalDatabase(databaseUrl)) {
  console.error('Refusing to run: DATABASE_URL must point to a local database.')
  process.exit(2)
}

const db = new pg.Client({ connectionString: databaseUrl })
const results = []
const code = `SMOKE-${Date.now()}`
let secret = `${code}-secret-value-123456`
let deviceId = null

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function api(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 20_000)
  try {
    const response = await fetch(`${API}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    })
    const text = await response.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: response.status, body, headers: response.headers }
  } finally {
    clearTimeout(timer)
  }
}

function ingest(metrics, { path = '/api/ingest', body = null, useSecret = secret } = {}) {
  return api(path, {
    method: 'POST',
    headers: { 'x-device-code': code, 'x-device-secret': useSecret },
    body: JSON.stringify(body || { metrics }),
  })
}

async function step(name, fn) {
  try {
    await fn()
  } catch (error) {
    record(name, false, error.message)
  }
}

async function main() {
  await db.connect()

  await step('Backend health', async () => {
    const health = await api('/health')
    record('Backend health', health.status === 200 && health.body?.ok === true, `database=${health.body?.database}`)
  })

  await step('Create test device', async () => {
    await db.query('UPDATE plan_definitions SET device_limit = GREATEST(device_limit, 1000)').catch(() => {})
    await db.query('UPDATE users SET device_limit = GREATEST(COALESCE(device_limit, 0), 1000)').catch(() => {})
    const created = await api('/api/devices', {
      method: 'POST',
      body: JSON.stringify({ deviceCode: code, name: code, deviceSecret: secret }),
    })
    const row = await db.query('SELECT id FROM devices WHERE device_code = $1', [code])
    deviceId = row.rows[0]?.id || null
    record('Create test device', created.status === 201 && Boolean(deviceId), `HTTP ${created.status}`)
  })

  if (!deviceId) throw new Error('Cannot continue without a test device')

  await step('30 concurrent ingests (pool deadlock check)', async () => {
    const started = Date.now()
    const statuses = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        ingest({ metric_1: 20 + (i % 5), metric_2: 50 }).then((r) => r.status)
      )
    )
    const elapsed = Date.now() - started
    const ok = statuses.every((status) => status === 201) && elapsed < 15_000
    record('30 concurrent ingests (pool deadlock check)', ok, `${statuses.filter((s) => s === 201).length}/30 OK in ${elapsed} ms`)
  })

  await step('Health after load', async () => {
    const health = await api('/health', { timeoutMs: 5000 })
    record('Health after load', health.body?.ok === true && health.body?.database === 'connected', `database=${health.body?.database}`)
  })

  await step('Alarm transitions', async () => {
    await db.query(
      `INSERT INTO alarm_rules (user_id, device_id, metric, operator, threshold, severity)
       SELECT user_id, id, r.metric, '>', r.threshold, r.severity
       FROM devices,
       (VALUES ('metric_1', 30::float8, 'warning'), ('metric_1', 40, 'critical')) r(metric, threshold, severity)
       WHERE id = $1`,
      [deviceId]
    )
    const sequence = [35, 45, 45, 20]
    const transitions = []
    for (const value of sequence) {
      const response = await ingest({ metric_1: value, metric_2: 50 })
      transitions.push((response.body?.data?.alerts || []).map((a) => a.state_transition).join('|') || '-')
    }
    const expected = ['normal->warning', 'warning->critical', '-', 'critical->normal']
    const events = await db.query('SELECT COUNT(*)::int AS n FROM alarm_events WHERE device_id = $1', [deviceId])
    const ok = JSON.stringify(transitions) === JSON.stringify(expected) && events.rows[0].n === 3
    record('Alarm transitions', ok, transitions.join(', '))
  })

  await step('Batch ingest', async () => {
    const now = Date.now()
    const response = await ingest(null, {
      path: '/api/ingest/batch',
      body: {
        readings: [
          { metrics: { metric_1: 21 }, timestamp: new Date(now - 30_000).toISOString() },
          { metrics: { metric_1: 22 }, timestamp: new Date(now).toISOString() },
        ],
      },
    })
    record('Batch ingest', response.status === 201 && response.body?.data?.acceptedReadings === 2, `HTTP ${response.status}`)
  })

  await step('History returns newest rows', async () => {
    await db.query(
      `INSERT INTO device_metric_readings (time, device_id, metric_key, value)
       SELECT now() - (g * interval '10 seconds'), $1, 'metric_1', g
       FROM generate_series(1, 1000) g`,
      [deviceId]
    )
    const now = Date.now()
    const from = new Date(now - 3 * 3600_000).toISOString()
    const to = new Date(now + 60_000).toISOString()
    const response = await api(
      `/api/devices/${deviceId}/history?metricKey=metric_1&from=${from}&to=${to}&resolution=raw&limit=100`
    )
    const rows = Array.isArray(response.body) ? response.body : []
    const newestAge = rows.length ? (now - new Date(rows[rows.length - 1].time).getTime()) / 1000 : Infinity
    const ascending = rows.every((row, i) => i === 0 || new Date(rows[i - 1].time) <= new Date(row.time))
    record('History returns newest rows', rows.length === 100 && ascending && newestAge < 60, `${rows.length} rows, newest ${Math.round(newestAge)} s old`)
  })

  await step('Value settings save/reset', async () => {
    const saved = await api(`/api/devices/${deviceId}/metrics`, {
      method: 'PUT',
      body: JSON.stringify({
        metrics: [
          { metric_key: 'metric_1', metric_name: 'Temp', unit: 'C', sort_order: 1, decimal_places: 1 },
          { metric_key: 'metric_2', metric_name: 'Hum', unit: '%', sort_order: 2 },
        ],
        settings: { record_interval_seconds: 30 },
      }),
    })
    const reset = await api(`/api/devices/${deviceId}/metrics/reset`, { method: 'POST' })
    const ok =
      saved.status === 200 &&
      saved.body?.metrics?.length === 2 &&
      saved.body?.settings?.record_interval_seconds === 30 &&
      reset.status === 200
    record('Value settings save/reset', ok, `save HTTP ${saved.status}, reset HTTP ${reset.status}`)
  })

  await step('Secret reset invalidates cached auth', async () => {
    const before = await ingest({ metric_1: 23 })
    const reset = await api(`/api/devices/${deviceId}/reset-secret`, { method: 'POST' })
    const oldSecret = await ingest({ metric_1: 23 })
    const newSecret = await ingest({ metric_1: 23 }, { useSecret: reset.body?.deviceSecret })
    if (reset.body?.deviceSecret) secret = reset.body.deviceSecret
    const ok = before.status === 201 && oldSecret.status === 401 && newSecret.status === 201
    record('Secret reset invalidates cached auth', ok, `before ${before.status}, old ${oldSecret.status}, new ${newSecret.status}`)
  })

  await step('Device list', async () => {
    const list = await api('/api/devices')
    const device = Array.isArray(list.body) ? list.body.find((d) => d.device_code === code) : null
    record('Device list', list.status === 200 && Boolean(device), `HTTP ${list.status}`)
  })

  await step('Rate limit counted once per request', async () => {
    const first = await api('/api/device-models')
    const second = await api('/api/device-models')
    const a = Number(first.headers.get('ratelimit-remaining'))
    const b = Number(second.headers.get('ratelimit-remaining'))
    record('Rate limit counted once per request', Number.isFinite(a) && a - b === 1, `remaining ${a} -> ${b}`)
  })

  await step('Delete test device', async () => {
    const deleted = await api(`/api/devices/${deviceId}`, { method: 'DELETE' })
    record('Delete test device', deleted.status === 200, `HTTP ${deleted.status}`)
  })
}

main()
  .catch((error) => record('Smoke test', false, error.message))
  .finally(async () => {
    if (deviceId) {
      await db.query('DELETE FROM devices WHERE id = $1', [deviceId]).catch(() => {})
    }
    await db.end().catch(() => {})
    const failed = results.filter((r) => !r.ok).length
    console.log(`\nSmoke test: ${results.length - failed}/${results.length} passed`)
    process.exitCode = failed ? 1 : 0
  })
