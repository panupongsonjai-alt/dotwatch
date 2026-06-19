CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,

    firebase_uid TEXT NOT NULL UNIQUE,

    email TEXT NOT NULL,

    display_name TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_firebase_uid
ON users(firebase_uid);

CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);