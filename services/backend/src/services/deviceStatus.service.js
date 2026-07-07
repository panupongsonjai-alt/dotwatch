import { env } from '../config/env.js'
import { pool } from '../db/pool.js'

export async function markOfflineDevices() {
  const warningResult = await pool.query(
    `
      UPDATE devices
      SET status = 'warning'
      WHERE status = 'online'
        AND last_ingest_at < now() - ($1::int * interval '1 second')
        AND last_ingest_at >= now() - ($2::int * interval '1 second')
      RETURNING id, device_code, name
    `,
    [env.deviceWarningAfterSeconds, env.deviceOfflineAfterSeconds]
  )

  if (warningResult.rows.length > 0) {
    console.log(
      `[WarningDetection] ${warningResult.rows.length} device(s) marked warning`
    )
  }

  const offlineResult = await pool.query(
    `
      UPDATE devices
      SET status = 'offline'
      WHERE status <> 'offline'
        AND last_ingest_at < now() - ($1::int * interval '1 second')
      RETURNING id, device_code, name
    `,
    [env.deviceOfflineAfterSeconds]
  )

  if (offlineResult.rows.length > 0) {
    console.log(
      `[OfflineDetection] ${offlineResult.rows.length} device(s) marked offline`
    )
  }

  return {
    warning: warningResult.rows,
    offline: offlineResult.rows,
  }
}
