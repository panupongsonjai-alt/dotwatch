#!/usr/bin/env node
// Finds and (optionally) drops exact duplicate indexes in the public schema.
//
// Several historical migrations created the same index under different names,
// e.g. device_metric_readings (device_id, metric_key, time DESC) can exist
// 4 times. Every duplicate is maintained on every INSERT, so ingest pays for
// it in CPU, WAL and disk while queries gain nothing.
//
// Usage:
//   node scripts/db-dedupe-indexes.mjs            # dry run: report only
//   node scripts/db-dedupe-indexes.mjs --apply    # drop the duplicates
//
// Safety:
// - Only exact duplicates are dropped (same table, columns, order, opclass,
//   collation, expression, predicate, uniqueness and access method).
// - Indexes that back a constraint (PRIMARY KEY / UNIQUE / EXCLUDE) are kept.
// - Names that migrations/run.js re-creates are kept, so the next migrate run
//   does not bring the duplicates back.
// - Take a backup first (npm run db:backup) and run outside peak hours.
import 'dotenv/config'
import pg from 'pg'

const apply = process.argv.includes('--apply')
const databaseUrl = String(process.env.DATABASE_URL || '').trim()

if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

// Names created by migrations/run.js (keep these when they are part of a
// duplicate group) and TimescaleDB's default hypertable time index names.
const PREFERRED_INDEX_NAMES = [
  'idx_metric_readings_device_metric_time',
  'idx_metric_readings_device_time',
  'idx_sensor_device_time',
  'idx_activity_logs_user_time',
  'idx_alarm_events_user_time',
  'idx_alarm_states_user_state',
  'idx_device_metric_latest_time',
  'device_metric_readings_time_idx',
  'sensor_readings_time_idx',
]

const useSsl =
  /render\.com|render\.internal|sslmode=require/i.test(databaseUrl) &&
  String(process.env.DATABASE_SSL_DISABLED || '').toLowerCase() !== 'true'

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: useSsl
    ? {
        rejectUnauthorized:
          String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true',
      }
    : false,
})

function rankIndex(index) {
  if (index.is_constraint) return 0
  const preferred = PREFERRED_INDEX_NAMES.indexOf(index.index_name)
  if (preferred >= 0) return 1 + preferred / 100
  return 2
}

async function main() {
  await client.connect()

  const target = await client.query(
    'SELECT current_database() AS database, current_user AS "user"'
  )
  console.log('Target:', target.rows[0])
  console.log(apply ? 'Mode: APPLY (duplicates will be dropped)' : 'Mode: dry run')

  const result = await client.query(`
    SELECT
      ns.nspname AS schema_name,
      tbl.relname AS table_name,
      idx.relname AS index_name,
      idx.oid::bigint AS index_oid,
      pg_relation_size(idx.oid) AS size_bytes,
      pg_get_indexdef(idx.oid) AS index_def,
      EXISTS (
        SELECT 1 FROM pg_constraint con WHERE con.conindid = idx.oid
      ) AS is_constraint,
      concat_ws(
        '|',
        i.indrelid::text,
        idx.relam::text,
        i.indkey::text,
        i.indclass::text,
        i.indcollation::text,
        i.indoption::text,
        i.indisunique::text,
        COALESCE(pg_get_expr(i.indexprs, i.indrelid), ''),
        COALESCE(pg_get_expr(i.indpred, i.indrelid), '')
      ) AS signature
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public'
      AND i.indisvalid
  `)

  const groups = new Map()

  for (const row of result.rows) {
    if (!groups.has(row.signature)) groups.set(row.signature, [])
    groups.get(row.signature).push(row)
  }

  const toDrop = []

  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue

    indexes.sort(
      (a, b) => rankIndex(a) - rankIndex(b) || Number(a.index_oid) - Number(b.index_oid)
    )

    const [keep, ...duplicates] = indexes
    console.log(`\n${keep.table_name}: keep ${keep.index_name}`)
    console.log(`  ${keep.index_def}`)

    for (const duplicate of duplicates) {
      if (duplicate.is_constraint) {
        console.log(`  skip ${duplicate.index_name} (backs a constraint)`)
        continue
      }

      console.log(
        `  drop ${duplicate.index_name} (${Math.round(Number(duplicate.size_bytes) / 1024)} kB)`
      )
      toDrop.push(duplicate)
    }
  }

  if (toDrop.length === 0) {
    console.log('\nNo duplicate indexes found.')
    return
  }

  const totalKb = Math.round(
    toDrop.reduce((sum, index) => sum + Number(index.size_bytes), 0) / 1024
  )
  console.log(`\n${toDrop.length} duplicate index(es), ~${totalKb} kB on the parent tables.`)

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to drop them.')
    return
  }

  // Fail fast instead of queueing behind long transactions and blocking ingest.
  await client.query("SET lock_timeout = '5s'")

  for (const index of toDrop) {
    const qualified = `"${index.schema_name}"."${index.index_name}"`

    try {
      await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${qualified}`)
      console.log(`dropped ${index.index_name}`)
    } catch (error) {
      // TimescaleDB hypertables do not support CONCURRENTLY.
      try {
        await client.query(`DROP INDEX IF EXISTS ${qualified}`)
        console.log(`dropped ${index.index_name} (non-concurrent)`)
      } catch (fallbackError) {
        console.error(`FAILED ${index.index_name}: ${fallbackError.message || error.message}`)
        process.exitCode = 1
      }
    }
  }
}

main()
  .catch((error) => {
    console.error('Index dedupe failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => client.end().catch(() => {}))
