import { pool } from '../db/pool.js'
import {
  ensureDefaultOrganizationForUser,
  ensureUserSubscription,
} from './commercial.service.js'

export async function findOrCreateUser({ firebaseUid, email }) {
  const result = await pool.query(
    `
    INSERT INTO users (
      firebase_uid,
      email,
      updated_at,
      last_login_at
    )
    VALUES ($1, $2, NOW(), NOW())
    ON CONFLICT (firebase_uid)
    DO UPDATE SET
      email = EXCLUDED.email,
      updated_at = NOW(),
      last_login_at = NOW()
    RETURNING *
    `,
    [firebaseUid, email || null]
  )

  const user = result.rows[0]

  await ensureUserSubscription({ userId: user.id, planKey: user.plan || 'free' })
  await ensureDefaultOrganizationForUser({
    userId: user.id,
    email: user.email,
  })

  return user
}
