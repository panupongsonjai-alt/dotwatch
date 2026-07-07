CREATE TABLE IF NOT EXISTS demo_statistics (
    user_id BIGINT PRIMARY KEY
        REFERENCES users(id)
        ON DELETE CASCADE,

    generated_readings BIGINT NOT NULL DEFAULT 1,

    generated_alarms BIGINT NOT NULL DEFAULT 1,

    last_run_at TIMESTAMPTZ
);