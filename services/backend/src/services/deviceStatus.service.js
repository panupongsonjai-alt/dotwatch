import { env } from '../config/env.js'
import { pool } from '../db/pool.js'

export async function markOfflineDevices() {
  if (!env.weatherVirtualDeviceEnabled) {
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

  const warningResult = await pool.query(
    `
    WITH thresholds AS (
      SELECT
        d.id,
        CASE
          WHEN w.device_id IS NOT NULL AND w.enabled = true
            THEN GREATEST($1::int, w.poll_interval_seconds * 2)
          ELSE $1::int
        END AS warning_after_seconds,
        CASE
          WHEN w.device_id IS NOT NULL AND w.enabled = true
            THEN GREATEST($2::int, w.poll_interval_seconds * 3)
          ELSE $2::int
        END AS offline_after_seconds
      FROM devices d
      LEFT JOIN weather_virtual_devices w ON w.device_id = d.id
    )
    UPDATE devices d
    SET status = 'warning'
    FROM thresholds t
    WHERE d.id = t.id
      AND d.status = 'online'
      AND d.last_ingest_at < NOW() - (t.warning_after_seconds * INTERVAL '1 second')
      AND d.last_ingest_at >= NOW() - (t.offline_after_seconds * INTERVAL '1 second')
    RETURNING d.id, d.device_code, d.name
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
    WITH thresholds AS (
      SELECT
        d.id,
        CASE
          WHEN w.device_id IS NOT NULL AND w.enabled = true
            THEN GREATEST($1::int, w.poll_interval_seconds * 3)
          ELSE $1::int
        END AS offline_after_seconds
      FROM devices d
      LEFT JOIN weather_virtual_devices w ON w.device_id = d.id
    )
    UPDATE devices d
    SET status = 'offline'
    FROM thresholds t
    WHERE d.id = t.id
      AND d.status <> 'offline'
      AND d.last_ingest_at < NOW() - (t.offline_after_seconds * INTERVAL '1 second')
    RETURNING d.id, d.device_code, d.name
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
