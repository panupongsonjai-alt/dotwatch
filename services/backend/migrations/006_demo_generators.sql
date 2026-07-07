CREATE TABLE IF NOT EXISTS demo_generators (
    user_id BIGINT PRIMARY KEY
        REFERENCES users(id)
        ON DELETE CASCADE,

    enabled BOOLEAN NOT NULL DEFAULT FALSE,

    interval_seconds INTEGER NOT NULL DEFAULT 30,

    generate_alarms BOOLEAN NOT NULL DEFAULT TRUE,

    simulate_offline BOOLEAN NOT NULL DEFAULT TRUE,

    temperature_drift BOOLEAN NOT NULL DEFAULT TRUE,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);