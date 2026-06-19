import pg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  await client.query(`CREATE EXTENSION IF NOT EXISTS timescaledb;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      firebase_uid TEXT UNIQUE NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      firmware_version TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_seen_at TIMESTAMPTZ,
      last_ingest_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sensor_readings (
      time TIMESTAMPTZ NOT NULL,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      temperature DOUBLE PRECISION NOT NULL,
      humidity DOUBLE PRECISION NOT NULL,
      rssi INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(
    `SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_sensor_device_time ON sensor_readings (device_id, time DESC);`,
  );

  const secretHash = await bcrypt.hash("dev-secret-001", 10);
  await client.query(`
    INSERT INTO users (firebase_uid, email)
    VALUES ('dev-user', 'dev@dotwatch.local')
    ON CONFLICT (firebase_uid) DO NOTHING;
  `);
  await client.query(
    `
    INSERT INTO devices (user_id, device_code, name, secret_hash)
    SELECT id, 'DW-000001', 'Demo Device', $1 FROM users WHERE firebase_uid = 'dev-user'
    ON CONFLICT (device_code) DO NOTHING;
  `,
    [secretHash],
  );

  console.log("Migration completed");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
