import { pool } from "../db/pool.js";

export async function listAlarms(req, res) {
  const user = req.dbUser;

  const result = await pool.query(
    `
    SELECT
      ae.id,
      ae.device_id,
      d.device_code,
      d.name AS device_name,
      ae.metric,
      ae.operator,
      ae.threshold,
      ae.value,
      ae.severity,
      ae.status,
      ae.triggered_at,
      ae.acknowledged_at
    FROM alarm_events ae
    LEFT JOIN devices d ON d.id = ae.device_id
    WHERE ae.user_id = $1
    ORDER BY ae.triggered_at DESC
    LIMIT 100
    `,
    [user.id],
  );

  res.json(result.rows);
}

export async function acknowledgeAlarm(req, res) {
  const user = req.dbUser;
  const { id } = req.params;

  const result = await pool.query(
    `
    UPDATE alarm_events
    SET
      status = 'acknowledged',
      acknowledged_at = now()
    WHERE id = $1
      AND user_id = $2
    RETURNING *
    `,
    [id, user.id],
  );

  if (!result.rows.length) {
    return res.status(404).json({
      message: "Alarm not found",
    });
  }

  res.json(result.rows[0]);
}
