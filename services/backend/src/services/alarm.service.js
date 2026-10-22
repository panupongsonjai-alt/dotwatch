import { pool } from '../db/pool.js'


import { sendAlarmTriggeredPush } from './mobilePush.service.js'
import { sendAlarmChannelNotifications } from './alarmNotification.service.js'
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

// One query for all metrics of the device instead of one per metric.
async function getPreviousStates({ userId, deviceId, metrics }) {
  if (!metrics.length) return new Map()

  const result = await pool.query(
    `
    SELECT
      id,
      metric,
      state,
      severity,
      rule_id,
      current_value
    FROM alarm_states
    WHERE user_id = $1
      AND device_id = $2
      AND metric = ANY($3::text[])
    `,
    [userId, deviceId, metrics]
  )

  return new Map(result.rows.map((row) => [row.metric, row]))
}

// Batched version of the previous per-metric upsert. The ON CONFLICT rules are
// unchanged; only the round trips are reduced (N queries -> 1).
async function upsertStates({ userId, deviceId, evaluations, time }) {
  if (!evaluations.length) return

  const eventTime = time ? new Date(time) : new Date()

  const metrics = []
  const states = []
  const severities = []
  const ruleIds = []
  const operators = []
  const thresholds = []
  const values = []

  for (const evaluation of evaluations) {
    const isNormal = evaluation.nextState === 'normal'
    const rule = evaluation.triggeredRule

    metrics.push(evaluation.metric)
    states.push(evaluation.nextState)
    severities.push(isNormal ? null : rule?.severity || evaluation.nextState)
    ruleIds.push(isNormal ? null : rule?.id || null)
    operators.push(isNormal ? null : rule?.operator || null)
    thresholds.push(isNormal ? null : Number(rule?.threshold))
    values.push(evaluation.value)
  }

  await pool.query(
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
    SELECT
      $1,
      $2,
      input_rows.metric,
      input_rows.state,
      input_rows.severity,
      input_rows.rule_id,
      input_rows.operator,
      input_rows.threshold,
      input_rows.current_value,
      CASE WHEN input_rows.state = 'normal' THEN NULL ELSE $3::timestamptz END,
      CASE WHEN input_rows.state = 'normal' THEN $3::timestamptz ELSE NULL END,
      NOW()
    FROM unnest(
      $4::text[],
      $5::text[],
      $6::text[],
      $7::bigint[],
      $8::text[],
      $9::double precision[],
      $10::double precision[]
    ) AS input_rows(
      metric,
      state,
      severity,
      rule_id,
      operator,
      threshold,
      current_value
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
    `,
    [
      userId,
      deviceId,
      eventTime,
      metrics,
      states,
      severities,
      ruleIds,
      operators,
      thresholds,
      values,
    ]
  )
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
      dm.unit,
      COALESCE(dm.decimal_places, 2) AS decimal_places
    FROM alarm_rules ar
    LEFT JOIN device_metrics dm
      ON dm.device_id = $2
      AND dm.metric_key = ar.metric
    WHERE ar.user_id = $1
      AND ar.is_active = true
      AND ar.device_id = $2
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

  const evaluations = []

  for (const [metric, rules] of Object.entries(rulesByMetric)) {
    const value = Number(reading[metric])

    if (!Number.isFinite(value)) continue

    const triggeredRules = rules.filter((rule) =>
      compareValue(value, rule.operator, Number(rule.threshold))
    )

    const triggeredRule = pickHighestSeverityRule(triggeredRules)

    evaluations.push({
      metric,
      rules,
      value,
      triggeredRule,
      nextState: triggeredRule?.severity || 'normal',
    })
  }

  if (!evaluations.length) return alerts

  const previousStates = await getPreviousStates({
    userId,
    deviceId,
    metrics: evaluations.map((evaluation) => evaluation.metric),
  })

  await upsertStates({
    userId,
    deviceId,
    evaluations,
    time: reading.time,
  })

  for (const evaluation of evaluations) {
    const { metric, rules, value, triggeredRule, nextState } = evaluation
    const previousState = previousStates.get(metric) || null
    const previousStateName = previousState?.state || 'normal'
    const stateChanged = previousStateName !== nextState

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

      const recoveryPayload = {
        ...event,
        metric_name: recoveryRule?.metric_name || metric,
        unit: recoveryRule?.unit || '',
        decimal_places: recoveryRule?.decimal_places ?? 2,
      }

      void sendAlarmChannelNotifications({
        userId,
        deviceId,
        alarmEvent: recoveryPayload,
      }).catch((error) => {
        console.error('Alarm recovery channel notification failed:', {
          userId,
          deviceId,
          alarmEventId: event.id,
          message: error.message,
        })
      })

    alerts.push({
        ...recoveryPayload,
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

        
    void sendAlarmTriggeredPush({
      userId,
      deviceId,
      alarmEvent: {
        ...event,
        metric_name: triggeredRule.metric_name || metric,
        unit: triggeredRule.unit || '',
        decimal_places: triggeredRule.decimal_places ?? 2,
      },
    }).catch((error) => {
      console.error('Alarm push notification failed:', {
        userId,
        deviceId,
        alarmEventId: event.id,
        message: error.message,
      })
    })

    void sendAlarmChannelNotifications({
      userId,
      deviceId,
      alarmEvent: {
        ...event,
        metric_name: triggeredRule.metric_name || metric,
        unit: triggeredRule.unit || '',
        decimal_places: triggeredRule.decimal_places ?? 2,
      },
    }).catch((error) => {
      console.error('Alarm channel notification failed:', {
        userId,
        deviceId,
        alarmEventId: event.id,
        message: error.message,
      })
    })

    alerts.push({
      ...event,
      metric_name: triggeredRule.metric_name || metric,
      unit: triggeredRule.unit || '',
      decimal_places: triggeredRule.decimal_places ?? 2,
      state_transition: `${previousStateName}->${nextState}`,
    })
  }

  return alerts
}






