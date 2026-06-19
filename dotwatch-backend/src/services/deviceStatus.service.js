import { pool } from "../db/pool.js";

export async function markOfflineDevices() {
  // 30-60 วินาที = warning

  const warningResult = await pool.query(`
    UPDATE devices
    SET status = 'warning'
    WHERE status = 'online'
      AND last_ingest_at < now() - interval '30 seconds'
      AND last_ingest_at >= now() - interval '60 seconds'
    RETURNING id, device_code, name
  `);

  if (warningResult.rows.length > 0) {
    console.log(
      `[WarningDetection] ${warningResult.rows.length} device(s) marked warning`,
    );
  }

  // มากกว่า 60 วินาที = offline

  const offlineResult = await pool.query(`
    UPDATE devices
    SET status = 'offline'
    WHERE status <> 'offline'
      AND last_ingest_at < now() - interval '60 seconds'
    RETURNING id, device_code, name
  `);

  if (offlineResult.rows.length > 0) {
    console.log(
      `[OfflineDetection] ${offlineResult.rows.length} device(s) marked offline`,
    );
  }

  return {
    warning: warningResult.rows,
    offline: offlineResult.rows,
  };
}
