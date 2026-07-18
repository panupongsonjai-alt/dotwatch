import { pool } from '../db/pool.js'

function normalizePlatform(value) {
  const platform = String(value || '').trim().toLowerCase()
  return ['android', 'ios'].includes(platform) ? platform : 'unknown'
}

export async function registerMobilePushToken(req, res) {
  const user = req.dbUser
  const token = String(req.body?.token || '').trim()
  const platform = normalizePlatform(req.body?.platform)
  const deviceName =
    String(req.body?.deviceName || '').trim().slice(0, 160) || null

  if (
    !token.startsWith('ExponentPushToken[') &&
    !token.startsWith('ExpoPushToken[')
  ) {
    return res.status(400).json({ message: 'Invalid Expo push token' })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    await client.query(
      `
      UPDATE mobile_push_tokens
      SET
        is_active = false,
        updated_at = NOW()
      WHERE token = $1
        AND user_id <> $2
        AND is_active = true
      `,
      [token, user.id]
    )

    const result = await client.query(
      `
      INSERT INTO mobile_push_tokens (
        user_id,
        token,
        platform,
        device_name,
        is_active,
        last_used_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, true, NOW(), NOW())
      ON CONFLICT (user_id, token)
      DO UPDATE SET
        platform = EXCLUDED.platform,
        device_name = EXCLUDED.device_name,
        is_active = true,
        last_used_at = NOW(),
        updated_at = NOW()
      RETURNING
        id,
        platform,
        device_name,
        is_active,
        last_used_at,
        created_at,
        updated_at
      `,
      [user.id, token, platform, deviceName]
    )

    await client.query('COMMIT')
    res.status(201).json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function unregisterMobilePushToken(req, res) {
  const user = req.dbUser
  const token = String(req.body?.token || '').trim()

  if (!token) {
    return res.status(400).json({ message: 'Push token is required' })
  }

  const result = await pool.query(
    `
    UPDATE mobile_push_tokens
    SET is_active = false, updated_at = NOW()
    WHERE user_id = $1
      AND token = $2
    RETURNING id
    `,
    [user.id, token]
  )

  res.json({ ok: true, updatedCount: result.rowCount })
}

export async function getMobilePushStatus(req, res) {
  const user = req.dbUser
  const result = await pool.query(
    `
    SELECT COUNT(*)::integer AS active_tokens
    FROM mobile_push_tokens
    WHERE user_id = $1
      AND is_active = true
    `,
    [user.id]
  )

  res.json({ activeTokens: result.rows[0]?.active_tokens || 0 })
}
