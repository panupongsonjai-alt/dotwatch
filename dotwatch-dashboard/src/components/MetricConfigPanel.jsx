import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDeviceMetrics } from '../hooks/useDeviceMetrics'
import { createBlankMetric } from '../utils/metricDisplayConfig'
import { METRIC_ICON_OPTIONS, MetricIcon } from '../utils/metricIcons'

const DEFAULT_ALARM_DRAFT = {
  metric: '',
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
    sort_order: index + 1,
  }))
}

function getMetricLabel(metric) {
  if (!metric) return 'Unknown Metric'
  return metric.unit
    ? `${metric.metric_name} (${metric.unit})`
    : metric.metric_name
}

function getRuleMetricName(metrics, metricKey) {
  const metric = metrics.find((item) => item.metric_key === metricKey)
  return metric?.metric_name || metricKey || '--'
}

export default function MetricConfigPanel({
  deviceId,
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

  const [alarmDraft, setAlarmDraft] = useState(DEFAULT_ALARM_DRAFT)
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [editingDraft, setEditingDraft] = useState(DEFAULT_ALARM_DRAFT)
  const [alarmSaving, setAlarmSaving] = useState(false)

  const visibleMetrics = draftMetrics
    .filter(
      (metric) =>
        metric.visible !== false && String(metric.metric_name || '').trim()
    )
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))

  function addMetric() {
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
    const success = await saveDraftMetrics(reindexMetrics(draftMetrics))

    if (success !== false) {
      window.dispatchEvent(
        new CustomEvent('dotwatchMetricConfigChanged', {
          detail: { deviceId },
        })
      )
    }

    return success
  }

  async function handleCreateAlarm() {
    const selectedMetric = alarmDraft.metric || visibleMetrics[0]?.metric_key

    if (!selectedMetric) {
      alert('กรุณาเลือก Metric')
      return
    }

    if (
      alarmDraft.threshold === '' ||
      Number.isNaN(Number(alarmDraft.threshold))
    ) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    try {
      setAlarmSaving(true)

      await onCreateAlarm?.(selectedMetric, {
        metric: selectedMetric,
        operator: alarmDraft.operator || '>',
        threshold: Number(alarmDraft.threshold),
        severity: alarmDraft.severity || 'warning',
      })

      setAlarmDraft(DEFAULT_ALARM_DRAFT)
    } finally {
      setAlarmSaving(false)
    }
  }

  function startEditRule(rule) {
    setEditingRuleId(rule.id)
    setEditingDraft({
      metric: rule.metric || visibleMetrics[0]?.metric_key || '',
      operator: rule.operator || '>',
      threshold: rule.threshold ?? '',
      severity: rule.severity || 'warning',
      is_active: rule.is_active,
      device_id: rule.device_id,
    })
  }

  function cancelEditRule() {
    setEditingRuleId(null)
    setEditingDraft(DEFAULT_ALARM_DRAFT)
  }

  async function handleUpdateRule(rule) {
    if (
      editingDraft.threshold === '' ||
      Number.isNaN(Number(editingDraft.threshold))
    ) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    try {
      setAlarmSaving(true)

      await onUpdateAlarm?.(rule.id, {
        device_id: rule.device_id || deviceId,
        metric: editingDraft.metric,
        operator: editingDraft.operator || '>',
        threshold: Number(editingDraft.threshold),
        severity: editingDraft.severity || 'warning',
        is_active: editingDraft.is_active,
      })

      cancelEditRule()
    } finally {
      setAlarmSaving(false)
    }
  }

  const isBusy = loading || saving || alarmSaving

  return (
    <section className="metric-config-panel">
      <div className="metric-config-header">
        <div>
          <h4>Metric Display</h4>
          <p>ตั้งชื่อ หน่วย และไอคอนของค่าที่จะแสดงในทุกหน้า</p>
        </div>

        <button
          type="button"
          className="ghost-button"
          onClick={addMetric}
          disabled={isBusy}
        >
          <Plus size={16} />
          Add Metric
        </button>
      </div>

      {message && <div className="metric-config-message">{message}</div>}

      <div className="metric-config-table">
        <div className="metric-config-table-head">
          <span>Metric Name</span>
          <span>Unit</span>
          <span>Icon</span>
          <span>Visible</span>
          <span />
        </div>

        {draftMetrics.map((metric, index) => (
          <div
            className="metric-config-row"
            key={metric.id ? `metric-${metric.id}` : `metric-${index}`}
          >
            <input
              value={metric.metric_name || ''}
              placeholder={`เช่น ${index === 0 ? 'CPU Temp' : 'Metric Name'}`}
              onChange={(event) =>
                updateMetric(index, 'metric_name', event.target.value)
              }
              disabled={isBusy}
            />

            <input
              value={metric.unit || ''}
              placeholder="เช่น °C, %, kWh"
              onChange={(event) =>
                updateMetric(index, 'unit', event.target.value)
              }
              disabled={isBusy}
            />

            <select
              value={metric.icon || 'Activity'}
              onChange={(event) =>
                updateMetric(index, 'icon', event.target.value)
              }
              disabled={isBusy}
            >
              {METRIC_ICON_OPTIONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>

            <label className="metric-visible-toggle">
              <input
                type="checkbox"
                checked={metric.visible !== false}
                onChange={(event) =>
                  updateMetric(index, 'visible', event.target.checked)
                }
                disabled={isBusy}
              />
              Show
            </label>

            <button
              type="button"
              className="delete-btn square"
              onClick={() => removeMetric(index)}
              disabled={isBusy}
              title="Delete metric"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {visibleMetrics.length > 0 && (
        <div className="metric-config-preview">
          {visibleMetrics.map((metric, index) => (
            <span
              key={`${metric.metric_key || `metric_${index + 1}`}-${index}`}
            >
              <MetricIcon name={metric.icon} size={14} />
              {metric.metric_name}
              {metric.unit ? ` (${metric.unit})` : ''}
            </span>
          ))}
        </div>
      )}

      <div className="metric-config-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={handleReset}
          disabled={isBusy}
        >
          <RotateCcw size={16} />
          Reset
        </button>

        <button
          type="button"
          className="save-btn metric-save-btn"
          onClick={handleSave}
          disabled={isBusy}
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Display'}
        </button>
      </div>

      <div className="device-alarm-rule-section">
        <div className="device-location-header">
          <strong>Alarm Rules</strong>
          <span>ตั้งค่า Alarm เฉพาะ Device นี้จาก Metric จริง</span>
        </div>

        <div className="alarm-rule-create-row">
          <select
            value={alarmDraft.metric || visibleMetrics[0]?.metric_key || ''}
            disabled={isBusy || visibleMetrics.length === 0}
            onChange={(event) =>
              setAlarmDraft((prev) => ({
                ...prev,
                metric: event.target.value,
              }))
            }
          >
            {visibleMetrics.length === 0 ? (
              <option value="">No metric</option>
            ) : (
              visibleMetrics.map((metric) => (
                <option key={metric.metric_key} value={metric.metric_key}>
                  {getMetricLabel(metric)}
                </option>
              ))
            )}
          </select>

          <select
            value={alarmDraft.operator}
            disabled={isBusy}
            onChange={(event) =>
              setAlarmDraft((prev) => ({
                ...prev,
                operator: event.target.value,
              }))
            }
          >
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&gt;=</option>
            <option value="<=">&lt;=</option>
            <option value="=">=</option>
          </select>

          <input
            type="number"
            value={alarmDraft.threshold}
            disabled={isBusy}
            placeholder="Threshold"
            onChange={(event) =>
              setAlarmDraft((prev) => ({
                ...prev,
                threshold: event.target.value,
              }))
            }
          />

          <select
            value={alarmDraft.severity}
            disabled={isBusy}
            onChange={(event) =>
              setAlarmDraft((prev) => ({
                ...prev,
                severity: event.target.value,
              }))
            }
          >
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>

          <button
            type="button"
            className="save-btn"
            disabled={isBusy || visibleMetrics.length === 0}
            onClick={handleCreateAlarm}
          >
            Add Rule
          </button>
        </div>

        <div className="device-alarm-rule-list">
          {alarmRules.length === 0 ? (
            <p className="alarm-rule-empty">ยังไม่มี Alarm Rule</p>
          ) : (
            alarmRules.map((rule) => {
              const isEditing = editingRuleId === rule.id

              return (
                <div key={rule.id} className="device-alarm-rule-item">
                  {isEditing ? (
                    <>
                      <select
                        value={editingDraft.metric}
                        disabled={isBusy}
                        onChange={(event) =>
                          setEditingDraft((prev) => ({
                            ...prev,
                            metric: event.target.value,
                          }))
                        }
                      >
                        {visibleMetrics.map((metric) => (
                          <option
                            key={metric.metric_key}
                            value={metric.metric_key}
                          >
                            {getMetricLabel(metric)}
                          </option>
                        ))}
                      </select>

                      <select
                        value={editingDraft.operator}
                        disabled={isBusy}
                        onChange={(event) =>
                          setEditingDraft((prev) => ({
                            ...prev,
                            operator: event.target.value,
                          }))
                        }
                      >
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="=">=</option>
                      </select>

                      <input
                        type="number"
                        value={editingDraft.threshold}
                        disabled={isBusy}
                        onChange={(event) =>
                          setEditingDraft((prev) => ({
                            ...prev,
                            threshold: event.target.value,
                          }))
                        }
                      />

                      <select
                        value={editingDraft.severity}
                        disabled={isBusy}
                        onChange={(event) =>
                          setEditingDraft((prev) => ({
                            ...prev,
                            severity: event.target.value,
                          }))
                        }
                      >
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                      </select>

                      <button
                        type="button"
                        className="save-btn square"
                        disabled={isBusy}
                        onClick={() => handleUpdateRule(rule)}
                      >
                        <Save size={16} />
                      </button>

                      <button
                        type="button"
                        className="cancel-btn square"
                        disabled={isBusy}
                        onClick={cancelEditRule}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <>
                      <strong>
                        {getRuleMetricName(visibleMetrics, rule.metric)}{' '}
                        {rule.operator} {rule.threshold}
                      </strong>

                      <span className={`status ${rule.severity}`}>
                        {rule.severity}
                      </span>

                      <span
                        className={
                          rule.is_active ? 'status online' : 'status offline'
                        }
                      >
                        {rule.is_active ? 'Active' : 'Disabled'}
                      </span>

                      <div className="alarm-rule-actions">
                        <button
                          type="button"
                          className="rename-btn"
                          disabled={isBusy}
                          onClick={() => startEditRule(rule)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="delete-btn"
                          disabled={isBusy}
                          onClick={() => onDeleteAlarm?.(rule.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}
