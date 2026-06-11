CREATE TABLE users (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  firebase_uid TEXT UNIQUE NOT NULL,

  email TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE devices (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id),

  device_key TEXT UNIQUE NOT NULL,

  device_name TEXT NOT NULL,

  location TEXT,

  status TEXT DEFAULT 'offline',

  last_seen TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE telemetry (

  id BIGSERIAL,

  device_id UUID NOT NULL REFERENCES devices(id),

  ts TIMESTAMPTZ NOT NULL,

  temperature DOUBLE PRECISION,

  humidity DOUBLE PRECISION,

  battery DOUBLE PRECISION,

  rssi INTEGER,

  PRIMARY KEY(id, ts)
);

CREATE EXTENSION IF NOT EXISTS timescaledb;

SELECT create_hypertable(
  'telemetry',
  'ts',
  if_not_exists => TRUE
);