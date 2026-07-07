import { useEffect, useMemo, useState } from 'react'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth'
import {
  BellRing,
  Edit3,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MapPin,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import LocationPicker from '../LocationPicker.jsx'
import MetricConfigPanel from '../MetricConfigPanel.jsx'
import { auth } from '../../services/firebase'
import { getDeviceSecret } from '../../services/api'
import { useDeviceMetrics } from '../../hooks/useDeviceMetrics'
import { EmptyState, StatCard, StatusBadge } from '../common'
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
  { key: 'metrics', label: 'Metrics' },
  { key: 'alarms', label: 'Alarms' },
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

function formatThreshold(value, unit = '') {
  if (value == null || value === '') return '--'
  const numberValue = Number(value)
  const displayValue = Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(1)

  return `${displayValue}${unit ? ` ${unit}` : ''}`
}

function getMetricLabel(metrics, metricKey, rule = {}) {
  const metric = metrics.find((item) => item.metric_key === metricKey)
  return metric?.metric_name || rule.metric_name || metricKey || '--'
}

function getMetricUnit(metrics, metricKey, rule = {}) {
  const metric = metrics.find((item) => item.metric_key === metricKey)
  return metric?.unit || rule.unit || ''
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
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    const payload = {
      metric: metricKey,
      operator: draft.operator || '>',
      threshold: Number(draft.threshold),
      severity,
      is_active: draft.is_active !== false,
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
          <h3>กำลังโหลด Metric</h3>
          <p>กำลังเตรียมรายการ Metric สำหรับตั้ง Alarm</p>
        </div>
      </div>
    )
  }

  if (visibleMetrics.length === 0) {
    return (
      <div className="alarm-rules-panel-v2 devices-v3-alarm-rules-panel">
        <div className="alarm-rule-empty">
          ยังไม่มี Metric สำหรับตั้ง Alarm กรุณาเพิ่ม Metric ในแท็บ Metrics ก่อน
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
                    {metricKey}
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
                        <select
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
                        </select>
                      </label>

                      <label className="metric-alarm-field metric-alarm-threshold">
                        <span>Threshold {metricUnit ? `(${metricUnit})` : ''}</span>
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

                      <p className="metric-alarm-rule-preview">
                        Trigger when {metricName} {draft.operator || '>'}{' '}
                        {formatThreshold(draft.threshold, metricUnit)}
                      </p>
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

function maskSecret(secret = '') {
  if (!secret) return '••••••••••••••••••••••••'
  if (secret.length <= 8) return '••••••••'

  return `${secret.slice(0, 4)}••••••••••••${secret.slice(-4)}`
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
  onCreateMetricAlarm,
  onUpdateMetricAlarm,
  onDeleteAlarmRule,
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [secretPassword, setSecretPassword] = useState('')
  const [revealedSecret, setRevealedSecret] = useState('')
  const [secretVisible, setSecretVisible] = useState(false)
  const [secretLoading, setSecretLoading] = useState(false)
  const [secretError, setSecretError] = useState('')
  const [secretCopied, setSecretCopied] = useState(false)

  useEffect(() => {
    setSecretPassword('')
    setRevealedSecret('')
    setSecretVisible(false)
    setSecretError('')
    setSecretCopied(false)
  }, [selectedDevice?.id])

  async function handleRevealSecret() {
    if (!selectedDevice?.id || secretLoading) return

    setSecretError('')
    setSecretCopied(false)

    try {
      setSecretLoading(true)
      await reauthenticateCurrentUser(secretPassword)

      const result = await getDeviceSecret(selectedDevice.id)
      const nextSecret = result?.deviceSecret || ''

      if (!nextSecret) {
        throw new Error('ไม่พบ Device Secret ใน response จาก backend')
      }

      setRevealedSecret(nextSecret)
      setSecretVisible(true)
      setSecretPassword('')
    } catch (error) {
      const message = error?.message || 'ไม่สามารถดู Device Secret ได้'

      if (
        message.includes('SECRET_NOT_RECOVERABLE') ||
        message.includes('not recoverable') ||
        message.includes('ไม่สามารถถอดรหัส')
      ) {
        setSecretError(
          'Device นี้ยังไม่มี Secret แบบเข้ารหัสให้ดูย้อนหลังได้ กรุณา Reset Secret ใหม่ 1 ครั้ง แล้วนำ Secret ใหม่ไปใส่ใน Firmware / Gateway'
        )
      } else if (
        message.includes('auth/wrong-password') ||
        message.includes('auth/invalid-credential') ||
        message.includes('auth/invalid-login-credentials')
      ) {
        setSecretError('Password ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง')
      } else {
        setSecretError(message)
      }
    } finally {
      setSecretLoading(false)
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
    setSecretVisible(false)
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
  const selectedAlarmRuleCount = Array.isArray(selectedRules)
    ? selectedRules.length
    : 0


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
          <section className="devices-v3-overview-grid devices-v3-overview-grid-fit">
            <div className="devices-v3-overview-stat devices-v3-overview-stat-model">
              <StatCard
                label="Model"
                value={getModelLabel(selectedDevice)}
                hint="Device model"
              />
            </div>

            <div className="devices-v3-overview-stat devices-v3-overview-stat-firmware">
              <StatCard
                label="Firmware"
                value={selectedDevice.firmware_version || '--'}
                hint="Firmware version"
              />
            </div>

            <div className="devices-v3-overview-stat devices-v3-overview-stat-last-seen">
              <StatCard
                label="Last Seen"
                value={getLastSeen(selectedDevice)}
                hint="Latest ingest"
              />
            </div>
          </section>

          <section className="devices-v3-info-grid">
            <div>
              <label>Device Code</label>
              <p>{selectedDevice.device_code}</p>
            </div>
            <div>
              <label>Device ID</label>
              <p>{selectedDevice.id}</p>
            </div>
            <div>
              <label>Created / Latest</label>
              <p>
                {formatDate(
                  selectedDevice.created_at || selectedDevice.latest_time
                )}
              </p>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="devices-v3-tab-panel">


          <DeviceTabHeader
            eyebrow="Metric Display"
            title="Metrics"
            description="ตั้งชื่อ Metric, หน่วย, Icon และเลือกข้อมูลที่ต้องการแสดงบน Dashboard และ Device Detail"
            meta={`${selectedDevice.metric_count || 0} Channels`}
          />

          <MetricConfigPanel deviceId={selectedDevice.id} />
        </div>
      )}

      {activeTab === 'alarms' && (
        <div className="devices-v3-tab-panel">


          <DeviceTabHeader
            eyebrow="Alarm Rules"
            title="Alarms"
            description="ตั้งค่า Warning และ Critical แยกตาม Metric เพื่อให้ระบบแจ้งเตือนอัตโนมัติ"
            meta={`${selectedAlarmRuleCount} Rules`}
          />

          <DeviceAlarmRulesPanel
            deviceId={selectedDevice.id}
            alarmRules={Array.isArray(selectedRules) ? selectedRules : []}
            saving={saving}
            onCreateMetricAlarm={onCreateMetricAlarm}
            onUpdateMetricAlarm={onUpdateMetricAlarm}
            onDeleteAlarmRule={onDeleteAlarmRule}
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
              selectedDevice.latitude && selectedDevice.longitude
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
        <div className="devices-v3-tab-panel">
          <DeviceTabHeader
            eyebrow="Device Access"
            title="Security"
            description="ข้อมูลสำหรับ Firmware / Gateway ใช้ยืนยันตัวตนกับ Backend และจัดการ Secret"
            meta="Protected"
          />

          <section className="devices-v3-info-grid">
            <div>
              <label>Device Code</label>
              <p>{selectedDevice.device_code}</p>
            </div>
            <div>
              <label>Device Secret</label>
              <p>
                {revealedSecret
                  ? secretVisible
                    ? revealedSecret
                    : maskSecret(revealedSecret)
                  : 'ซ่อนเพื่อความปลอดภัย ต้องใส่ Password ก่อนดู'}
              </p>
            </div>
            <div>
              <label>Device ID</label>
              <p>{selectedDevice.id}</p>
            </div>
            <div>
              <label>Secret Status</label>
              <p>Secret เดิมจะใช้งานไม่ได้ทันทีหลัง Reset</p>
            </div>
          </section>

          <section className="devices-v3-security-reveal-card">
            <div className="devices-v3-security-action-copy">
              <span className="page-eyebrow">Secret Visibility</span>
              <h4>View Device Secret</h4>
              <p>
                กรอก Password ของบัญชีนี้เพื่อยืนยันตัวตนก่อนดู Device Secret
                สำหรับนำไปตั้งค่า Firmware / Gateway
              </p>
            </div>

            <div className="devices-v3-secret-viewer">
              <label className="devices-v3-secret-password-field">
                <span>Password</span>
                <div>
                  <Lock size={16} />
                  <input
                    type="password"
                    value={secretPassword}
                    placeholder="กรอก Password เพื่อดู Secret"
                    autoComplete="current-password"
                    disabled={secretLoading}
                    onChange={(event) => {
                      setSecretPassword(event.target.value)
                      setSecretError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleRevealSecret()
                      }
                    }}
                  />
                </div>
              </label>

              <div className="devices-v3-secret-output">
                <span>{revealedSecret ? 'Device Secret' : 'Hidden Secret'}</span>
                <code>
                  {revealedSecret
                    ? secretVisible
                      ? revealedSecret
                      : maskSecret(revealedSecret)
                    : '••••••••••••••••••••••••'}
                </code>
              </div>

              {secretError && (
                <p className="devices-v3-secret-message error">
                  {secretError}
                </p>
              )}

              {secretCopied && (
                <p className="devices-v3-secret-message success">
                  Copied Device Secret
                </p>
              )}

              <div className="devices-v3-secret-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={secretLoading || !secretPassword}
                  onClick={handleRevealSecret}
                >
                  <Eye size={16} />
                  {secretLoading ? 'Checking...' : 'View Secret'}
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  disabled={!revealedSecret}
                  onClick={() => setSecretVisible((current) => !current)}
                >
                  {secretVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  {secretVisible ? 'Hide' : 'Show'}
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  disabled={!revealedSecret}
                  onClick={handleCopySecret}
                >
                  <Copy size={16} />
                  Copy
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  disabled={!revealedSecret}
                  onClick={handleHideSecret}
                >
                  Clear
                </button>
              </div>
            </div>
          </section>

          <section className="devices-v3-security-action-card">
            <div className="devices-v3-security-action-copy">
              <span className="page-eyebrow">Secret Rotation</span>
              <h4>Reset Device Secret</h4>
              <p>
                ใช้เมื่อต้องการออก Secret ใหม่ให้ Firmware / Gateway เช่น
                เปลี่ยนอุปกรณ์ หรือสงสัยว่า Secret เดิมไม่ปลอดภัย
              </p>
            </div>

            <button
              type="button"
              className="save-btn devices-v3-reset-secret-btn"
              disabled={saving}
              onClick={() => onResetSecret(selectedDevice)}
            >
              <KeyRound size={16} />
              Reset Secret
            </button>
          </section>
        </div>
      )}
    </section>
  )
}

export default SelectedDevicePanel
