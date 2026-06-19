import { pool } from "../db/pool.js";

export async function listAlarmRules(req, res) {
  const user = req.dbUser;

  const result = await pool.query(
    `
    SELECT *
    FROM alarm_rules
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [user.id],
  );

  res.json(result.rows);
}

export async function createAlarmRule(req, res) {
  const user = req.dbUser;

  const { device_id, metric, operator, threshold, severity } = req.body;

  const result = await pool.query(
    `
    INSERT INTO alarm_rules (
      user_id,
      device_id,
      metric,
      operator,
      threshold,
      severity
    )
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
    `,
    [user.id, device_id || null, metric, operator, threshold, severity],
  );

  res.status(201).json(result.rows[0]);
}

export async function updateAlarmRule(req, res) {
  const user = req.dbUser;
  const { id } = req.params;

  const { device_id, metric, operator, threshold, severity, is_active } =
    req.body;

  const result = await pool.query(
    `
    UPDATE alarm_rules
    SET
      device_id = $1,
      metric = $2,
      operator = $3,
      threshold = $4,
      severity = $5,
      is_active = $6
    WHERE id = $7
      AND user_id = $8
    RETURNING *
    `,
    [device_id, metric, operator, threshold, severity, is_active, id, user.id],
  );

  if (!result.rows.length) {
    return res.status(404).json({
      message: "Rule not found",
    });
  }

  res.json(result.rows[0]);
}

export async function deleteAlarmRule(req, res) {
  const user = req.dbUser;
  const { id } = req.params;

  const result = await pool.query(
    `
    DELETE FROM alarm_rules
    WHERE id = $1
      AND user_id = $2
    RETURNING id
    `,
    [id, user.id],
  );

  if (!result.rows.length) {
    return res.status(404).json({
      message: "Rule not found",
    });
  }

  res.json({
    ok: true,
  });
}
