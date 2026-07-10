import { pool } from '../db/pool.js'

const STATE_RANK = {
  normal: 0,
  warning: 1,
  critical: 2,
}

function compareValue(value, operator, threshold) {
  if (operator === '>') return value > threshold
  if (operator === '>=') return value >= threshold
  if (operator === '<') return value < threshold
  if (operator === '<=') return value <= threshold
  if (operator === '=' || operator === '==') return value === threshold
  if (operator === '!=') return value !== threshold
  return false
}

function getStateRank(state) {
  return STATE_RANK[state] || 0
}

function pickHighestSeverityRule(triggeredRules = []) {
  return triggeredRules
    .slice()
    .sort((a, b) => getStateRank(b.severity) - getStateRank(a.severity))[0]
}

async function getPreviousState({ userId, deviceId, metric }) {
  const result = await pool.query(
    `
    SELECT
      id,
      state,
      severity,
      rule_id,
      current_value
    FROM alarm_states
    WHERE user_id = $1
      AND device_id = $2
      AND metric = $3
    LIMIT 1
    `,
    [userId, deviceId, metric]
  )

  return result.rows[0] || null
}

async function upsertState({
  userId,
  deviceId,
  metric,
  nextState,
  rule,
  value,
  time,
}) {
  const eventTime = time ? new Date(time) : new Date()
  const isNormal = nextState === 'normal'

  const result = await pool.query(
    `
    INSERT INTO alarm_states (
      user_id,
      device_id,
      metric,
      state,
      severity,
      rule_id,
      operator,
      threshold,
      current_value,
      triggered_at,
      recovered_at,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      CASE WHEN $4 = 'normal' THEN NULL ELSE $10::timestamptz END,
      CASE WHEN $4 = 'normal' THEN $10::timestamptz ELSE NULL END,
      NOW()
    )
    ON CONFLICT (device_id, metric)
    DO UPDATE SET
      state = EXCLUDED.state,
      severity = EXCLUDED.severity,
      rule_id = EXCLUDED.rule_id,
      operator = EXCLUDED.operator,
      threshold = EXCLUDED.threshold,
      current_value = EXCLUDED.current_value,
      triggered_at = CASE
        WHEN alarm_states.state = 'normal'
          AND EXCLUDED.state <> 'normal'
        THEN EXCLUDED.triggered_at
        WHEN EXCLUDED.state <> 'normal'
        THEN COALESCE(alarm_states.triggered_at, EXCLUDED.triggered_at)
        ELSE NULL
      END,
      recovered_at = CASE
        WHEN alarm_states.state <> 'normal'
          AND EXCLUDED.state = 'normal'
        THEN EXCLUDED.recovered_at
        WHEN EXCLUDED.state = 'normal'
        THEN COALESCE(EXCLUDED.recovered_at, alarm_states.recovered_at)
        ELSE NULL
      END,
      updated_at = NOW()
    RETURNING *
    `,
    [
      userId,
      deviceId,
      metric,
      nextState,
      isNormal ? null : rule?.severity || nextState,
      isNormal ? null : rule?.id || null,
      isNormal ? null : rule?.operator || null,
      isNormal ? null : Number(rule?.threshold),
      value,
      eventTime,
    ]
  )

  return result.rows[0]
}

async function createAlarmEvent({
  userId,
  deviceId,
  rule,
  metric,
  value,
  status,
  time,
}) {
  const result = await pool.query(
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
      notification_message,
      triggered_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
    `,
    [
      userId,
      deviceId,
      rule?.id || null,
      metric,
      rule?.operator || null,
      rule?.threshold != null ? Number(rule.threshold) : null,
      value,
      rule?.severity || status,
      status,
      rule?.notification_message || null,
      time ? new Date(time) : new Date(),
    ]
  )

  return result.rows[0]
}

export async function checkAlarms({ userId, deviceId, reading }) {
  const rulesResult = await pool.query(
    `
    SELECT
      ar.id,
      ar.metric,
      ar.operator,
      ar.threshold,
      ar.severity,
      ar.notification_message,
      dm.metric_name,
      dm.unit
    FROM alarm_rules ar
    LEFT JOIN device_metrics dm
      ON dm.device_id = $2
      AND dm.metric_key = ar.metric
    WHERE ar.user_id = $1
      AND ar.is_active = true
      AND (ar.device_id = $2 OR ar.device_id IS NULL)
    ORDER BY
      ar.metric ASC,
      CASE
        WHEN ar.severity = 'critical' THEN 2
        WHEN ar.severity = 'warning' THEN 1
        ELSE 0
      END DESC
    `,
    [userId, deviceId]
  )

  const rulesByMetric = rulesResult.rows.reduce((collection, rule) => {
    if (!collection[rule.metric]) {
      collection[rule.metric] = []
    }

    collection[rule.metric].push(rule)
    return collection
  }, {})

  const alerts = []

  for (const [metric, rules] of Object.entries(rulesByMetric)) {
    const value = Number(reading[metric])

    if (!Number.isFinite(value)) continue

    const triggeredRules = rules.filter((rule) =>
      compareValue(value, rule.operator, Number(rule.threshold))
    )

    const triggeredRule = pickHighestSeverityRule(triggeredRules)
    const nextState = triggeredRule?.severity || 'normal'
    const previousState = await getPreviousState({
      userId,
      deviceId,
      metric,
    })

    const previousStateName = previousState?.state || 'normal'
    const stateChanged = previousStateName !== nextState

    await upsertState({
      userId,
      deviceId,
      metric,
      nextState,
      rule: triggeredRule,
      value,
      time: reading.time,
    })

    if (!stateChanged) continue

    if (nextState === 'normal') {
      const recoveryRule =
        rules.find(
          (rule) => Number(rule.id) === Number(previousState?.rule_id)
        ) || rules[0]

      const event = await createAlarmEvent({
        userId,
        deviceId,
        rule: recoveryRule,
        metric,
        value,
        status: 'resolved',
        time: reading.time,
      })

      alerts.push({
        ...event,
        metric_name: recoveryRule?.metric_name || metric,
        unit: recoveryRule?.unit || '',
        state_transition: `${previousStateName}->normal`,
      })

      continue
    }

    const event = await createAlarmEvent({
      userId,
      deviceId,
      rule: triggeredRule,
      metric,
      value,
      status: 'active',
      time: reading.time,
    })

    alerts.push({
      ...event,
      metric_name: triggeredRule.metric_name || metric,
      unit: triggeredRule.unit || '',
      state_transition: `${previousStateName}->${nextState}`,
    })
  }

  return alerts
}
