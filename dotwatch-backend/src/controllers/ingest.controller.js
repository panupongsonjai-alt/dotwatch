import { z } from 'zod';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';

const ingestSchema = z.object({
  temperature: z.number().min(-40).max(125),
  humidity: z.number().min(0).max(100),
  rssi: z.number().optional(),
  firmwareVersion: z.string().max(50).optional(),
  timestamp: z.string().datetime().optional(),
});

export async function ingestReading(req, res) {
  const data = ingestSchema.parse(req.body);
  const device = req.device;

  if (device.last_ingest_at) {
    const diff = (Date.now() - new Date(device.last_ingest_at).getTime()) / 1000;
    if (diff < env.ingestMinIntervalSeconds) {
      return res.status(429).json({ message: 'Device is sending too fast' });
    }
  }

  const time = data.timestamp || new Date().toISOString();

  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO sensor_readings (time, device_id, temperature, humidity, rssi)
       VALUES ($1, $2, $3, $4, $5)`,
      [time, device.id, data.temperature, data.humidity, data.rssi ?? null]
    );

    await pool.query(
      `UPDATE devices
       SET last_seen_at = now(), last_ingest_at = now(), status = 'online', firmware_version = COALESCE($2, firmware_version)
       WHERE id = $1`,
      [device.id, data.firmwareVersion || null]
    );

    await pool.query('COMMIT');
    res.status(201).json({ ok: true });
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}
