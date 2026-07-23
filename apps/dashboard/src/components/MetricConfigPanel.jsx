import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useDeviceMetrics } from '../hooks/useDeviceMetrics'
import { createBlankMetric } from '../utils/metricDisplayConfig'
import { METRIC_ICON_OPTIONS, MetricIcon } from '../utils/metricIcons'
import { confirmDeleteAction } from '../utils/typedConfirm'
import UnifiedSelect from './common/UnifiedSelect.jsx'

const ALARM_OPERATORS = ['>', '>=', '<', '<=', '=']
const ALARM_SEVERITIES = ['warning', 'critical']

const DECIMAL_PLACE_OPTIONS = [0, 1, 2, 3, 4, 5, 6]

const LOCKED_VALUE_MODEL_DEFINITIONS = Object.freeze({
  esp32_dht3: Object.freeze({
    modelName: 'dot-TH-W1',
    metrics: Object.freeze([
      Object.freeze({
        metric_key: 'metric_1',
        metric_name: 'Temperature',
        metric_type: 'temperature',
        unit: '°C',
        icon: 'Thermometer',
        sort_order: 0,
      }),
      Object.freeze({
        metric_key: 'metric_2',
        metric_name: 'Humidity',
        metric_type: 'humidity',
        unit: '%RH',
        icon: 'Droplets',
        sort_order: 1,
      }),
    ]),
  }),
  weather_api_demo: Object.freeze({
    modelName: 'dot-WT-W1',
    metrics: Object.freeze([
      Object.freeze({
        metric_key: 'temperature',
        metric_name: 'Temperature',
        metric_type: 'temperature',
        unit: '°C',
        icon: 'Thermometer',
        sort_order: 0,
      }),
      Object.freeze({
        metric_key: 'humidity',
        metric_name: 'Humidity',
        metric_type: 'humidity',
        unit: '%RH',
        icon: 'Droplets',
        sort_order: 1,
      }),
    ]),
  }),
})

function getLockedValueModelDefinition(modelKey = '') {
  return (
    LOCKED_VALUE_MODEL_DEFINITIONS[
      String(modelKey || '').trim().toLowerCase()
    ] || null
  )
}

function enforceLockedValueMetrics(modelKey, metrics = []) {
  const definition = getLockedValueModelDefinition(modelKey)
  if (!definition) return reindexMetrics(metrics)

  const incomingMetrics = Array.isArray(metrics) ? metrics : []

  return definition.metrics.map((canonicalMetric, index) => {
    const incoming =
      incomingMetrics.find(
        (metric) =>
          String(metric.metric_key || metric.metricKey || '').trim() ===
          canonicalMetric.metric_key
      ) || incomingMetrics[index] || {}

    return {
      ...incoming,
      ...canonicalMetric,
      source_key: canonicalMetric.metric_key,
      icon: canonicalMetric.icon,
      visible: incoming.visible !== false,
      decimal_places: Number.isInteger(Number(incoming.decimal_places))
        ? Number(incoming.decimal_places)
        : 2,
    }
  })
}

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
  modelKey = '',
  mode = 'values',
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
  const [metricListMaxHeight, setMetricListMaxHeight] = useState(null)
  const alarmDraftDeviceIdRef = useRef(null)
  const metricListRef = useRef(null)

  const {
    draftMetrics = [],
    setDraftMetrics,
    loading,
    saving,
    message,
    saveDraftMetrics,
    resetMetrics,
  } = useDeviceMetrics(deviceId)

  const lockedDefinition = getLockedValueModelDefinition(modelKey)
  const isAlarmMode = mode === 'alarms'

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
    const metricList = metricListRef.current

    if (!metricList || draftMetrics.length <= 3) {
      setMetricListMaxHeight(null)
      return undefined
    }

    const metricGroups = Array.from(
      metricList.querySelectorAll(':scope > .metric-alarm-config-group')
    ).slice(0, 3)

    if (metricGroups.length < 3) {
      setMetricListMaxHeight(null)
      return undefined
    }

    function updateMetricListHeight() {
      const styles = window.getComputedStyle(metricList)
      const gap = Number.parseFloat(styles.rowGap || styles.gap || '0') || 0
      const groupsHeight = metricGroups.reduce(
        (total, group) => total + group.getBoundingClientRect().height,
        0
      )
      const nextHeight = Math.ceil(
        groupsHeight + gap * (metricGroups.length - 1)
      )

      setMetricListMaxHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight
      )
    }

    updateMetricListHeight()

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(updateMetricListHeight)
        : null

    metricGroups.forEach((group) => resizeObserver?.observe(group))
    window.addEventListener('resize', updateMetricListHeight)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateMetricListHeight)
    }
  }, [deviceId, draftMetrics.length, mode])

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
  }, [deviceId, mode])

  const busy =
    loading || saving || savingAll || (isAlarmMode && alarmSaving)

  function clearAlarmFeedback() {
    setAlarmMessage('')
    setAlarmMessageTone('info')
  }

  function addMetric() {
    if (lockedDefinition || isAlarmMode) return

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
    if (lockedDefinition || isAlarmMode) return

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
    if (isAlarmMode) return
    if (lockedDefinition && ['metric_name', 'unit', 'icon'].includes(key)) return

    clearAlarmFeedback()
    setDraftMetrics((currentMetrics = []) =>
      updateMetricList(currentMetrics, index, key, value)
    )
  }

  function updateAlarmDraft(metricKey, severity, key, value) {
    if (!isAlarmMode) return

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

  async function handleValueReset() {
    setOpenIconPickerKey(null)
    clearAlarmFeedback()
    await resetMetrics()
  }

  function handleAlarmReset() {
    setAlarmDrafts(createAlarmDrafts(draftMetrics, rulesByMetricAndSeverity, {}))
    setAlarmMessage('คืนค่า Alarm Draft ตามค่าที่บันทึกล่าสุดแล้ว')
    setAlarmMessageTone('info')
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

  async function handleSaveValues() {
    setOpenIconPickerKey(null)
    clearAlarmFeedback()

    const normalizedMetrics = enforceLockedValueMetrics(modelKey, draftMetrics)

    setSavingAll(true)
    setAlarmMessage('กำลังบันทึก Values...')
    setAlarmMessageTone('info')

    try {
      const metricSaved = await saveDraftMetrics(normalizedMetrics)

      if (!metricSaved) {
        throw new Error('บันทึก Values ไม่สำเร็จ')
      }

      const successMessage = `บันทึก Values สำเร็จ: ${normalizedMetrics.length} Values`
      setAlarmMessage(successMessage)
      setAlarmMessageTone('success')
    } catch (error) {
      console.error(error)
      const errorMessage = error.message || 'บันทึก Values ไม่สำเร็จ'
      setAlarmMessage(errorMessage)
      setAlarmMessageTone('error')
    } finally {
      setSavingAll(false)
    }
  }

  async function handleSaveAlarms() {
    clearAlarmFeedback()

    const normalizedMetrics = enforceLockedValueMetrics(modelKey, draftMetrics)
    let operations = []

    try {
      operations = collectAlarmDraftsForSave(normalizedMetrics)
    } catch (error) {
      const errorMessage = error.message || 'ตรวจสอบ Alarm Rules ไม่สำเร็จ'
      setAlarmMessage(errorMessage)
      setAlarmMessageTone('error')
      return
    }

    setSavingAll(true)
    setAlarmMessage('กำลังบันทึก Alarm Rules...')
    setAlarmMessageTone('info')

    try {
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
        for (const draft of operations) {
          if (draft.delete) {
            throw new Error('ไม่พบฟังก์ชันสำหรับลบ Alarm Rule')
          }

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

      const activeRuleCount =
        canonicalRules.length > 0
          ? canonicalRules.filter((rule) => rule.is_active !== false).length
          : operations.filter(
              (rule) => !rule.delete && rule.is_active !== false
            ).length

      const successMessage = `บันทึก Alarm Rules สำเร็จ: ${activeRuleCount} Active Rules`
      setAlarmMessage(successMessage)
      setAlarmMessageTone('success')
    } catch (error) {
      console.error(error)
      const errorMessage = error.message || 'บันทึก Alarm Rules ไม่สำเร็จ'
      setAlarmMessage(errorMessage)
      setAlarmMessageTone('error')
    } finally {
      setSavingAll(false)
    }
  }

  const panelMessage = alarmMessage || message
  const panelClasses = [
    'metric-config-panel',
    'metric-config-panel-v2',
    'metric-config-panel-easy',
    'metric-config-panel-clean',
    'metric-alarm-combined-panel',
    'metric-alarm-combined-panel-refined',
    'metric-alarm-reference-layout',
    isAlarmMode
      ? 'metric-config-panel--alarms'
      : 'metric-config-panel--values',
  ].join(' ')

  const listClasses = [
    'metric-alarm-config-body',
    draftMetrics.length > 3 ? 'metric-alarm-config-body--scrollable' : '',
    !isAlarmMode && openIconPickerKey
      ? 'metric-alarm-config-body--icon-picker-open'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const listStyle = metricListMaxHeight
    ? {
        '--metric-config-scroll-max-height': `${metricListMaxHeight}px`,
      }
    : undefined

  function renderAlarmRules(metric, index) {
    const metricKey = metric.metric_key || `metric_${index + 1}`
    const metricLabel = metric.metric_name || metricKey || `Value ${index + 1}`
    const metricDrafts = alarmDrafts?.[metricKey] || {}

    return (
      <article
        className="metric-alarm-config-group metric-alarms-config-group metric-values-overview-card metric-alarms-overview-card"
        key={metric.id ? `metric-${metric.id}` : metricKey}
        aria-label={`Configure alarms for ${metricLabel}`}
      >
        <header className="metric-values-overview-card-header metric-alarms-overview-card-header">
          <span className="metric-values-overview-card-icon" aria-hidden="true">
            <MetricIcon name={metric.icon || 'Activity'} size={18} />
          </span>
          <span className="metric-values-overview-card-copy">
            <strong>{metricLabel}</strong>
            <small>
              {metricKey} · {metric.unit || 'No unit'}
            </small>
          </span>
        </header>

        <div className="metric-values-overview-list metric-alarms-overview-list">
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
              <section
                key={`${metricKey}-${severity}`}
                className={`metric-alarm-overview-rule ${severity}`}
                aria-label={`${metricLabel} ${severityLabel} alarm`}
              >
                <div className="metric-values-overview-list-item metric-alarm-overview-single-row">
                  <div className="metric-alarm-overview-severity-cell">
                    <span className={`status ${severity}`}>{severityLabel}</span>
                  </div>

                  <div className="metric-values-overview-paired-field metric-alarm-overview-condition-field">
                    <div className="metric-values-overview-list-copy">
                      <span>Condition</span>
                    </div>
                    <div className="metric-values-overview-list-control">
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
                    </div>
                  </div>

                  <div className="metric-values-overview-paired-field metric-alarm-overview-threshold-field">
                    <div className="metric-values-overview-list-copy">
                      <span>
                        Threshold{metric.unit ? ` (${metric.unit})` : ''}
                      </span>
                    </div>
                    <div className="metric-values-overview-list-control">
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
                    </div>
                  </div>

                  <div className="metric-values-overview-paired-field metric-alarm-overview-notification-field">
                    <div className="metric-values-overview-list-copy">
                      <span>Notification Message</span>
                    </div>
                    <div className="metric-values-overview-list-control">
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
                    </div>
                  </div>

                  <div className="metric-alarm-overview-active-cell">
                    <label
                      className={
                        draft.is_active !== false
                          ? 'metric-visible-toggle alarm-active-toggle metric-alarm-overview-active-toggle active'
                          : 'metric-visible-toggle alarm-active-toggle metric-alarm-overview-active-toggle'
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
                        aria-label={`${metricLabel} ${severityLabel} active`}
                      />
                      <span>
                        {draft.is_active !== false ? 'Active' : 'Paused'}
                      </span>
                    </label>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </article>
    )
  }

  function renderValueSettings(metric, index) {
    const metricKey = metric.metric_key || `metric_${index + 1}`
    const metricLabel = metric.metric_name || metricKey || `Value ${index + 1}`
    const pickerKey = String(metric.id || metricKey || `metric-${index}`)

    return (
      <article
        className="metric-alarm-config-group metric-values-config-group metric-values-overview-card"
        key={metric.id ? `metric-${metric.id}` : metricKey}
        aria-label={`Configure ${metricLabel}`}
      >
        <header className="metric-values-overview-card-header">
          <span className="metric-values-overview-card-icon" aria-hidden="true">
            <MetricIcon name={metric.icon || 'Activity'} size={18} />
          </span>
          <span className="metric-values-overview-card-copy">
            <strong>{metricLabel}</strong>
            <small>
              {metricKey} · {metric.unit || 'No unit'}
            </small>
          </span>
          <label
            className={
              metric.visible !== false
                ? 'metric-visible-toggle metric-values-overview-header-toggle active'
                : 'metric-visible-toggle metric-values-overview-header-toggle'
            }
          >
            <input
              type="checkbox"
              checked={metric.visible !== false}
              onChange={(event) =>
                updateMetric(index, 'visible', event.target.checked)
              }
              disabled={busy}
              aria-label={`${metricLabel} display visibility`}
            />
            <span>{metric.visible !== false ? 'Visible' : 'Hidden'}</span>
          </label>
        </header>

        <div className="metric-values-overview-list">
          <div className="metric-values-overview-list-item metric-values-overview-list-item--paired">
            <div className="metric-values-overview-paired-field">
              <div className="metric-values-overview-list-copy">
                <span>Value Name</span>
              </div>
              <div className="metric-values-overview-list-control">
                <input
                  value={metric.metric_name || ''}
                  placeholder={`เช่น ${index === 0 ? 'Temperature' : 'Value Name'}`}
                  onChange={(event) =>
                    updateMetric(index, 'metric_name', event.target.value)
                  }
                  disabled={busy || Boolean(lockedDefinition)}
                  aria-label={`${metricLabel} value name`}
                />
              </div>
            </div>

            <div className="metric-values-overview-paired-field">
              <div className="metric-values-overview-list-copy">
                <span>Unit</span>
              </div>
              <div className="metric-values-overview-list-control">
                <input
                  value={metric.unit || ''}
                  placeholder="°C, %, kWh"
                  onChange={(event) =>
                    updateMetric(index, 'unit', event.target.value)
                  }
                  disabled={busy || Boolean(lockedDefinition)}
                  aria-label={`${metricLabel} unit`}
                />
              </div>
            </div>
          </div>

          <div className="metric-values-overview-list-item metric-values-overview-list-item--paired">
            <div className="metric-values-overview-paired-field">
              <div className="metric-values-overview-list-copy">
                <span>Decimals</span>
              </div>
              <div className="metric-values-overview-list-control">
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
              </div>
            </div>

            <div className="metric-values-overview-paired-field">
              <div className="metric-values-overview-list-copy">
                <span>Icon</span>
              </div>
              <div className="metric-values-overview-list-control">
                <MetricIconPicker
                  value={metric.icon}
                  disabled={busy || Boolean(lockedDefinition)}
                  isOpen={openIconPickerKey === pickerKey}
                  onOpenChange={(nextOpen) =>
                    setOpenIconPickerKey(nextOpen ? pickerKey : null)
                  }
                  onChange={(iconName) => updateMetric(index, 'icon', iconName)}
                />
              </div>
            </div>
          </div>

        </div>

        {!lockedDefinition ? (
          <footer className="metric-values-overview-card-footer">
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
          </footer>
        ) : null}
      </article>
    )
  }

  return (
    <section className={panelClasses}>
      {!isAlarmMode && !lockedDefinition ? (
        <div className="metric-config-compact-actions">
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
      ) : null}

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
          <h3>{isAlarmMode ? 'กำลังโหลด Alarm' : 'กำลังโหลด Value'}</h3>
          <p>
            {isAlarmMode
              ? 'กำลังดึงรายการ Value และ Alarm Rules ของ Device นี้'
              : 'กำลังดึง Value configuration ของ Device นี้'}
          </p>
        </div>
      ) : draftMetrics.length === 0 ? (
        <div className="app-empty-state">
          <h3>ยังไม่มี Value</h3>
          <p>
            {isAlarmMode
              ? 'กรุณาเพิ่มและบันทึก Value ในแท็บ Values ก่อนตั้งค่า Alarm'
              : 'กด Add Value เพื่อเพิ่มค่าที่ต้องการแสดงผล'}
          </p>
        </div>
      ) : isAlarmMode ? (
        <div className="metric-alarm-config-table metric-alarms-config-table">
          <div
            ref={metricListRef}
            className={listClasses}
            style={listStyle}
          >
            {draftMetrics.map(renderAlarmRules)}
          </div>
        </div>
      ) : (
        <div className="metric-alarm-config-table metric-values-config-table metric-values-overview-table">
          <div
            ref={metricListRef}
            className={listClasses}
            style={listStyle}
          >
            {draftMetrics.map(renderValueSettings)}
          </div>
        </div>
      )}

      <div className="metric-config-actions metric-config-footer-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={isAlarmMode ? handleAlarmReset : handleValueReset}
          disabled={busy}
        >
          <RotateCcw size={16} />
          {isAlarmMode ? 'Reset Alarm Drafts' : 'Reset Values'}
        </button>

        <button
          type="button"
          className="save-btn metric-save-btn"
          onClick={isAlarmMode ? handleSaveAlarms : handleSaveValues}
          disabled={busy || draftMetrics.length === 0}
        >
          <Save size={16} />
          {busy
            ? 'Saving...'
            : isAlarmMode
              ? 'Save Alarms'
              : 'Save Values'}
        </button>
      </div>
    </section>
  )
}
