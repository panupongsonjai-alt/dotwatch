import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useDeviceMetrics } from '../hooks/useDeviceMetrics'
import { createBlankMetric } from '../utils/metricDisplayConfig'
import { METRIC_ICON_OPTIONS, MetricIcon } from '../utils/metricIcons'
import { confirmDeleteAction } from '../utils/typedConfirm'
import { showErrorToast, showSuccessToast } from '../utils/uiFeedback'
import UnifiedSelect from './common/UnifiedSelect.jsx'

const ALARM_OPERATORS = ['>', '>=', '<', '<=', '=']
const ALARM_SEVERITIES = ['warning', 'critical']

const DECIMAL_PLACE_OPTIONS = [0, 1, 2, 3, 4, 5, 6]

function isThresholdEmpty(value) {
  return value === '' || value == null
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

function createNextMetricKey(metrics = []) {
  const usedKeys = new Set(
    metrics
      .map((metric) => String(metric.metric_key || '').trim())
      .filter(Boolean)
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
    const severity = String(rule.severity || 'warning')
      .trim()
      .toLowerCase()

    if (!metricKey || !ALARM_SEVERITIES.includes(severity)) return collection

    if (!collection[metricKey]) {
      collection[metricKey] = {}
    }

    const currentRule = collection[metricKey][severity]

    if (
      !currentRule ||
      getRuleSortValue(rule) >= getRuleSortValue(currentRule)
    ) {
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
          (existingRule ? existingRule.is_active !== false : false),
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
    const severity = String(rule.severity || 'warning')
      .trim()
      .toLowerCase()

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

function MetricIconPicker({ value, disabled, isOpen, onOpenChange, onChange }) {
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
        aria-label="Select value icon"
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
  const [alarmMessageTone, setAlarmMessageTone] = useState('info')
  const alarmDraftDeviceIdRef = useRef(null)

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
    const deviceChanged =
      String(alarmDraftDeviceIdRef.current || '') !== String(deviceId || '')

    alarmDraftDeviceIdRef.current = deviceId || null

    setAlarmDrafts((currentDrafts) =>
      createAlarmDrafts(
        draftMetrics,
        rulesByMetricAndSeverity,
        deviceChanged ? {} : currentDrafts
      )
    )
  }, [deviceId, draftMetrics, rulesByMetricAndSeverity])

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
    setAlarmDrafts({})
    setAlarmMessage('')
    setAlarmMessageTone('info')
  }, [deviceId])

  const busy = loading || saving || alarmSaving || savingAll

  function clearAlarmFeedback() {
    setAlarmMessage('')
    setAlarmMessageTone('info')
  }

  function addMetric() {
    setOpenIconPickerKey(null)
    clearAlarmFeedback()
    setDraftMetrics((currentMetrics = []) => {
      const nextMetric = {
        ...createBlankMetric(currentMetrics.length),
        metric_key: createNextMetricKey(currentMetrics),
      }

      return reindexMetrics([...currentMetrics, nextMetric])
    })
  }

  async function removeMetric(indexToRemove) {
    const metric = draftMetrics[indexToRemove]
    const ok = await confirmDeleteAction({
      title: 'Confirm Delete Value',
      targetName:
        metric?.metric_name ||
        metric?.metric_key ||
        `Value ${indexToRemove + 1}`,
      description:
        'Value นี้จะถูกลบออกจากรายการ Draft กรุณาพิมพ์ Delete เพื่อยืนยัน',
    })

    if (!ok) return

    setOpenIconPickerKey(null)
    clearAlarmFeedback()
    setDraftMetrics((currentMetrics = []) =>
      reindexMetrics(
        currentMetrics.filter((_, index) => index !== indexToRemove)
      )
    )
  }

  function updateMetric(index, key, value) {
    clearAlarmFeedback()
    setDraftMetrics((currentMetrics = []) =>
      updateMetricList(currentMetrics, index, key, value)
    )
  }

  function updateAlarmDraft(metricKey, severity, key, value) {
    clearAlarmFeedback()
    setAlarmDrafts((currentDrafts) => {
      const currentRule = currentDrafts?.[metricKey]?.[severity] || {}
      const nextRule = {
        ...currentRule,
        metric: metricKey,
        severity,
        [key]: value,
      }

      if (
        key === 'threshold' &&
        !isThresholdEmpty(value) &&
        !currentRule.id &&
        isThresholdEmpty(currentRule.threshold)
      ) {
        nextRule.is_active = true
      }

      return {
        ...currentDrafts,
        [metricKey]: {
          ...currentDrafts[metricKey],
          [severity]: nextRule,
        },
      }
    })
  }

  function updateAlarmActive(metricKey, severity, checked) {
    const draft = alarmDrafts?.[metricKey]?.[severity]

    if (checked && isThresholdEmpty(draft?.threshold)) {
      setAlarmMessage('กรุณากรอก Threshold ก่อนเปิดใช้งาน Alarm')
      setAlarmMessageTone('error')
      return
    }

    updateAlarmDraft(metricKey, severity, 'is_active', checked)
  }

  async function handleReset() {
    setOpenIconPickerKey(null)
    setAlarmDrafts({})
    clearAlarmFeedback()
    await resetMetrics()
  }

  function collectAlarmDraftsForSave(metrics) {
    const operations = []

    for (const metric of metrics) {
      const metricKey = metric.metric_key
      if (!metricKey) continue

      for (const severity of ALARM_SEVERITIES) {
        const draft = alarmDrafts?.[metricKey]?.[severity]
        if (!draft) continue

        const thresholdIsEmpty = isThresholdEmpty(draft.threshold)

        if (thresholdIsEmpty) {
          if (draft.id) {
            operations.push({
              id: draft.id,
              metric: metricKey,
              severity,
              delete: true,
            })
          }

          continue
        }

        const threshold = Number(draft.threshold)

        if (!Number.isFinite(threshold)) {
          const severityLabel = severity === 'critical' ? 'Critical' : 'Warning'
          const metricLabel =
            metric.metric_name || metric.metric_key || 'Value'

          throw new Error(
            `กรุณากรอก Threshold ของ ${metricLabel} / ${severityLabel} ให้ถูกต้อง`
          )
        }

        operations.push({
          id: draft.id || null,
          metric: metricKey,
          operator: draft.operator || '>',
          threshold,
          severity,
          is_active: draft.is_active !== false,
          notification_message: String(draft.notification_message || '').trim(),
        })
      }
    }

    return operations
  }

  async function handleSave() {
    setOpenIconPickerKey(null)
    clearAlarmFeedback()

    const normalizedMetrics = reindexMetrics(draftMetrics)
    let operations = []

    try {
      operations = collectAlarmDraftsForSave(normalizedMetrics)
    } catch (error) {
      const errorMessage = error.message || 'ตรวจสอบ Alarm Rules ไม่สำเร็จ'
      setAlarmMessage(errorMessage)
      setAlarmMessageTone('error')
      showErrorToast(errorMessage)
      return
    }

    setSavingAll(true)
    setAlarmMessage('กำลังบันทึก Value และ Alarm Rules...')
    setAlarmMessageTone('info')

    try {
      const metricSaved = await saveDraftMetrics(normalizedMetrics)

      if (!metricSaved) {
        throw new Error(
          'บันทึก Value ไม่สำเร็จ จึงยังไม่ได้บันทึก Alarm Rules'
        )
      }

      let canonicalRules = []

      if (typeof onSaveMetricAlarms === 'function') {
        const saveResult = await onSaveMetricAlarms(deviceId, operations)

        if (!saveResult?.success) {
          throw new Error(
            saveResult?.error || 'บันทึก Alarm Rules ทั้งหมดไม่สำเร็จ'
          )
        }

        canonicalRules = Array.isArray(saveResult.rules) ? saveResult.rules : []
      } else {
        for (const draft of operations.filter((item) => !item.delete)) {
          const saveAlarm = draft.id ? onUpdateMetricAlarm : onCreateMetricAlarm

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

      if (canonicalRules.length > 0 || operations.some((item) => item.delete)) {
        const canonicalByMetric = buildRulesByMetricAndSeverity(canonicalRules)
        setAlarmDrafts(
          createAlarmDrafts(normalizedMetrics, canonicalByMetric, {})
        )
      } else {
        setAlarmDrafts((currentDrafts) =>
          mergeSavedAlarmRuleIds(currentDrafts, canonicalRules)
        )
      }

      const activeRuleCount = canonicalRules.filter(
        (rule) => rule.is_active !== false
      ).length

      const successMessage = `บันทึกสำเร็จ: ${normalizedMetrics.length} Values และ ${activeRuleCount} Active Alarm Rules`
      setAlarmMessage(successMessage)
      setAlarmMessageTone('success')
      showSuccessToast(successMessage)
    } catch (error) {
      console.error(error)
      const errorMessage = error.message || 'บันทึกการตั้งค่าไม่สำเร็จ'
      setAlarmMessage(errorMessage)
      setAlarmMessageTone('error')
      showErrorToast(errorMessage)
    } finally {
      setSavingAll(false)
    }
  }

  const visibleMetricCount = draftMetrics.filter(
    (metric) => metric.visible !== false
  ).length

  const activeAlarmRuleCount = draftMetrics.reduce((total, metric, index) => {
    const metricKey = metric.metric_key || `metric_${index + 1}`
    const metricDrafts = alarmDrafts?.[metricKey] || {}

    return (
      total +
      ALARM_SEVERITIES.filter((severity) => {
        const draft = metricDrafts[severity]
        return draft && !isThresholdEmpty(draft.threshold) && draft.is_active !== false
      }).length
    )
  }, 0)

  const panelMessage = alarmMessage || message

  return (
    <section className="metric-config-panel metric-config-panel-v2 metric-config-panel-easy metric-config-panel-clean metric-alarm-combined-panel metric-alarm-combined-panel-refined metric-alarm-reference-layout">
      <div className="metric-config-toolbar metric-config-toolbar-redesign">
        <div className="metric-config-toolbar-main">
          <div className="metric-config-toolbar-title">
            <span className="page-eyebrow">Value Configuration</span>
            <h3>Display Fields & Alarm Rules</h3>
            <p className="metric-config-helper">
              กำหนดข้อมูลที่แสดงผล และตั้ง Warning หรือ Critical Threshold ของแต่ละ Value
            </p>
          </div>

          <div className="metric-config-toolbar-summary" aria-label="Value configuration summary">
            <span>
              <strong>{draftMetrics.length}</strong>
              Values
            </span>
            <span>
              <strong>{visibleMetricCount}</strong>
              Visible
            </span>
            <span>
              <strong>{activeAlarmRuleCount}</strong>
              Active Rules
            </span>
          </div>
        </div>

        <button
          type="button"
          className="ghost-button metric-config-add-btn"
          onClick={addMetric}
          disabled={busy}
        >
          <Plus size={16} />
          Add Value
        </button>
      </div>

      {panelMessage && (
        <div
          className={`metric-config-message ${
            alarmMessage ? alarmMessageTone : 'info'
          }`}
          role={alarmMessageTone === 'error' ? 'alert' : 'status'}
        >
          {panelMessage}
        </div>
      )}

      {loading ? (
        <div className="app-empty-state">
          <h3>กำลังโหลด Value</h3>
          <p>กำลังดึง Value และ Alarm configuration ของ Device นี้</p>
        </div>
      ) : draftMetrics.length === 0 ? (
        <div className="app-empty-state">
          <h3>ยังไม่มี Value</h3>
          <p>กด Add Value เพื่อเพิ่มค่าที่ต้องการแสดงผล</p>
        </div>
      ) : (
        <div className="metric-alarm-config-table">
          <div className="metric-alarm-config-head" aria-hidden="true">
            <span className="metric-alarm-head-name">Value Name</span>
            <span className="metric-alarm-head-unit">Unit</span>
            <span className="metric-alarm-head-decimals">Decimals</span>
            <span className="metric-alarm-head-icon">Icon</span>
            <span className="metric-alarm-head-display">Display</span>
          </div>

          <div className="metric-alarm-config-body">
            {draftMetrics.map((metric, index) => {
              const metricKey = metric.metric_key || `metric_${index + 1}`
              const metricLabel =
                metric.metric_name || metricKey || `Value ${index + 1}`
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
                  <div className="metric-alarm-config-metric-row">
                    <label className="metric-alarm-config-field metric-alarm-config-name">
                      <span>Value Name</span>
                      <input
                        value={metric.metric_name || ''}
                        placeholder={`เช่น ${
                          index === 0 ? 'Temperature' : 'Value Name'
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

                    <label className="metric-alarm-config-field metric-alarm-config-decimals">
                      <span>Decimals</span>
                      <UnifiedSelect
                        value={Number(metric.decimal_places ?? 2)}
                        onChange={(event) =>
                          updateMetric(
                            index,
                            'decimal_places',
                            Number(event.target.value)
                          )
                        }
                        disabled={busy}
                        aria-label={`${metricLabel} decimal places`}
                      >
                        {DECIMAL_PLACE_OPTIONS.map((decimalPlaces) => (
                          <option key={decimalPlaces} value={decimalPlaces}>
                            {decimalPlaces}
                          </option>
                        ))}
                      </UnifiedSelect>
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
                            updateMetric(index, 'visible', event.target.checked)
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
                        is_active: false,
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
                            <UnifiedSelect
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
                            </UnifiedSelect>
                          </label>

                          <label className="metric-alarm-config-control metric-alarm-config-threshold">
                            <span>
                              Threshold{metric.unit ? ` (${metric.unit})` : ''}
                            </span>
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
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
                                  updateAlarmActive(
                                    metricKey,
                                    severity,
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
                      <span>Delete Value</span>
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
