import { pool } from '../db/pool.js'

export async function findUserByFirebaseUid(firebaseUid) {
  const result = await pool.query(
    `
    SELECT *
    FROM users
    WHERE firebase_uid = $1
    LIMIT 1
    `,
    [firebaseUid]
  )

  return result.rows[0] || null
}

export async function createUser({
  firebaseUid,
  email,
}) {
  const result = await pool.query(
    `
    INSERT INTO users (
      firebase_uid,
      email
    )
    VALUES ($1, $2)
    RETURNING *
    `,
    [firebaseUid, email]
  )

  return result.rows[0]
}

export async function findOrCreateUser({
  firebaseUid,
  email,
}) {
  let user = await findUserByFirebaseUid(firebaseUid)

  if (user) {
    return user
  }

  return createUser({
    firebaseUid,
    email,
  })
}