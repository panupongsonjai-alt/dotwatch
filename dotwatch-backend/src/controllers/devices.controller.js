import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'

export async function listDevices(req, res) {
  const user = await upsertUser(req.user)

  const result = await pool.query(
    `
    SELECT
      d.id,
      d.device_code,
      d.name,
      d.status,
      d.last_seen_at,
      d.firmware_version,
      lr.temperature,
      lr.humidity,
      lr.rssi,
      lr.time AS latest_time
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT time, temperature, humidity, rssi
      FROM sensor_readings
      WHERE device_id = d.id
      ORDER BY time DESC
      LIMIT 1
    ) lr ON true
    WHERE d.user_id = $1
    ORDER BY d.created_at DESC
    `,
    [user.id]
  )

  res.json(result.rows)
}

export async function createDevice(req, res) {
  const user = await upsertUser(req.user)

  const name = req.body.name || 'New Device'
  const deviceCode =
    req.body.deviceCode ||
    `DW-${crypto.randomInt(1, 999999).toString().padStart(6, '0')}`

  const deviceSecret =
    req.body.deviceSecret || crypto.randomBytes(18).toString('hex')

  const secretHash = await bcrypt.hash(deviceSecret, 10)

  const result = await pool.query(
    `
    INSERT INTO devices (
      user_id,
      device_code,
      name,
      secret_hash
    )
    VALUES ($1, $2, $3, $4)
    RETURNING id, device_code, name, created_at
    `,
    [user.id, deviceCode, name, secretHash]
  )

  res.status(201).json({
    ...result.rows[0],
    deviceSecret,
  })
}

export async function getHistory(req, res) {
  const { id } = req.params

  const now = new Date()

  const fromDate = req.query.from
    ? new Date(req.query.from)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const toDate = req.query.to ? new Date(req.query.to) : now

  const diffDays =
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)

  let query

  if (diffDays <= 1) {
    query = `
      SELECT
        time AS bucket_time,
        temperature AS avg_temperature,
        temperature AS min_temperature,
        temperature AS max_temperature,
        humidity AS avg_humidity,
        humidity AS min_humidity,
        humidity AS max_humidity
      FROM sensor_readings
      WHERE device_id = $1
        AND time BETWEEN $2 AND $3
      ORDER BY time ASC
    `
  } else if (diffDays <= 30) {
    query = `
      SELECT
        bucket AS bucket_time,
        avg_temperature,
        min_temperature,
        max_temperature,
        avg_humidity,
        min_humidity,
        max_humidity
      FROM sensor_readings_1m
      WHERE device_id = $1
        AND bucket BETWEEN $2 AND $3
      ORDER BY bucket ASC
    `
  } else {
    query = `
      SELECT
        bucket AS bucket_time,
        avg_temperature,
        min_temperature,
        max_temperature,
        avg_humidity,
        min_humidity,
        max_humidity
      FROM sensor_readings_1h
      WHERE device_id = $1
        AND bucket BETWEEN $2 AND $3
      ORDER BY bucket ASC
    `
  }

  const result = await pool.query(query, [id, fromDate, toDate])

  res.json(result.rows)
}

export async function updateDevice(req, res) {
  const user = await upsertUser(req.user)

  const { id } = req.params
  const { name } = req.body

  const result = await pool.query(
    `
    UPDATE devices
    SET name = $1
    WHERE id = $2
      AND user_id = $3
    RETURNING id, device_code, name
    `,
    [name, id, user.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  res.json(result.rows[0])
}

export async function resetDeviceSecret(req, res) {
  const user = await upsertUser(req.user)

  const { id } = req.params
  const deviceSecret = crypto.randomBytes(18).toString('hex')
  const secretHash = await bcrypt.hash(deviceSecret, 10)

  const result = await pool.query(
    `
    UPDATE devices
    SET secret_hash = $1
    WHERE id = $2
      AND user_id = $3
    RETURNING id, device_code, name
    `,
    [secretHash, id, user.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  res.json({
    ...result.rows[0],
    deviceSecret,
  })
}

export async function deleteDevice(req, res) {
  const user = await upsertUser(req.user)

  const { id } = req.params

  const result = await pool.query(
    `
    DELETE FROM devices
    WHERE id = $1
      AND user_id = $2
    RETURNING id
    `,
    [id, user.id]
  )

  if (!result.rows.length) {
    return res.status(404).json({
      message: 'Device not found',
    })
  }

  res.json({
    ok: true,
  })
}

async function upsertUser(firebaseUser) {
  const result = await pool.query(
    `
    INSERT INTO users (firebase_uid, email)
    VALUES ($1, $2)
    ON CONFLICT (firebase_uid)
    DO UPDATE SET email = EXCLUDED.email
    RETURNING *
    `,
    [firebaseUser.uid, firebaseUser.email || null]
  )

  return result.rows[0]
}