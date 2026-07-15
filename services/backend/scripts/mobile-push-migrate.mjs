import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL')
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
  await client.query(`
    CREATE TABLE IF NOT EXISTS mobile_push_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      platform VARCHAR(20) NOT NULL DEFAULT 'unknown',
      device_name TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, token)
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user_active
    ON mobile_push_tokens(user_id, is_active, updated_at DESC)
  `)

  console.log('Mobile push token migration: OK')
} finally {
  await client.end()
}
