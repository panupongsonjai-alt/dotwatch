import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useDeviceMetrics } from '../hooks/useDeviceMetrics'
import { createBlankMetric } from '../utils/metricDisplayConfig'
import { METRIC_ICON_OPTIONS, MetricIcon } from '../utils/metricIcons'

const UNIT_OPTIONS = [
  '',
  '°C',
  '%',
  'kWh',
  'kW',
  'W',
  'V',
  'A',
  'bar',
  'psi',
  'Pa',
  'L/min',
  'm³/h',
  'rpm',
  'dBm',
]

const DEFAULT_ALARM_DRAFT = {
  operator: '>',
  threshold: '',
  severity: 'warning',
}

function updateMetricList(metrics = [], metricIndex, key, value) {
  return metrics.map((metric, index) => {
    if (index !== metricIndex) return metric

    return {
      ...metric,
      [key]: value,
    }
  })
}

function reindexMetrics(metrics = []) {
  return metrics.map((metric, index) => ({
    ...metric,
    metric_key: metric.metric_key || `metric_${index + 1}`,
    sort_order: index,
  }))
}

function getRuleDraftKey(metricKey) {
  return metricKey || 'metric'
}

export default function MetricConfigPanel({
  deviceId,
  maxMetrics = 0,
  alarmRules = [],
  onCreateAlarm,
  onUpdateAlarm,
  onDeleteAlarm,
}) {
  const {
    draftMetrics = [],
    setDraftMetrics,
    loading,
    saving,
    message,
    saveDraftMetrics,
    resetMetrics,
  } = useDeviceMetrics(deviceId)

  const [newAlarmDrafts, setNewAlarmDrafts] = useState({})
  const [alarmEditDrafts, setAlarmEditDrafts] = useState({})
  const [alarmActionId, setAlarmActionId] = useState('')

  const metricLimit = Number(maxMetrics) || 0
  const canAddMetric = !metricLimit || draftMetrics.length < metricLimit

  useEffect(() => {
    const nextDrafts = {}

    for (const rule of alarmRules) {
      nextDrafts[rule.id] = {
        operator: rule.operator || '>',
        threshold: rule.threshold ?? '',
        severity: rule.severity || 'warning',
      }
    }

    setAlarmEditDrafts(nextDrafts)
  }, [alarmRules])

  const normalizedAlarmRules = useMemo(() => {
    return Array.isArray(alarmRules) ? alarmRules : []
  }, [alarmRules])

  function addMetric() {
    if (!canAddMetric) {
      alert(`รุ่นนี้เพิ่มได้สูงสุด ${metricLimit} Metric`)
      return
    }

    setDraftMetrics((currentMetrics = []) =>
      reindexMetrics([
        ...currentMetrics,
        createBlankMetric(currentMetrics.length),
      ])
    )
  }

  function removeMetric(indexToRemove) {
    setDraftMetrics((currentMetrics = []) =>
      reindexMetrics(
        currentMetrics.filter((_, index) => index !== indexToRemove)
      )
    )
  }

  function updateMetric(index, key, value) {
    setDraftMetrics((currentMetrics = []) =>
      updateMetricList(currentMetrics, index, key, value)
    )
  }

  async function handleReset() {
    await resetMetrics()

    window.dispatchEvent(
      new CustomEvent('dotwatchMetricConfigChanged', {
        detail: { deviceId },
      })
    )
  }

  async function handleSave() {
    const limitedMetrics = metricLimit
      ? draftMetrics.slice(0, metricLimit)
      : draftMetrics

    const success = await saveDraftMetrics(reindexMetrics(limitedMetrics))

    if (success !== false) {
      window.dispatchEvent(
        new CustomEvent('dotwatchMetricConfigChanged', {
          detail: { deviceId },
        })
      )
    }

    return success
  }

  function getMetricRules(metricKey) {
    return normalizedAlarmRules
      .filter((rule) => String(rule.metric) === String(metricKey))
      .slice(0, 2)
  }

  function getNewAlarmDraft(metricKey) {
    return newAlarmDrafts[getRuleDraftKey(metricKey)] || DEFAULT_ALARM_DRAFT
  }

  function updateNewAlarmDraft(metricKey, key, value) {
    const draftKey = getRuleDraftKey(metricKey)

    setNewAlarmDrafts((prev) => ({
      ...prev,
      [draftKey]: {
        ...(prev[draftKey] || DEFAULT_ALARM_DRAFT),
        [key]: value,
      },
    }))
  }

  function updateAlarmEditDraft(ruleId, key, value) {
    setAlarmEditDrafts((prev) => ({
      ...prev,
      [ruleId]: {
        ...(prev[ruleId] || DEFAULT_ALARM_DRAFT),
        [key]: value,
      },
    }))
  }

  async function handleCreateAlarm(metricKey) {
    if (!onCreateAlarm) return

    const draft = getNewAlarmDraft(metricKey)

    if (draft.threshold === '' || Number.isNaN(Number(draft.threshold))) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    try {
      setAlarmActionId(`new-${metricKey}`)

      await onCreateAlarm(metricKey, {
        operator: draft.operator || '>',
        threshold: Number(draft.threshold),
        severity: draft.severity || 'warning',
      })

      setNewAlarmDrafts((prev) => ({
        ...prev,
        [getRuleDraftKey(metricKey)]: DEFAULT_ALARM_DRAFT,
      }))
    } finally {
      setAlarmActionId('')
    }
  }

  async function handleUpdateAlarm(rule) {
    if (!onUpdateAlarm) return

    const draft = alarmEditDrafts[rule.id] || {
      operator: rule.operator || '>',
      threshold: rule.threshold ?? '',
      severity: rule.severity || 'warning',
    }

    if (draft.threshold === '' || Number.isNaN(Number(draft.threshold))) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    try {
      setAlarmActionId(String(rule.id))

      await onUpdateAlarm(rule.id, {
        ...rule,
        operator: draft.operator || '>',
        threshold: Number(draft.threshold),
        severity: draft.severity || 'warning',
      })
    } finally {
      setAlarmActionId('')
    }
  }

  async function handleDeleteAlarm(ruleId) {
    if (!onDeleteAlarm) return

    const ok = window.confirm('ต้องการลบ Alarm Rule นี้ใช่ไหม?')
    if (!ok) return

    try {
      setAlarmActionId(String(ruleId))
      await onDeleteAlarm(ruleId)
    } finally {
      setAlarmActionId('')
    }
  }

  return (
    <section className="metric-config-panel clean-metric-panel">
      <div className="metric-config-header">
        <div>
          <h4>Metric Display</h4>
          <p>
            ตั้งชื่อ หน่วย ไอคอน และ Alarm Rules ของแต่ละ Metric
            {metricLimit ? ` • รุ่นนี้รองรับสูงสุด ${metricLimit} Metric` : ''}
          </p>
        </div>

        <button
          type="button"
          className="ghost-button metric-add-btn"
          onClick={addMetric}
          disabled={loading || saving || !canAddMetric}
          title={
            metricLimit
              ? `รุ่นนี้เพิ่มได้สูงสุด ${metricLimit} Metric`
              : 'Add Metric'
          }
        >
          <Plus size={16} />
          Add Metric
        </button>
      </div>

      {message && <div className="metric-config-message">{message}</div>}

      <div className="metric-config-table">
        <div className="metric-config-table-head clean metric-alarm-head">
          <span>Metric Name</span>
          <span>Unit</span>
          <span>Icon</span>
          <span>Show</span>
          <span />
        </div>

        {draftMetrics.map((metric, index) => {
          const metricKey = metric.metric_key || `metric_${index + 1}`
          const metricRules = getMetricRules(metricKey)
          const newAlarmDraft = getNewAlarmDraft(metricKey)
          const canAddAlarm = metricRules.length < 2

          return (
            <div
              className="metric-config-card"
              key={metric.id ? `metric-${metric.id}` : `metric-${index}`}
            >
              <div className="metric-config-row clean metric-main-row">
                <label>
                  <span>Metric Name</span>
                  <input
                    value={metric.metric_name || ''}
                    placeholder={`Name-${String(index + 1).padStart(2, '0')}`}
                    onChange={(event) =>
                      updateMetric(index, 'metric_name', event.target.value)
                    }
                    disabled={loading || saving}
                  />
                </label>

                <label>
                  <span>Unit</span>
                  <input
                    list={`metric-unit-options-${deviceId}-${index}`}
                    value={metric.unit || ''}
                    placeholder="เลือกหรือพิมพ์เอง"
                    onChange={(event) =>
                      updateMetric(index, 'unit', event.target.value)
                    }
                    disabled={loading || saving}
                  />

                  <datalist id={`metric-unit-options-${deviceId}-${index}`}>
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit || 'blank'} value={unit} />
                    ))}
                  </datalist>
                </label>

                <div className="metric-icon-field">
                  <span>Icon</span>

                  <div className="metric-icon-picker">
                    {METRIC_ICON_OPTIONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        className={
                          (metric.icon || 'Activity') === icon ? 'active' : ''
                        }
                        onClick={() => updateMetric(index, 'icon', icon)}
                        disabled={loading || saving}
                        title={icon}
                      >
                        <MetricIcon name={icon} size={16} />
                      </button>
                    ))}
                  </div>
                </div>

                <label className="metric-visible-clean">
                  <span>Show</span>
                  <input
                    type="checkbox"
                    checked={metric.visible !== false}
                    onChange={(event) =>
                      updateMetric(index, 'visible', event.target.checked)
                    }
                    disabled={loading || saving}
                  />
                </label>

                <button
                  type="button"
                  className="delete-btn square"
                  onClick={() => removeMetric(index)}
                  disabled={loading || saving}
                  title="Delete metric"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="metric-inline-alarms">
                <div className="metric-inline-alarms-header">
                  <strong>Alarm Rules</strong>
                  <span>{metricRules.length}/2 rules</span>
                </div>

                {metricRules.length === 0 && (
                  <p className="metric-alarm-empty">ยังไม่มี Alarm Rule</p>
                )}

                {metricRules.map((rule) => {
                  const editDraft = alarmEditDrafts[rule.id] || {
                    operator: rule.operator || '>',
                    threshold: rule.threshold ?? '',
                    severity: rule.severity || 'warning',
                  }

                  return (
                    <div className="metric-alarm-row" key={rule.id}>
                      <select
                        value={editDraft.operator}
                        onChange={(event) =>
                          updateAlarmEditDraft(
                            rule.id,
                            'operator',
                            event.target.value
                          )
                        }
                        disabled={alarmActionId === String(rule.id)}
                      >
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                      </select>

                      <input
                        type="number"
                        step="0.1"
                        value={editDraft.threshold}
                        onChange={(event) =>
                          updateAlarmEditDraft(
                            rule.id,
                            'threshold',
                            event.target.value
                          )
                        }
                        disabled={alarmActionId === String(rule.id)}
                      />

                      <select
                        value={editDraft.severity}
                        onChange={(event) =>
                          updateAlarmEditDraft(
                            rule.id,
                            'severity',
                            event.target.value
                          )
                        }
                        disabled={alarmActionId === String(rule.id)}
                      >
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                      </select>

                      <button
                        type="button"
                        className="save-btn compact-rule-btn"
                        onClick={() => handleUpdateAlarm(rule)}
                        disabled={alarmActionId === String(rule.id)}
                      >
                        Save
                      </button>

                      <button
                        type="button"
                        className="delete-btn compact-rule-btn"
                        onClick={() => handleDeleteAlarm(rule.id)}
                        disabled={alarmActionId === String(rule.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )
                })}

                {canAddAlarm && (
                  <div className="metric-alarm-row metric-alarm-create-row">
                    <select
                      value={newAlarmDraft.operator}
                      onChange={(event) =>
                        updateNewAlarmDraft(
                          metricKey,
                          'operator',
                          event.target.value
                        )
                      }
                      disabled={alarmActionId === `new-${metricKey}`}
                    >
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<=">&lt;=</option>
                    </select>

                    <input
                      type="number"
                      step="0.1"
                      value={newAlarmDraft.threshold}
                      placeholder="Threshold"
                      onChange={(event) =>
                        updateNewAlarmDraft(
                          metricKey,
                          'threshold',
                          event.target.value
                        )
                      }
                      disabled={alarmActionId === `new-${metricKey}`}
                    />

                    <select
                      value={newAlarmDraft.severity}
                      onChange={(event) =>
                        updateNewAlarmDraft(
                          metricKey,
                          'severity',
                          event.target.value
                        )
                      }
                      disabled={alarmActionId === `new-${metricKey}`}
                    >
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>

                    <button
                      type="button"
                      className="ghost-button metric-add-alarm-btn"
                      onClick={() => handleCreateAlarm(metricKey)}
                      disabled={alarmActionId === `new-${metricKey}`}
                    >
                      + Add Alarm
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="metric-config-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={handleReset}
          disabled={loading || saving}
        >
          <RotateCcw size={16} />
          Reset
        </button>

        <button
          type="button"
          className="save-btn metric-save-btn"
          onClick={handleSave}
          disabled={loading || saving}
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Display'}
        </button>
      </div>
    </section>
  )
}
