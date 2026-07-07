-- =========================================================
-- dotWatch Migration 014
-- Alarm State Engine
-- Purpose:
--   - Prevent duplicated alarm_events on every ingest
--   - Track current alarm state per device + metric
--   - Trigger alarm_events only when state changes
-- =========================================================

CREATE TABLE IF NOT EXISTS alarm_states (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'normal',
  severity TEXT,
  rule_id BIGINT REFERENCES alarm_rules(id) ON DELETE SET NULL,
  operator TEXT,
  threshold DOUBLE PRECISION,
  current_value DOUBLE PRECISION,
  triggered_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT alarm_states_state_check
    CHECK (state IN ('normal', 'warning', 'critical')),

  CONSTRAINT alarm_states_severity_check
    CHECK (severity IS NULL OR severity IN ('warning', 'critical')),

  CONSTRAINT alarm_states_device_metric_unique
    UNIQUE (device_id, metric)
);

CREATE INDEX IF NOT EXISTS idx_alarm_states_user_device
ON alarm_states (user_id, device_id);

CREATE INDEX IF NOT EXISTS idx_alarm_states_state
ON alarm_states (state);

CREATE INDEX IF NOT EXISTS idx_alarm_states_updated_at
ON alarm_states (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_alarm_states_active_lookup
ON alarm_states (user_id, device_id, state)
WHERE state <> 'normal';
