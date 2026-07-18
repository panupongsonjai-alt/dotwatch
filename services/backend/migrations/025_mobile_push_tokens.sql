CREATE TABLE IF NOT EXISTS mobile_push_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'unknown',
  device_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mobile_push_tokens
  ADD COLUMN IF NOT EXISTS platform VARCHAR(20) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS device_name TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_mobile_push_tokens_user_token
  ON mobile_push_tokens(user_id, token);

CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user_active
  ON mobile_push_tokens(user_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_token
  ON mobile_push_tokens(token);

WITH ranked_active_tokens AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY token
      ORDER BY updated_at DESC, id DESC
    ) AS token_rank
  FROM mobile_push_tokens
  WHERE is_active = TRUE
)
UPDATE mobile_push_tokens target
SET
  is_active = FALSE,
  updated_at = NOW()
FROM ranked_active_tokens ranked
WHERE target.id = ranked.id
  AND ranked.token_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mobile_push_tokens_active_token
  ON mobile_push_tokens(token)
  WHERE is_active = TRUE;
