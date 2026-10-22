import { env } from '../config/env.js'
import { pool } from '../db/pool.js'
import {
  ensureDefaultOrganizationForUser,
  ensureUserSubscription,
} from './commercial.service.js'

// loadUser runs on every authenticated API request. Provisioning a user
// (users upsert + subscription + default organization/site/group) costs ~10
// queries including several writes, so the result is cached per Firebase UID
// for a short time. Admin changes to a user call invalidateUserContext().
const USER_CONTEXT_CACHE_MAX_ENTRIES = 5000
const userContextCache = new Map()
const pendingUserContexts = new Map()

async function provisionUser({ firebaseUid, email }) {
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

function rememberUserContext(cacheKey, email, user) {
  if (userContextCache.size >= USER_CONTEXT_CACHE_MAX_ENTRIES) {
    const oldestKey = userContextCache.keys().next().value
    userContextCache.delete(oldestKey)
  }

  userContextCache.set(cacheKey, {
    user,
    email,
    expiresAt: Date.now() + env.userContextCacheTtlMs,
  })
}

export async function findOrCreateUser({ firebaseUid, email }) {
  const cacheTtlMs = env.userContextCacheTtlMs

  if (!cacheTtlMs) {
    return provisionUser({ firebaseUid, email })
  }

  const cacheKey = String(firebaseUid)
  const normalizedEmail = email || null
  const cached = userContextCache.get(cacheKey)

  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.email === normalizedEmail
  ) {
    return { ...cached.user }
  }

  // Concurrent requests from the same user share one provisioning round trip.
  const pending = pendingUserContexts.get(cacheKey)
  if (pending) return { ...(await pending) }

  const promise = provisionUser({ firebaseUid, email })
  pendingUserContexts.set(cacheKey, promise)

  try {
    const user = await promise
    rememberUserContext(cacheKey, normalizedEmail, user)
    return { ...user }
  } finally {
    pendingUserContexts.delete(cacheKey)
  }
}

export function invalidateUserContext({ userId = null, firebaseUid = null } = {}) {
  if (firebaseUid) {
    userContextCache.delete(String(firebaseUid))
  }

  if (userId != null) {
    for (const [key, entry] of userContextCache.entries()) {
      if (String(entry.user?.id) === String(userId)) {
        userContextCache.delete(key)
      }
    }
  }
}
