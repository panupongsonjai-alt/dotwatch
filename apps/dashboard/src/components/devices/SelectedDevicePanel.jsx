import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import {
  Activity,
  AlertTriangle,
  BellRing,
  Clock3,
  CheckCircle2,
  Edit3,
  Copy,
  Eye,
  KeyRound,
  Lock,
  MapPin,
  Save,
  Thermometer,
  Radio,
  Wifi,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import LocationPicker from '../LocationPicker.jsx'
import MetricConfigPanel from '../MetricConfigPanel.jsx'
import { auth } from '../../services/firebase'
import { getDeviceSecret } from '../../services/api'
import { showWarningToast } from '../../utils/uiFeedback'
import UnifiedSelect from '../common/UnifiedSelect.jsx'
import { formatMetricValue } from '../../utils/metricDisplayConfig'
import {
  getDeviceMetricPills,
  getEsp32DefaultPinHint,
  isEsp32Dht3Device,
} from '../../utils/esp32Dht3Utils.js'
import { useDeviceMetrics } from '../../hooks/useDeviceMetrics'
import { EmptyState, StatusBadge } from '../common'
import {
  formatDate,
  getDeviceDisplayName,
  getLastSeen,
  getModelLabel,
  getStatus,
  getStatusLabel,
} from './deviceUtils.jsx'

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'metrics', label: 'Values & Alarms' },
  { key: 'location', label: 'Location' },
  { key: 'security', label: 'Security' },
]

function getHealthTone(status) {
  if (status === 'online') return 'healthy'
  if (status === 'warning') return 'warning'
  return 'offline'
}

const OPERATORS = ['>', '>=', '<', '<=', '=']
const SEVERITIES = ['warning', 'critical']

function formatThreshold(value, unit = '', decimalPlaces = 2) {
  return formatMetricValue(value, unit, decimalPlaces)
}

function getMetricLabel(metrics, metricKey, rule = {}) {
  const metric = metrics.find((item) => item.metric_key === metricKey)
  return metric?.metric_name || rule.metric_name || metricKey || '--'
}

function getMetricUnit(metrics, metricKey, rule = {}) {
  const metric = metrics.find((item) => item.metric_key === metricKey)
  return metric?.unit || rule.unit || ''
}

function getMetricDecimals(metrics, metricKey, rule = {}) {
  const metric = metrics.find((item) => item.metric_key === metricKey)
  return metric?.decimal_places ?? metric?.decimalPlaces ?? rule.decimal_places ?? 2
}

function getMetricKeyDisplay(metricKey = '') {
  const normalizedKey = String(metricKey || '').trim()
  return normalizedKey.replace(/^metric_/i, '') || '--'
}

function DeviceTabHeader({ eyebrow, title, description, meta }) {
  return (
    <div className="devices-v3-tab-header">
      <div>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>

      {meta && <span className="device-model-badge">{meta}</span>}
    </div>
  )
}

function DeviceAlarmRulesPanel({
  deviceId,
  alarmRules = [],
  saving,
  onCreateMetricAlarm,
  onUpdateMetricAlarm,
  onDeleteAlarmRule,
}) {
  const { draftMetrics = [], loading: loadingMetrics } =
    useDeviceMetrics(deviceId)

  const visibleMetrics = useMemo(
    () => draftMetrics.filter((metric) => metric.visible !== false),
    [draftMetrics]
  )

  const rulesByMetricAndSeverity = useMemo(() => {
    return alarmRules.reduce((collection, rule) => {
      const metricKey = rule.metric || rule.metric_key
      const severity = rule.severity || 'warning'

      if (!metricKey) return collection

      if (!collection[metricKey]) {
        collection[metricKey] = {}
      }

      collection[metricKey][severity] = rule
      return collection
    }, {})
  }, [alarmRules])

  const [alarmDrafts, setAlarmDrafts] = useState({})

  useEffect(() => {
    setAlarmDrafts((currentDrafts) => {
      const nextDrafts = {}

      visibleMetrics.forEach((metric) => {
        const metricKey = metric.metric_key
        const metricRules = rulesByMetricAndSeverity[metricKey] || {}

        nextDrafts[metricKey] = {}

        SEVERITIES.forEach((severity) => {
          const existingRule = metricRules[severity]
          const currentDraft = currentDrafts?.[metricKey]?.[severity]

          nextDrafts[metricKey][severity] = {
            id: existingRule?.id || null,
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
    })
  }, [rulesByMetricAndSeverity, visibleMetrics])

  function updateAlarmDraft(metricKey, severity, key, value) {
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

  async function saveMetricSeverityRule(metricKey, severity) {
    const draft = alarmDrafts?.[metricKey]?.[severity]

    if (!draft) return

    if (draft.threshold === '' || Number.isNaN(Number(draft.threshold))) {
      showWarningToast('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    const payload = {
      metric: metricKey,
      operator: draft.operator || '>',
      threshold: Number(draft.threshold),
      severity,
      is_active: draft.is_active !== false,
      notification_message: String(draft.notification_message || '').trim(),
    }

    if (draft.id) {
      await onUpdateMetricAlarm?.(draft.id, {
        ...payload,
        id: draft.id,
      })
      return
    }

    await onCreateMetricAlarm?.(deviceId, metricKey, payload)
  }

  if (loadingMetrics) {
    return (
      <div className="alarm-rules-panel-v2 devices-v3-alarm-rules-panel">
        <div className="app-empty-state">
          <h3>กำลังโหลด Value</h3>
          <p>กำลังเตรียมรายการ Value สำหรับตั้ง Alarm</p>
        </div>
      </div>
    )
  }

  if (visibleMetrics.length === 0) {
    return (
      <div className="alarm-rules-panel-v2 devices-v3-alarm-rules-panel">
        <div className="alarm-rule-empty">
          ยังไม่มี Value สำหรับตั้ง Alarm กรุณาเพิ่ม Value ในแท็บ Values ก่อน
        </div>
      </div>
    )
  }

  return (
    <div className="alarm-rules-panel-v2 devices-v3-alarm-rules-panel metric-alarm-panel metric-alarm-panel-easy">
      <div className="metric-alarm-rule-grid metric-alarm-rule-grid-easy">
        {visibleMetrics.map((metric) => {
          const metricKey = metric.metric_key
          const metricName = metric.metric_name || metric.metric_key
          const metricUnit = metric.unit || ''
          const metricDrafts = alarmDrafts?.[metricKey] || {}

          return (
            <section
              key={metricKey}
              className="devices-v3-rule-card metric-alarm-card metric-alarm-card-easy"
            >
              <div className="metric-alarm-card-header">
                <div>
                  <strong>{metricName}</strong>
                  <span>
                    {getMetricKeyDisplay(metricKey)}
                    {metricUnit ? ` • ${metricUnit}` : ''}
                  </span>
                </div>

                <span className="device-model-badge">2 Rules</span>
              </div>

              <div className="metric-alarm-rule-list metric-alarm-rule-list-easy">
                {SEVERITIES.map((severity) => {
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
                      className={`device-alarm-rule-item alarm-rule-edit-row-v2 metric-alarm-rule-row metric-alarm-rule-row-easy ${severity}`}
                    >
                      <div className="metric-alarm-severity">
                        <span className={`status ${severity}`}>
                          {severityLabel}
                        </span>
                        <small>
                          {severity === 'critical'
                            ? 'ระดับวิกฤต ต้องตรวจสอบทันที'
                            : 'ระดับเตือนล่วงหน้า'}
                        </small>
                      </div>

                      <label className="metric-alarm-field metric-alarm-operator">
                        <span>Condition</span>
                        <UnifiedSelect
                          value={draft.operator || '>'}
                          onChange={(event) =>
                            updateAlarmDraft(
                              metricKey,
                              severity,
                              'operator',
                              event.target.value
                            )
                          }
                          disabled={saving}
                        >
                          {OPERATORS.map((operator) => (
                            <option key={operator} value={operator}>
                              {operator}
                            </option>
                          ))}
                        </UnifiedSelect>
                      </label>

                      <label className="metric-alarm-field metric-alarm-threshold">
                        <span>
                          Threshold {metricUnit ? `(${metricUnit})` : ''}
                        </span>
                        <input
                          type="number"
                          value={draft.threshold}
                          placeholder="Value"
                          onChange={(event) =>
                            updateAlarmDraft(
                              metricKey,
                              severity,
                              'threshold',
                              event.target.value
                            )
                          }
                          disabled={saving}
                        />
                      </label>

                      <div className="metric-alarm-trigger">
                        <span>Trigger</span>
                        <p
                          className="metric-alarm-rule-preview"
                          title={`Trigger when ${metricName} ${
                            draft.operator || '>'
                          } ${formatThreshold(draft.threshold, metricUnit, getMetricDecimals(visibleMetrics, metricKey, draft))}`}
                        >
                          Trigger when {metricName} {draft.operator || '>'}{' '}
                          {formatThreshold(draft.threshold, metricUnit, getMetricDecimals(visibleMetrics, metricKey, draft))}
                        </p>
                      </div>

                      <label className="metric-alarm-field metric-alarm-message">
                        <span>ข้อความแจ้งเตือน</span>
                        <input
                          type="text"
                          value={draft.notification_message || ''}
                          placeholder="เช่น กรุณาตรวจสอบอุณหภูมิทันที"
                          maxLength={300}
                          onChange={(event) =>
                            updateAlarmDraft(
                              metricKey,
                              severity,
                              'notification_message',
                              event.target.value
                            )
                          }
                          disabled={saving}
                        />
                      </label>

                      <div className="metric-alarm-active-field">
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
                            disabled={saving}
                          />
                          <span>
                            {draft.is_active !== false ? 'Active' : 'Paused'}
                          </span>
                        </label>
                      </div>

                      <button
                        type="button"
                        className="save-btn metric-alarm-save-btn"
                        disabled={saving}
                        onClick={() =>
                          saveMetricSeverityRule(metricKey, severity)
                        }
                      >
                        Save
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

async function reauthenticateCurrentUser(password) {
  const user = auth.currentUser

  if (!user || !user.email) {
    throw new Error('กรุณาเข้าสู่ระบบใหม่ก่อนดู Device Secret')
  }

  if (!password) {
    throw new Error('กรุณากรอก Password ก่อนดู Device Secret')
  }

  const credential = EmailAuthProvider.credential(user.email, password)

  await reauthenticateWithCredential(user, credential)
  await user.getIdToken(true)
}

function SecretPasswordDialog({
  open,
  mode,
  deviceName,
  password,
  loading,
  error,
  onPasswordChange,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !loading) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [loading, onClose, open])

  if (!open || typeof document === 'undefined') return null

  const isReset = mode === 'reset'
  const title = isReset
    ? 'ยืนยันรหัสผ่านก่อน Reset Secret'
    : 'ยืนยันรหัสผ่านเพื่อดู Device Secret'
  const description = isReset
    ? 'กรอกรหัสผ่านของบัญชีปัจจุบันก่อน จากนั้นระบบจะแสดงหน้าต่างยืนยัน Reset Secret อีกครั้ง'
    : 'Device Secret เป็นข้อมูลสำคัญ กรุณากรอกรหัสผ่านของบัญชีปัจจุบันเพื่อเปิดเผยค่า'

  return createPortal(
    <div
      className="dw-confirm-backdrop devices-v3-password-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose()
      }}
    >
      <section
        className="dw-confirm-dialog devices-v3-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="devices-secret-password-title"
        aria-describedby="devices-secret-password-description"
      >
        <div className="dw-confirm-header">
          <span className={`dw-confirm-icon ${isReset ? 'danger' : ''}`}>
            {isReset ? <KeyRound size={22} /> : <Lock size={22} />}
          </span>
          <div>
            <span>{isReset ? 'Sensitive action' : 'Protected credential'}</span>
            <h2 id="devices-secret-password-title">{title}</h2>
          </div>
          <button
            type="button"
            className="dw-confirm-close"
            aria-label="ปิดหน้าต่างยืนยันรหัสผ่าน"
            disabled={loading}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {deviceName && (
          <div className="dw-confirm-target">
            <span>Device</span>
            <strong>{deviceName}</strong>
          </div>
        )}

        <p
          id="devices-secret-password-description"
          className="dw-confirm-description"
        >
          {description}
        </p>

        <label className="devices-v3-password-modal-field">
          <span>Password</span>
          <div>
            <Lock size={17} />
            <input
              autoFocus
              type="password"
              value={password}
              placeholder="กรอกรหัสผ่านบัญชีปัจจุบัน"
              autoComplete="current-password"
              disabled={loading}
              onChange={(event) => onPasswordChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && password && !loading) {
                  onSubmit()
                }
              }}
            />
          </div>
        </label>

        {error && (
          <p className="devices-v3-password-modal-error" role="alert">
            {error}
          </p>
        )}

        <div className="dw-confirm-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={isReset ? 'danger-button' : 'primary-button'}
            disabled={loading || !password}
            onClick={onSubmit}
          >
            {loading ? 'กำลังตรวจสอบ...' : 'ยืนยันรหัสผ่าน'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}

function getSignalTone(metricPills = [], device = {}) {
  const signalMetric = metricPills.find(
    (metric) =>
      String(metric.key || '')
        .toLowerCase()
        .includes('3') ||
      String(metric.label || '')
        .toLowerCase()
        .includes('rssi') ||
      String(metric.name || '')
        .toLowerCase()
        .includes('wifi')
  )

  const value = Number(signalMetric?.value ?? device.rssi ?? device.metric_3)

  if (!Number.isFinite(value)) {
    return {
      label: 'Signal unknown',
      tone: 'muted',
    }
  }

  if (value >= -55) {
    return {
      label: 'Strong signal',
      tone: 'success',
    }
  }

  if (value >= -70) {
    return {
      label: 'Good signal',
      tone: 'info',
    }
  }

  return {
    label: 'Weak signal',
    tone: 'warning',
  }
}

function getLatestDeviceTimestamp(device = {}) {
  return (
    device.latest_time ||
    device.last_ingest_at ||
    device.last_seen_at ||
    device.updated_at ||
    null
  )
}

function getFreshnessInfo(device = {}) {
  const timestamp = getLatestDeviceTimestamp(device)

  if (!timestamp) {
    return {
      label: 'No ingest yet',
      detail: 'ยังไม่พบเวลาส่งข้อมูลล่าสุด',
      tone: 'warning',
      ageSeconds: null,
    }
  }

  const time = new Date(timestamp).getTime()

  if (!Number.isFinite(time)) {
    return {
      label: 'Unknown freshness',
      detail: String(timestamp),
      tone: 'warning',
      ageSeconds: null,
    }
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - time) / 1000))

  if (ageSeconds <= 90) {
    return {
      label: 'Live ingest',
      detail: `${ageSeconds}s ago`,
      tone: 'success',
      ageSeconds,
    }
  }

  if (ageSeconds <= 300) {
    return {
      label: 'Recently updated',
      detail: `${Math.round(ageSeconds / 60)}m ago`,
      tone: 'info',
      ageSeconds,
    }
  }

  return {
    label: 'Stale data',
    detail: `${Math.round(ageSeconds / 60)}m ago`,
    tone: 'warning',
    ageSeconds,
  }
}

function getFirmwareInfo(device = {}) {
  const firmware = device.firmware_version || ''
  const isEsp32 = isEsp32Dht3Device(device)

  if (!firmware) {
    return {
      label: 'Firmware unknown',
      detail: 'ยังไม่มี firmware version ใน latest ingest',
      tone: 'warning',
    }
  }

  if (isEsp32 && firmware.includes('0.8.0')) {
    return {
      label: 'ESP32 TLS ready',
      detail: firmware,
      tone: 'success',
    }
  }

  if (isEsp32 && firmware.includes('0.7.0')) {
    return {
      label: 'Wi-Fi memory ready',
      detail: `${firmware} · ควรอัปเดตเป็น 0.8.0 เพื่อ Root CA E2E`,
      tone: 'info',
    }
  }

  return {
    label: 'Firmware reported',
    detail: firmware,
    tone: 'info',
  }
}

function getProductionReadiness(
  device = {},
  status = 'offline',
  alarmRules = []
) {
  const metricPills = getDeviceMetricPills(device, 3)
  const signal = getSignalTone(metricPills, device)
  const freshness = getFreshnessInfo(device)
  const firmware = getFirmwareInfo(device)
  const hasMetricData = metricPills.length > 0
  const activeAlarmCount = alarmRules.filter(
    (rule) => rule.is_active !== false
  ).length
  const isOnline = status === 'online'

  const checks = [
    {
      key: 'connection',
      title: 'Device connection',
      description: isOnline
        ? 'Backend เห็นอุปกรณ์เป็น Online'
        : 'ยังไม่ Online ให้เช็ค Wi-Fi, power, backend URL และ device secret',
      tone: isOnline ? 'success' : 'warning',
      icon: isOnline ? CheckCircle2 : AlertTriangle,
    },
    {
      key: 'ingest',
      title: 'Latest ingest',
      description: `${freshness.label} · ${freshness.detail}`,
      tone: freshness.tone,
      icon: freshness.tone === 'success' ? CheckCircle2 : Clock3,
    },
    {
      key: 'metrics',
      title: 'Value payload',
      description: hasMetricData
        ? `${metricPills.length} latest values available`
        : 'ยังไม่พบ latest value จากอุปกรณ์นี้',
      tone: hasMetricData ? 'success' : 'warning',
      icon: hasMetricData ? Activity : AlertTriangle,
    },
    {
      key: 'signal',
      title: 'Wi-Fi signal',
      description: signal.label,
      tone: signal.tone === 'warning' ? 'warning' : 'success',
      icon: Wifi,
    },
    {
      key: 'firmware',
      title: 'Firmware / TLS',
      description: firmware.detail,
      tone: firmware.tone,
      icon: ShieldCheck,
    },
    {
      key: 'alarms',
      title: 'Alarm readiness',
      description: activeAlarmCount
        ? `${activeAlarmCount} active alarm rules`
        : 'ยังไม่มี active alarm rule สำหรับ device นี้',
      tone: activeAlarmCount ? 'success' : 'info',
      icon: BellRing,
    },
  ]

  const blockingChecks = checks.filter((check) => check.tone === 'warning')

  return {
    checks,
    score: checks.length - blockingChecks.length,
    total: checks.length,
    ready: blockingChecks.length === 0,
    nextAction: blockingChecks[0]?.title || 'Ready for production monitoring',
  }
}

function DeviceOperationsPanel({ device, status, alarmRules = [] }) {
  const readiness = getProductionReadiness(device, status, alarmRules)
  const metricPills = getDeviceMetricPills(device, 3)
  const isEsp32 = isEsp32Dht3Device(device)
  const pinHint = isEsp32 ? getEsp32DefaultPinHint(device) : null

  return (
    <section
      className="devices-v5-ops-panel"
      aria-label="Production operations checklist"
    >
      <div className="devices-v5-ops-hero">
        <div>
          <span className="page-eyebrow">Production Operations</span>
          <h4>
            {readiness.ready
              ? 'พร้อมใช้งานจริงและกำลังส่งข้อมูล'
              : 'มีจุดที่ควรตรวจเพิ่มก่อนใช้งานจริง'}
          </h4>
          <p>
            ใช้หน้านี้ตรวจ device จริงหลัง flash firmware: Wi-Fi, ingest, Root
            CA/TLS, metric ล่าสุด และ alarm readiness ในมุมเดียว
          </p>
        </div>

        <div
          className={`devices-v5-readiness ${readiness.ready ? 'ready' : 'attention'}`}
        >
          <strong>
            {readiness.score}/{readiness.total}
          </strong>
          <span>{readiness.ready ? 'Ready' : 'Needs check'}</span>
        </div>
      </div>

      <div className="devices-v5-check-grid">
        {readiness.checks.map((check) => {
          const Icon = check.icon

          return (
            <article
              className={`devices-v5-check-card ${check.tone}`}
              key={check.key}
            >
              <div className="devices-v5-check-icon">
                <Icon size={18} />
              </div>
              <div>
                <strong>{check.title}</strong>
                <p>{check.description}</p>
              </div>
            </article>
          )
        })}
      </div>

      <div className="devices-v5-ops-bottom">
        <div className="devices-v5-action-card">
          <span className="page-eyebrow">Next action</span>
          <strong>{readiness.nextAction}</strong>
          <p>
            {readiness.ready
              ? 'สามารถปล่อยให้อุปกรณ์ทำงานต่อและใช้ Dashboard/Alarms ติดตามสถานะได้'
              : 'แก้รายการแรกที่ขึ้นเตือน แล้วรอรอบส่งข้อมูลถัดไปประมาณ 20-60 วินาที'}
          </p>
        </div>

        <div className="devices-v5-action-card">
          <span className="page-eyebrow">Field notes</span>
          <strong>
            {isEsp32 ? 'dot-TH-W1 production device' : getModelLabel(device)}
          </strong>
          <p>
            {isEsp32
              ? `Local Admin PIN เริ่มต้นคือท้าย Device Code 6 ตัว (${pinHint}) และควรเปลี่ยน PIN หลังติดตั้งจริง`
              : 'ตรวจสอบ power, network, device secret และตำแหน่งติดตั้งก่อนส่งมอบ'}
          </p>
        </div>
      </div>
    </section>
  )
}

function DeviceQuickStatusPanel({ device, status }) {
  const metricPills = getDeviceMetricPills(device, 3)
  const signal = getSignalTone(metricPills, device)
  const isEsp32 = isEsp32Dht3Device(device)
  const pinHint = isEsp32 ? getEsp32DefaultPinHint(device) : null
}

function SelectedDevicePanel({
  selectedDevice,
  selectedRules,
  saving,
  editingDeviceId,
  editingName,
  setEditingDeviceId,
  setEditingName,
  setLocations,
  onSaveDeviceName,
  onDeleteDevice,
  onResetSecret,
  onSavePickedLocation,
  onSaveMetricAlarms,
  onCreateMetricAlarm,
  onUpdateMetricAlarm,
  onDeleteAlarmRule,
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [revealedSecret, setRevealedSecret] = useState('')
  const [secretError, setSecretError] = useState('')
  const [secretCopied, setSecretCopied] = useState(false)
  const [passwordDialogMode, setPasswordDialogMode] = useState(null)
  const [passwordDialogPassword, setPasswordDialogPassword] = useState('')
  const [passwordDialogLoading, setPasswordDialogLoading] = useState(false)
  const [passwordDialogError, setPasswordDialogError] = useState('')

  useEffect(() => {
    setRevealedSecret('')
    setSecretError('')
    setSecretCopied(false)
    setPasswordDialogMode(null)
    setPasswordDialogPassword('')
    setPasswordDialogLoading(false)
    setPasswordDialogError('')
  }, [selectedDevice?.id])

  useEffect(() => {
    if (activeTab === 'security') return

    setRevealedSecret('')
    setSecretCopied(false)
    setPasswordDialogMode(null)
    setPasswordDialogPassword('')
    setPasswordDialogError('')
  }, [activeTab])

  function openPasswordDialog(mode) {
    if (!selectedDevice?.id || passwordDialogLoading) return

    setPasswordDialogMode(mode)
    setPasswordDialogPassword('')
    setPasswordDialogError('')
    setSecretCopied(false)
  }

  function closePasswordDialog() {
    setPasswordDialogMode(null)
    setPasswordDialogPassword('')
    setPasswordDialogError('')
  }

  async function handlePasswordDialogSubmit() {
    if (
      !selectedDevice?.id ||
      !passwordDialogMode ||
      passwordDialogLoading
    ) {
      return
    }

    if (!passwordDialogPassword) {
      setPasswordDialogError('กรุณากรอก Password ก่อนดำเนินการ')
      return
    }

    const mode = passwordDialogMode
    setPasswordDialogError('')
    setSecretError('')
    setSecretCopied(false)

    try {
      setPasswordDialogLoading(true)
      await reauthenticateCurrentUser(passwordDialogPassword)

      if (mode === 'reveal') {
        const result = await getDeviceSecret(selectedDevice.id)
        const nextSecret = result?.deviceSecret || ''

        if (!nextSecret) {
          throw new Error('ไม่พบ Device Secret ใน response จาก backend')
        }

        setRevealedSecret(nextSecret)
        closePasswordDialog()
        return
      }

      closePasswordDialog()
      await onResetSecret(selectedDevice)
    } catch (error) {
      const message = error?.message || 'ไม่สามารถยืนยันรหัสผ่านได้'
      const isInvalidPassword =
        message.includes('auth/wrong-password') ||
        message.includes('auth/invalid-credential') ||
        message.includes('auth/invalid-login-credentials')
      const isSecretNotRecoverable =
        message.includes('SECRET_NOT_RECOVERABLE') ||
        message.includes('not recoverable') ||
        message.includes('ไม่สามารถถอดรหัส') ||
        message.includes('เก็บเป็น hash')

      if (isInvalidPassword) {
        setPasswordDialogError('Password ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง')
      } else if (mode === 'reveal' && isSecretNotRecoverable) {
        closePasswordDialog()
        setSecretError(
          'Device นี้ยังไม่มี Secret แบบเข้ารหัสให้ดูย้อนหลังได้ กรุณา Reset Secret ใหม่ 1 ครั้ง แล้วนำ Secret ใหม่ไปใส่ใน Firmware / Gateway'
        )
      } else {
        setPasswordDialogError(message)
      }
    } finally {
      setPasswordDialogLoading(false)
    }
  }

  async function handleCopySecret() {
    if (!revealedSecret) return

    await navigator.clipboard.writeText(revealedSecret)
    setSecretCopied(true)

    window.setTimeout(() => {
      setSecretCopied(false)
    }, 1800)
  }

  function handleHideSecret() {
    setRevealedSecret('')
    setSecretCopied(false)
  }

  if (!selectedDevice) {
    return (
      <section className="app-card">
        <EmptyState
          title="ยังไม่ได้เลือก Device"
          description="เลือก Device จากรายการด้านซ้ายเพื่อจัดการ"
        />
      </section>
    )
  }

  const isEditing = editingDeviceId === selectedDevice.id
  const status = getStatus(selectedDevice)
  const healthTone = getHealthTone(status)

  return (
    <section className="app-card devices-v3-detail-card">
      <div className={`devices-v3-health-banner ${healthTone}`}>
        <div className="devices-v3-health-icon">
          {status === 'online' ? (
            <ShieldCheck size={22} />
          ) : (
            <BellRing size={22} />
          )}
        </div>

        <div>
          <strong>
            {status === 'online'
              ? 'Device Healthy'
              : status === 'warning'
                ? 'Device Warning'
                : 'Device Offline'}
          </strong>
          <p>Last data received {getLastSeen(selectedDevice)}</p>
        </div>

        <StatusBadge status={status} label={getStatusLabel(status)} />
      </div>

      <div className="devices-v2-selected-header devices-v3-selected-header">
        <div className="devices-v2-selected-title">
          <span className="page-eyebrow">Selected Device</span>

          {isEditing ? (
            <div className="device-edit-row clean">
              <input
                className="device-edit-input"
                type="text"
                value={editingName}
                disabled={saving}
                onChange={(event) => setEditingName(event.target.value)}
                placeholder="ชื่อ Device"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSaveDeviceName(selectedDevice.id)
                  if (event.key === 'Escape') {
                    setEditingDeviceId(null)
                    setEditingName('')
                  }
                }}
              />

              <button
                type="button"
                className="save-btn square"
                disabled={saving}
                onClick={() => onSaveDeviceName(selectedDevice.id)}
                title="Save"
              >
                <Save size={16} />
              </button>

              <button
                type="button"
                className="cancel-btn square"
                disabled={saving}
                onClick={() => {
                  setEditingDeviceId(null)
                  setEditingName('')
                }}
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <h3>{getDeviceDisplayName(selectedDevice)}</h3>
              <p>{selectedDevice.device_code}</p>
            </>
          )}
        </div>

        <div className="device-action-row clean-device-actions devices-v3-action-bar">
          {!isEditing && (
            <button
              type="button"
              className="rename-btn"
              disabled={saving}
              onClick={() => {
                setEditingDeviceId(selectedDevice.id)
                setEditingName(selectedDevice.name || '')
              }}
            >
              <Edit3 size={16} />
              Rename
            </button>
          )}

          <button
            type="button"
            className="delete-btn"
            disabled={saving}
            onClick={() => onDeleteDevice(selectedDevice.id)}
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </div>

      <DeviceQuickStatusPanel device={selectedDevice} status={status} />

      <div
        className="devices-v3-tabs"
        role="tablist"
        aria-label="Device sections"
      >
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'active' : ''}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="devices-v3-tab-panel">
          <DeviceTabHeader
            eyebrow="Device Summary"
            title="Overview"
            description="ข้อมูลภาพรวมล่าสุดของ Device นี้ รวมถึงรุ่น Firmware และเวลาที่รับค่าล่าสุด"
            meta={getStatusLabel(status)}
          />
          <dl className="devices-v3-overview-list">
            <div className="devices-v3-overview-list-item">
              <dt>
                <span>Model</span>
                <small>Device model</small>
              </dt>
              <dd>{getModelLabel(selectedDevice)}</dd>
            </div>

            <div className="devices-v3-overview-list-item">
              <dt>
                <span>Firmware</span>
                <small>Firmware version</small>
              </dt>
              <dd>{selectedDevice.firmware_version || '--'}</dd>
            </div>

            <div className="devices-v3-overview-list-item">
              <dt>
                <span>Local IP</span>
                <small>Reported by device</small>
              </dt>
              <dd>{selectedDevice.last_local_ip_address || '--'}</dd>
            </div>

            <div className="devices-v3-overview-list-item">
              <dt>
                <span>Public IP</span>
                <small>Observed by backend</small>
              </dt>
              <dd>{selectedDevice.last_ip_address || '--'}</dd>
            </div>

            <div className="devices-v3-overview-list-item">
              <dt>
                <span>Wi-Fi</span>
                <small>Connected network</small>
              </dt>
              <dd>{selectedDevice.last_wifi_ssid || '--'}</dd>
            </div>

            <div className="devices-v3-overview-list-item">
              <dt>
                <span>Last Seen</span>
                <small>Latest ingest</small>
              </dt>
              <dd>{getLastSeen(selectedDevice)}</dd>
            </div>
          </dl>
        </div>
      )}

      {activeTab === 'ops' && (
        <div className="devices-v3-tab-panel">
          <DeviceTabHeader
            eyebrow="Production Checklist"
            title="Operations"
            description="ตรวจความพร้อมของอุปกรณ์จริงหลังติดตั้ง: ingest, signal, firmware, TLS และ alarm readiness"
            meta={getStatusLabel(status)}
          />

          <DeviceOperationsPanel
            device={selectedDevice}
            status={status}
            alarmRules={Array.isArray(selectedRules) ? selectedRules : []}
          />
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="devices-v3-tab-panel devices-v3-metrics-alarms-panel">
          <DeviceTabHeader
            eyebrow="Value & Alarm Configuration"
            title="Values & Alarms"
            description="จัดการการแสดงผลและ Warning / Critical Threshold โดยโมเดลแบบ Fixed จะล็อกชื่อและหน่วยของ Value"
            meta={`${selectedDevice.metric_count || 0} Channels`}
          />

          <MetricConfigPanel
            key={`metrics-alarms-${selectedDevice.id}`}
            deviceId={selectedDevice.id}
            modelKey={selectedDevice.model_key || selectedDevice.modelKey}
            modelName={selectedDevice.model_name || selectedDevice.modelName}
            alarmRules={Array.isArray(selectedRules) ? selectedRules : []}
            alarmSaving={saving}
            onSaveMetricAlarms={onSaveMetricAlarms}
            onCreateMetricAlarm={onCreateMetricAlarm}
            onUpdateMetricAlarm={onUpdateMetricAlarm}
          />
        </div>
      )}

      {activeTab === 'location' && (
        <div className="devices-v3-tab-panel devices-v3-location-panel">
          <DeviceTabHeader
            eyebrow="Device Location"
            title="Location"
            description="จัดการตำแหน่ง Latitude, Longitude และลิงก์แผนที่ของ Device นี้"
            meta={
              selectedDevice.latitude != null && selectedDevice.longitude != null
                ? 'Mapped'
                : 'No Location'
            }
          />

          <LocationPicker
            latitude={selectedDevice.latitude}
            longitude={selectedDevice.longitude}
            onChange={(location) =>
              setLocations((prev) => ({
                ...prev,
                [selectedDevice.id]: location,
              }))
            }
          />

          <button
            type="button"
            className="save-btn location-save-btn"
            disabled={saving}
            onClick={() => onSavePickedLocation(selectedDevice)}
          >
            Save Map Location
          </button>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="devices-v3-tab-panel devices-v3-security-list-panel">
          <DeviceTabHeader
            eyebrow="Device Access"
            title="Security"
            description="ข้อมูลสำหรับ Firmware / Gateway ใช้ยืนยันตัวตนกับ Backend และจัดการ Secret"
            meta="Protected"
          />

          <section className="devices-v3-security-list">
            <div className="devices-v3-security-list-item">
              <div className="devices-v3-security-list-copy">
                <span>Device Code</span>
                <small>รหัสประจำ Device สำหรับส่งไปกับทุกคำขอ Ingest</small>
              </div>
              <div className="devices-v3-security-list-value">
                <code className="devices-v3-device-code-plain">
                  {selectedDevice.device_code}
                </code>
              </div>
            </div>

            <div className="devices-v3-security-list-item">
              <div className="devices-v3-security-list-copy">
                <span>Device Secret</span>
                <small>
                  Credential สำหรับ Firmware / Gateway · ต้องยืนยัน Password
                  ก่อนเปิดเผย
                </small>
              </div>

              <div className="devices-v3-security-list-value devices-v3-secret-inline-value">
                {revealedSecret ? (
                  <>
                    <code className="devices-v3-revealed-secret">
                      {revealedSecret}
                    </code>
                    <div className="devices-v3-secret-inline-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleCopySecret}
                      >
                        <Copy size={16} />
                        Copy
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleHideSecret}
                      >
                        <Eye size={16} />
                        Hide
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="devices-v3-secret-trigger"
                    aria-label="ยืนยันรหัสผ่านเพื่อดู Device Secret"
                    onClick={() => openPasswordDialog('reveal')}
                  >
                    <code>••••••••••••••••••••••••</code>
                    <small>คลิกที่ Secret เพื่อกรอก Password</small>
                  </button>
                )}

                {secretError && (
                  <p className="devices-v3-secret-message error">{secretError}</p>
                )}

                {secretCopied && (
                  <p className="devices-v3-secret-message success">
                    Copied Device Secret
                  </p>
                )}
              </div>
            </div>

            <div className="devices-v3-security-list-item devices-v3-security-list-item-danger">
              <div className="devices-v3-security-list-copy">
                <span>Reset Device Secret</span>
                <small>
                  ต้องยืนยัน Password ก่อน และยืนยันคำสั่ง Reset Secret อีกครั้ง
                </small>
              </div>

              <div className="devices-v3-security-list-value devices-v3-security-list-action">
                <button
                  type="button"
                  className="save-btn devices-v3-reset-secret-btn"
                  disabled={saving || passwordDialogLoading}
                  onClick={() => openPasswordDialog('reset')}
                >
                  <KeyRound size={16} />
                  Reset Secret
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      <SecretPasswordDialog
        open={Boolean(passwordDialogMode)}
        mode={passwordDialogMode}
        deviceName={getDeviceDisplayName(selectedDevice)}
        password={passwordDialogPassword}
        loading={passwordDialogLoading}
        error={passwordDialogError}
        onPasswordChange={(value) => {
          setPasswordDialogPassword(value)
          setPasswordDialogError('')
        }}
        onClose={closePasswordDialog}
        onSubmit={handlePasswordDialogSubmit}
      />
    </section>
  )
}

export default SelectedDevicePanel
