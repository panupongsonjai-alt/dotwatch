CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  line_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  line_target_id TEXT,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_address TEXT,
  notify_on_trigger BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_recovery BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_preferences_line_target_length
    CHECK (line_target_id IS NULL OR char_length(line_target_id) BETWEEN 1 AND 128),
  CONSTRAINT notification_preferences_email_length
    CHECK (email_address IS NULL OR char_length(email_address) <= 320)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_enabled
ON notification_preferences (user_id)
WHERE line_enabled OR email_enabled;
