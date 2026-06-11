import { pool } from '../db/pool.js';

export async function markOfflineDevices() {
  const result = await pool.query(`
    UPDATE devices
    SET status = 'offline'
    WHERE status = 'online'
      AND last_ingest_at < now() - interval '30 seconds'
    RETURNING id, device_code, name
  `);

  if (result.rows.length > 0) {
    console.log(
      `[OfflineDetection] ${result.rows.length} device(s) marked offline`
    );
  }

  return result.rows;
}