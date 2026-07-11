import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Save, Trash2 } from 'lucide-react'
import { useDeviceMetrics } from '../hooks/useDeviceMetrics'
import { createBlankMetric } from '../utils/metricDisplayConfig'
import { METRIC_ICON_OPTIONS, MetricIcon } from '../utils/metricIcons'
import { confirmDeleteAction } from '../utils/typedConfirm'

const ALARM_OPERATORS = ['>', '>=', '<', '<=', '=']
const ALARM_SEVERITIES = ['warning', 'critical']

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

function createNextMetricKey(metrics = []) {
  const usedKeys = new Set(
    metrics.map((metric) => String(metric.metric_key || '').trim()).filter(Boolean)
  )
  let candidateIndex = 1

  while (usedKeys.has(`metric_${candidateIndex}`)) {
    candidateIndex += 1
  }

  return `metric_${candidateIndex}`
}

function getRuleSortValue(rule = {}) {
  const updatedAt = new Date(rule.updated_at || rule.updatedAt || 0).getTime()

  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    return updatedAt
  }

  return Number(rule.id) || 0
}

function buildRulesByMetricAndSeverity(alarmRules = []) {
  return alarmRules.reduce((collection, rule) => {
    const metricKey = String(rule.metric || rule.metric_key || '').trim()
    const severity = String(rule.severity || 'warning').trim().toLowerCase()

    if (!metricKey || !ALARM_SEVERITIES.includes(severity)) return collection

    if (!collection[metricKey]) {
      collection[metricKey] = {}
    }

    const currentRule = collection[metricKey][severity]

    if (!currentRule || getRuleSortValue(rule) >= getRuleSortValue(currentRule)) {
      collection[metricKey][severity] = rule
    }

    return collection
  }, {})
}

function createAlarmDrafts(
  metrics = [],
  rulesByMetricAndSeverity = {},
  currentDrafts = {}
) {
  const nextDrafts = {}

  metrics.forEach((metric) => {
    const metricKey = metric.metric_key
    if (!metricKey) return

    const metricRules = rulesByMetricAndSeverity[metricKey] || {}
    nextDrafts[metricKey] = {}

    ALARM_SEVERITIES.forEach((severity) => {
      const existingRule = metricRules[severity]
      const currentDraft = currentDrafts?.[metricKey]?.[severity]

      nextDrafts[metricKey][severity] = {
        id: existingRule?.id || currentDraft?.id || null,
        metric: metricKey,
        operator:
          currentDraft?.operator ||
          existingRule?.operator ||
          (severity === 'critical' ? '>' : '>='),
        threshold: currentDraft?.threshold ?? existingRule?.threshold ?? '',
        severity,
        is_active:
          currentDraft?.is_active ??
          (existingRule ? existingRule.is_active !== false : true),
        notification_message:
          currentDraft?.notification_message ??
          existingRule?.notification_message ??
          '',
      }
    })
  })

  return nextDrafts
}

function mergeSavedAlarmRuleIds(currentDrafts = {}, savedRules = []) {
  if (!Array.isArray(savedRules) || savedRules.length === 0) {
    return currentDrafts
  }

  const nextDrafts = { ...currentDrafts }

  savedRules.forEach((rule) => {
    const metricKey = String(rule.metric || rule.metric_key || '').trim()
    const severity = String(rule.severity || 'warning').trim().toLowerCase()

    if (!metricKey || !ALARM_SEVERITIES.includes(severity)) return

    nextDrafts[metricKey] = {
      ...nextDrafts[metricKey],
      [severity]: {
        ...nextDrafts[metricKey]?.[severity],
        ...rule,
        id: rule.id || nextDrafts[metricKey]?.[severity]?.id || null,
        metric: metricKey,
        severity,
        notification_message: rule.notification_message || '',
        is_active: rule.is_active !== false,
      },
    }
  })

  return nextDrafts
}

function MetricIconPicker({
  value,
  disabled,
  isOpen,
  onOpenChange,
  onChange,
}) {
  const selectedIcon = value || 'Activity'
  const selectedOptionRef = useRef(null)

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined

    const frameId = window.requestAnimationFrame(() => {
      selectedOptionRef.current?.scrollIntoView({
        block: 'nearest',
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [isOpen, selectedIcon])

  function handleSummaryClick(event) {
    event.preventDefault()
    if (disabled) return
    onOpenChange(!isOpen)
  }

  function handleSelect(iconName) {
    if (disabled) return

    onChange(iconName)
    onOpenChange(false)
  }

  return (
    <details className="metric-icon-dropdown" open={isOpen}>
      <summary
        className="metric-icon-dropdown-summary"
        aria-label="Select metric icon"
        aria-expanded={isOpen}
        onClick={handleSummaryClick}
      >
        <span className="metric-icon-dropdown-current">
          <MetricIcon name={selectedIcon} size={16} />
          <span>{selectedIcon}</span>
        </span>
      </summary>

      <div className="metric-icon-dropdown-menu" role="listbox">
        {METRIC_ICON_OPTIONS.map((iconName) => {
          const isActive = selectedIcon === iconName

          return (
            <button
              key={iconName}
              ref={isActive ? selectedOptionRef : null}
              type="button"
              role="option"
              aria-selected={isActive}
              className={
                isActive
                  ? 'metric-icon-dropdown-option active'
                  : 'metric-icon-dropdown-option'
              }
              onClick={() => handleSelect(iconName)}
              disabled={disabled}
            >
              <MetricIcon name={iconName} size={16} />
              <span>{iconName}</span>
            </button>
          )
        })}
      </div>
    </details>
  )
}

export default function MetricConfigPanel({
  deviceId,
  alarmRules = [],
  alarmSaving = false,
  onSaveMetricAlarms,
  onCreateMetricAlarm,
  onUpdateMetricAlarm,
}) {
  const [openIconPickerKey, setOpenIconPickerKey] = useState(null)
  const [alarmDrafts, setAlarmDrafts] = useState({})
  const [savingAll, setSavingAll] = useState(false)
  const [alarmMessage, setAlarmMessage] = useState('')

  const {
    draftMetrics = [],
    setDraftMetrics,
    loading,
    saving,
    message,
    saveDraftMetrics,
    resetMetrics,
  } = useDeviceMetrics(deviceId)

  const rulesByMetricAndSeverity = useMemo(
    () => buildRulesByMetricAndSeverity(alarmRules),
    [alarmRules]
  )

  useEffect(() => {
    setAlarmDrafts((currentDrafts) =>
      createAlarmDrafts(
        draftMetrics,
        rulesByMetricAndSeverity,
        currentDrafts
      )
    )
  }, [draftMetrics, rulesByMetricAndSeverity])

  useEffect(() => {
    if (!openIconPickerKey) return undefined

    function closePickerFromOutside(event) {
      if (!event.target.closest('.metric-icon-dropdown')) {
        setOpenIconPickerKey(null)
      }
    }

    function closePickerFromEscape(event) {
      if (event.key === 'Escape') {
        setOpenIconPickerKey(null)
      }
    }

    document.addEventListener('pointerdown', closePickerFromOutside)
    document.addEventListener('keydown', closePickerFromEscape)

    return () => {
      document.removeEventListener('pointerdown', closePickerFromOutside)
      document.removeEventListener('keydown', closePickerFromEscape)
    }
  }, [openIconPickerKey])

  useEffect(() => {
    setOpenIconPickerKey(null)
    setAlarmMessage('')
  }, [deviceId])

  const busy = loading || saving || alarmSaving || savingAll

  function addMetric() {
    setOpenIconPickerKey(null)
    setAlarmMessage('')
    setDraftMetrics((currentMetrics = []) => {
      const nextMetric = {
        ...createBlankMetric(currentMetrics.length),
        metric_key: createNextMetricKey(currentMetrics),
      }

      return reindexMetrics([...currentMetrics, nextMetric])
    })
  }

  function removeMetric(indexToRemove) {
    const metric = draftMetrics[indexToRemove]
    const ok = confirmDeleteAction({
      title: 'Confirm Delete Metric',
      targetName:
        metric?.metric_name ||
        metric?.metric_key ||
        `Metric ${indexToRemove + 1}`,
      description:
        'Metric นี้จะถูกลบออกจากรายการ Draft กรุณาพิมพ์ delete เพื่อยืนยัน',
    })

    if (!ok) return

    setOpenIconPickerKey(null)
    setAlarmMessage('')
    setDraftMetrics((currentMetrics = []) =>
      reindexMetrics(
        currentMetrics.filter((_, index) => index !== indexToRemove)
      )
    )
  }

  function updateMetric(index, key, value) {
    setAlarmMessage('')
    setDraftMetrics((currentMetrics = []) =>
      updateMetricList(currentMetrics, index, key, value)
    )
  }

  function updateAlarmDraft(metricKey, severity, key, value) {
    setAlarmMessage('')
    setAlarmDrafts((currentDrafts) => ({
      ...currentDrafts,
      [metricKey]: {
        ...currentDrafts[metricKey],
        [severity]: {
          ...currentDrafts[metricKey]?.[severity],
          metric: metricKey,
          severity,
          [key]: value,
        },
      },
    }))
  }

  async function handleReset() {
    setOpenIconPickerKey(null)
    setAlarmDrafts({})
    setAlarmMessage('')
    await resetMetrics()
  }

  function collectAlarmDraftsForSave(metrics) {
    const draftsToSave = []

    for (const metric of metrics) {
      const metricKey = metric.metric_key
      if (!metricKey) continue

      for (const severity of ALARM_SEVERITIES) {
        const draft = alarmDrafts?.[metricKey]?.[severity]
        if (!draft) continue

        const thresholdIsEmpty =
          draft.threshold === '' || draft.threshold == null

        if (thresholdIsEmpty && !draft.id) {
          continue
        }

        if (thresholdIsEmpty || Number.isNaN(Number(draft.threshold))) {
          const severityLabel =
            severity === 'critical' ? 'Critical' : 'Warning'
          const metricLabel =
            metric.metric_name || metric.metric_key || 'Metric'

          throw new Error(
            `กรุณากรอก Threshold ของ ${metricLabel} / ${severityLabel} ให้ถูกต้อง`
          )
        }

        draftsToSave.push({
          id: draft.id || null,
          metric: metricKey,
          operator: draft.operator || '>',
          threshold: Number(draft.threshold),
          severity,
          is_active: draft.is_active !== false,
          notification_message: String(
            draft.notification_message || ''
          ).trim(),
        })
      }
    }

    return draftsToSave
  }

  async function handleSave() {
    setOpenIconPickerKey(null)
    setAlarmMessage('')

    const normalizedMetrics = reindexMetrics(draftMetrics)
    let draftsToSave = []

    try {
      draftsToSave = collectAlarmDraftsForSave(normalizedMetrics)
    } catch (error) {
      setAlarmMessage(error.message)
      return
    }

    setSavingAll(true)

    try {
      const metricSaved = await saveDraftMetrics(normalizedMetrics)

      if (!metricSaved) {
        throw new Error('บันทึก Metric ไม่สำเร็จ จึงยังไม่ได้บันทึก Alarm Rules')
      }

      if (typeof onSaveMetricAlarms === 'function') {
        const saveResult = await onSaveMetricAlarms(deviceId, draftsToSave)

        if (!saveResult?.success) {
          throw new Error(
            saveResult?.error || 'บันทึก Alarm Rules ทั้งหมดไม่สำเร็จ'
          )
        }

        setAlarmDrafts((currentDrafts) =>
          mergeSavedAlarmRuleIds(currentDrafts, saveResult.rules)
        )
      } else {
        for (const draft of draftsToSave) {
          const saveAlarm = draft.id
            ? onUpdateMetricAlarm
            : onCreateMetricAlarm

          if (typeof saveAlarm !== 'function') {
            throw new Error('ไม่พบฟังก์ชันสำหรับบันทึก Alarm Rules')
          }

          const result = draft.id
            ? await saveAlarm(draft.id, draft)
            : await saveAlarm(deviceId, draft.metric, draft)

          const succeeded = result === true || result?.success === true

          if (!succeeded) {
            throw new Error(
              result?.error ||
                `บันทึก Alarm ${draft.severity} ของ ${draft.metric} ไม่สำเร็จ`
            )
          }
        }
      }

      setAlarmMessage(
        `บันทึกการตั้งค่าทั้งหมดแล้ว: ${normalizedMetrics.length} Metrics และ ${draftsToSave.length} Alarm Rules`
      )
    } catch (error) {
      console.error(error)
      setAlarmMessage(error.message || 'บันทึกการตั้งค่าไม่สำเร็จ')
    } finally {
      setSavingAll(false)
    }
  }

  const visibleMetricCount = draftMetrics.filter(
    (metric) => metric.visible !== false
  ).length

  const panelMessage = alarmMessage || message

  return (
    <section className="metric-config-panel metric-config-panel-v2 metric-config-panel-easy metric-config-panel-clean metric-alarm-combined-panel metric-alarm-combined-panel-refined">
      <div className="metric-config-toolbar">
        <div>
          <span className="page-eyebrow">Display Fields & Alarm Rules</span>
          <strong>
            {visibleMetricCount}/{draftMetrics.length} Visible
          </strong>
        </div>

        <button
          type="button"
          className="ghost-button"
          onClick={addMetric}
          disabled={busy}
        >
          Add Metric
        </button>
      </div>

      {panelMessage && (
        <div className="metric-config-message">{panelMessage}</div>
      )}

      {loading ? (
        <div className="app-empty-state">
          <h3>กำลังโหลด Metric</h3>
          <p>กำลังดึง Metric และ Alarm configuration ของ Device นี้</p>
        </div>
      ) : draftMetrics.length === 0 ? (
        <div className="app-empty-state">
          <h3>ยังไม่มี Metric</h3>
          <p>กด Add Metric เพื่อเพิ่มค่าที่ต้องการแสดงผล</p>
        </div>
      ) : (
        <div className="metric-alarm-config-table">
          <div className="metric-alarm-config-head" aria-hidden="true">
            <span className="metric-alarm-head-number">No.</span>
            <span className="metric-alarm-head-name">Metric Name</span>
            <span className="metric-alarm-head-unit">Unit</span>
            <span className="metric-alarm-head-icon">Icon</span>
            <span className="metric-alarm-head-display">Display</span>
          </div>

          <div className="metric-alarm-config-body">
            {draftMetrics.map((metric, index) => {
              const metricKey = metric.metric_key || `metric_${index + 1}`
              const metricLabel =
                metric.metric_name || metricKey || `Metric ${index + 1}`
              const pickerKey = String(
                metric.id || metricKey || `metric-${index}`
              )
              const metricDrafts = alarmDrafts?.[metricKey] || {}

              return (
                <article
                  className="metric-alarm-config-group"
                  key={metric.id ? `metric-${metric.id}` : metricKey}
                  aria-label={`Configure ${metricLabel}`}
                >
                  <div className="metric-alarm-config-index">
                    {index + 1}.
                  </div>

                  <div className="metric-alarm-config-metric-row">
                    <label className="metric-alarm-config-field metric-alarm-config-name">
                      <span>Metric Name</span>
                      <input
                        value={metric.metric_name || ''}
                        placeholder={`เช่น ${
                          index === 0 ? 'Temperature' : 'Metric Name'
                        }`}
                        onChange={(event) =>
                          updateMetric(index, 'metric_name', event.target.value)
                        }
                        disabled={busy}
                      />
                    </label>

                    <label className="metric-alarm-config-field metric-alarm-config-unit">
                      <span>Unit</span>
                      <input
                        value={metric.unit || ''}
                        placeholder="°C, %, kWh"
                        onChange={(event) =>
                          updateMetric(index, 'unit', event.target.value)
                        }
                        disabled={busy}
                      />
                    </label>

                    <div className="metric-alarm-config-field metric-alarm-config-icon">
                      <span>Icon</span>
                      <MetricIconPicker
                        value={metric.icon}
                        disabled={busy}
                        isOpen={openIconPickerKey === pickerKey}
                        onOpenChange={(nextOpen) =>
                          setOpenIconPickerKey(nextOpen ? pickerKey : null)
                        }
                        onChange={(iconName) =>
                          updateMetric(index, 'icon', iconName)
                        }
                      />
                    </div>

                    <div className="metric-alarm-config-field metric-alarm-config-display">
                      <span>Display</span>
                      <label
                        className={
                          metric.visible !== false
                            ? 'metric-visible-toggle active'
                            : 'metric-visible-toggle'
                        }
                      >
                        <input
                          type="checkbox"
                          checked={metric.visible !== false}
                          onChange={(event) =>
                            updateMetric(
                              index,
                              'visible',
                              event.target.checked
                            )
                          }
                          disabled={busy}
                        />
                        <span>
                          {metric.visible !== false ? 'Visible' : 'Hidden'}
                        </span>
                      </label>
                    </div>

                  </div>

                  <div className="metric-alarm-config-rules">
                    {ALARM_SEVERITIES.map((severity) => {
                      const draft = metricDrafts[severity] || {
                        operator: severity === 'critical' ? '>' : '>=',
                        threshold: '',
                        is_active: true,
                        notification_message: '',
                      }
                      const severityLabel =
                        severity === 'critical' ? 'Critical' : 'Warning'

                      return (
                        <div
                          key={`${metricKey}-${severity}`}
                          className={`metric-alarm-config-rule ${severity}`}
                        >
                          <div className="metric-alarm-config-severity">
                            <span className={`status ${severity}`}>
                              {severityLabel}
                            </span>
                            <small>
                              {severity === 'critical'
                                ? 'ระดับวิกฤต ต้องตรวจสอบทันที'
                                : 'ระดับเตือนล่วงหน้า'}
                            </small>
                          </div>

                          <label className="metric-alarm-config-control metric-alarm-config-condition">
                            <span>Condition</span>
                            <select
                              value={draft.operator || '>'}
                              aria-label={`${metricLabel} ${severityLabel} condition`}
                              onChange={(event) =>
                                updateAlarmDraft(
                                  metricKey,
                                  severity,
                                  'operator',
                                  event.target.value
                                )
                              }
                              disabled={busy}
                            >
                              {ALARM_OPERATORS.map((operator) => (
                                <option key={operator} value={operator}>
                                  {operator}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="metric-alarm-config-control metric-alarm-config-threshold">
                            <span>
                              Threshold{metric.unit ? ` (${metric.unit})` : ''}
                            </span>
                            <input
                              type="number"
                              value={draft.threshold}
                              placeholder="Threshold"
                              aria-label={`${metricLabel} ${severityLabel} threshold`}
                              onChange={(event) =>
                                updateAlarmDraft(
                                  metricKey,
                                  severity,
                                  'threshold',
                                  event.target.value
                                )
                              }
                              disabled={busy}
                            />
                          </label>

                          <label className="metric-alarm-config-control metric-alarm-config-message-field">
                            <span>ข้อความแจ้งเตือน</span>
                            <input
                              type="text"
                              value={draft.notification_message || ''}
                              placeholder="เช่น กรุณาตรวจสอบอุณหภูมิทันที"
                              maxLength={300}
                              aria-label={`${metricLabel} ${severityLabel} notification message`}
                              onChange={(event) =>
                                updateAlarmDraft(
                                  metricKey,
                                  severity,
                                  'notification_message',
                                  event.target.value
                                )
                              }
                              disabled={busy}
                            />
                          </label>

                          <div className="metric-alarm-config-active-field">
                            <span>Active</span>
                            <label
                              className={
                                draft.is_active !== false
                                  ? 'metric-visible-toggle alarm-active-toggle active'
                                  : 'metric-visible-toggle alarm-active-toggle'
                              }
                            >
                              <input
                                type="checkbox"
                                checked={draft.is_active !== false}
                                onChange={(event) =>
                                  updateAlarmDraft(
                                    metricKey,
                                    severity,
                                    'is_active',
                                    event.target.checked
                                  )
                                }
                                disabled={busy}
                              />
                              <span>
                                {draft.is_active !== false
                                  ? 'Active'
                                  : 'Paused'}
                              </span>
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="metric-alarm-config-action">
                    <button
                      type="button"
                      className="delete-btn metric-config-delete-btn"
                      onClick={() => removeMetric(index)}
                      disabled={busy}
                      title={`Delete ${metricLabel}`}
                      aria-label={`Delete ${metricLabel}`}
                    >
                      <Trash2 size={15} />
                      <span>Delete Metric</span>
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}

      <div className="metric-config-actions metric-config-footer-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={handleReset}
          disabled={busy}
        >
          <RotateCcw size={16} />
          Reset
        </button>

        <button
          type="button"
          className="save-btn metric-save-btn"
          onClick={handleSave}
          disabled={busy}
        >
          <Save size={16} />
          {busy ? 'Saving All...' : 'Save All Settings'}
        </button>
      </div>
    </section>
  )
}
