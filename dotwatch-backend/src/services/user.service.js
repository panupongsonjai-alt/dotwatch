import { pool } from "../db/pool.js";

export async function findOrCreateUser({ firebaseUid, email }) {
  const result = await pool.query(
    `
    INSERT INTO users (
      firebase_uid,
      email,
      updated_at
    )
    VALUES ($1, $2, NOW())
    ON CONFLICT (firebase_uid)
    DO UPDATE SET
      email = EXCLUDED.email,
      updated_at = NOW()
    RETURNING *
    `,
    [firebaseUid, email || null],
  );

  return result.rows[0];
}
