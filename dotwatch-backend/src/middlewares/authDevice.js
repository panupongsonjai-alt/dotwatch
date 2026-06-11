import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';

export async function authDevice(req, res, next) {
  try {
    const deviceCode = req.headers['x-device-id'];
    const deviceSecret = req.headers['x-device-secret'];

    if (!deviceCode || !deviceSecret) {
      return res.status(401).json({ message: 'Missing device credentials' });
    }

    const result = await pool.query(
      `SELECT id, device_code, secret_hash, is_active, last_ingest_at
       FROM devices
       WHERE device_code = $1
       LIMIT 1`,
      [deviceCode]
    );

    const device = result.rows[0];
    if (!device || !device.is_active) {
      return res.status(401).json({ message: 'Invalid device' });
    }

    const ok = await bcrypt.compare(deviceSecret, device.secret_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid device secret' });

    req.device = device;
    next();
  } catch (error) {
    next(error);
  }
}
