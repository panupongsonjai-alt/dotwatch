import { pool } from "../db/pool.js";

function compareValue(value, operator, threshold) {
  if (operator === ">") return value > threshold;
  if (operator === ">=") return value >= threshold;
  if (operator === "<") return value < threshold;
  if (operator === "<=") return value <= threshold;
  if (operator === "=") return value === threshold;
  return false;
}

export async function checkAlarms({ userId, deviceId, reading }) {
  const rulesResult = await pool.query(
    `
    SELECT id, metric, operator, threshold, severity
    FROM alarm_rules
    WHERE user_id = $1
      AND is_active = true
      AND (device_id = $2 OR device_id IS NULL)
    `,
    [userId, deviceId],
  );

  const alerts = [];

  for (const rule of rulesResult.rows) {
    const value = Number(reading[rule.metric]);
    if (!Number.isFinite(value)) continue;

    const triggered = compareValue(
      value,
      rule.operator,
      Number(rule.threshold),
    );

    if (!triggered) continue;

    const eventResult = await pool.query(
      `
      INSERT INTO alarm_events (
        user_id,
        device_id,
        rule_id,
        metric,
        operator,
        threshold,
        value,
        severity,
        status,
        triggered_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
      RETURNING *
      `,
      [
        userId,
        deviceId,
        rule.id,
        rule.metric,
        rule.operator,
        rule.threshold,
        value,
        rule.severity,
        reading.time,
      ],
    );

    alerts.push(eventResult.rows[0]);
  }

  return alerts;
}
