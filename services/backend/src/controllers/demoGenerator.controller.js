import { pool } from "../db/pool.js";

export async function getGeneratorConfig(req, res) {
  const user = req.dbUser;

  const result = await pool.query(
    `
    SELECT *
    FROM demo_generators
    WHERE user_id = $1
    `,
    [user.id],
  );

  if (!result.rows.length) {
    return res.json({
      enabled: false,
      interval_seconds: 30,
      generate_alarms: true,
      simulate_offline: true,
      temperature_drift: true,
    });
  }

  res.json(result.rows[0]);
}

export async function saveGeneratorConfig(req, res) {
  const user = req.dbUser;

  const {
    enabled,
    interval_seconds,
    generate_alarms,
    simulate_offline,
    temperature_drift,
  } = req.body;

  const result = await pool.query(
    `
    INSERT INTO demo_generators (
      user_id,
      enabled,
      interval_seconds,
      generate_alarms,
      simulate_offline,
      temperature_drift
    )
    VALUES ($1,$2,$3,$4,$5,$6)

    ON CONFLICT (user_id)
    DO UPDATE SET
      enabled = EXCLUDED.enabled,
      interval_seconds = EXCLUDED.interval_seconds,
      generate_alarms = EXCLUDED.generate_alarms,
      simulate_offline = EXCLUDED.simulate_offline,
      temperature_drift = EXCLUDED.temperature_drift,
      updated_at = NOW()

    RETURNING *
    `,
    [
      user.id,
      enabled,
      interval_seconds,
      generate_alarms,
      simulate_offline,
      temperature_drift,
    ],
  );

  res.json(result.rows[0]);
}
