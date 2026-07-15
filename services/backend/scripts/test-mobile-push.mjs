import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const userId = Number(process.argv[2])
const deviceId = Number(process.argv[3])

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL')
}

if (!Number.isInteger(userId) || userId <= 0) {
  throw new Error(
    'Usage: node services/backend/scripts/test-mobile-push.mjs <userId> <deviceId>'
  )
}

if (!Number.isInteger(deviceId) || deviceId <= 0) {
  throw new Error(
    'Usage: node services/backend/scripts/test-mobile-push.mjs <userId> <deviceId>'
  )
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL.includes('render.com') ||
    process.env.DATABASE_URL.includes('render.internal')
      ? { rejectUnauthorized: false }
      : false,
})

await client.connect()

try {
  const result = await client.query(
    `
    SELECT
      d.id,
      d.device_code,
      d.name,
      mpt.token
    FROM devices d
    JOIN mobile_push_tokens mpt
      ON mpt.user_id = d.user_id
      AND mpt.is_active = true
    WHERE d.user_id = $1
      AND d.id = $2
    ORDER BY mpt.updated_at DESC
    LIMIT 1
    `,
    [userId, deviceId]
  )

  if (!result.rows.length) {
    throw new Error(
      'No active push token found for this user/device. Enable notifications in the mobile app first.'
    )
  }

  const row = result.rows[0]

  const response = await fetch(
    'https://exp.host/--/api/v2/push/send',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: row.token,
        sound: 'default',
        priority: 'high',
        channelId: 'alarms',
        title: '[TEST] dotWatch Push',
        body: `Push test for ${row.name || row.device_code}`,
        data: {
          type: 'alarm.test',
          deviceId: String(deviceId),
          url: `/devices/${deviceId}`,
        },
      }),
    }
  )

  const payload = await response.json()
  console.log(JSON.stringify(payload, null, 2))

  if (!response.ok) {
    process.exitCode = 1
  }
} finally {
  await client.end()
}
