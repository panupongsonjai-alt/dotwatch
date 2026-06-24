import { useMemo, useState } from 'react'
import {
  BellRing,
  Edit3,
  KeyRound,
  MapPin,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import LocationPicker from '../LocationPicker.jsx'
import MetricConfigPanel from '../MetricConfigPanel.jsx'
import { useDeviceMetrics } from '../../hooks/useDeviceMetrics'
import { EmptyState, SectionHeader, StatCard, StatusBadge } from '../common'
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

  const [alarmDraft, setAlarmDraft] = useState({
    metric: '',
    operator: '>',
    threshold: '',
    severity: 'warning',
  })

  const [editingRuleId, setEditingRuleId] = useState(null)
  const [editingRule, setEditingRule] = useState(null)

  const defaultMetricKey =
    alarmDraft.metric || visibleMetrics[0]?.metric_key || ''

  async function handleCreateAlarm() {
    const metricKey = alarmDraft.metric || visibleMetrics[0]?.metric_key

    if (!metricKey) {
      alert('กรุณาเพิ่ม Metric ก่อนตั้ง Alarm')
      return
    }

    if (
      alarmDraft.threshold === '' ||
      Number.isNaN(Number(alarmDraft.threshold))
    ) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    await onCreateMetricAlarm?.(deviceId, metricKey, {
      metric: metricKey,
      operator: alarmDraft.operator || '>',
      threshold: Number(alarmDraft.threshold),
      severity: alarmDraft.severity || 'warning',
      is_active: true,
    })

    setAlarmDraft({
      metric: metricKey,
      operator: '>',
      threshold: '',
      severity: 'warning',
    })
  }

  function startEditRule(rule) {
    setEditingRuleId(rule.id)
    setEditingRule({
      ...rule,
      threshold: rule.threshold ?? '',
      is_active: rule.is_active !== false,
    })
  }

  async function saveEditRule() {
    if (!editingRule) return

    if (
      editingRule.threshold === '' ||
      Number.isNaN(Number(editingRule.threshold))
    ) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    await onUpdateMetricAlarm?.(editingRule.id, {
      ...editingRule,
      threshold: Number(editingRule.threshold),
      is_active: editingRule.is_active !== false,
    })

    setEditingRuleId(null)
    setEditingRule(null)
  }

  return (
    <div className="alarm-rules-panel-v2 devices-v3-alarm-rules-panel">
      <div className="alarm-rule-create-row alarm-rule-create-row-v2">
        <select
          value={defaultMetricKey}
          onChange={(event) =>
            setAlarmDraft((current) => ({
              ...current,
              metric: event.target.value,
            }))
          }
          disabled={saving || loadingMetrics || visibleMetrics.length === 0}
        >
          {visibleMetrics.map((metric) => (
            <option key={metric.metric_key} value={metric.metric_key}>
              {metric.metric_name || metric.metric_key}
            </option>
          ))}
        </select>

        <select
          value={alarmDraft.operator}
          onChange={(event) =>
            setAlarmDraft((current) => ({
              ...current,
              operator: event.target.value,
            }))
          }
          disabled={saving || loadingMetrics}
        >
          {OPERATORS.map((operator) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={alarmDraft.threshold}
          placeholder="Threshold"
          onChange={(event) =>
            setAlarmDraft((current) => ({
              ...current,
              threshold: event.target.value,
            }))
          }
          disabled={saving || loadingMetrics}
        />

        <select
          value={alarmDraft.severity}
          onChange={(event) =>
            setAlarmDraft((current) => ({
              ...current,
              severity: event.target.value,
            }))
          }
          disabled={saving || loadingMetrics}
        >
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity === 'critical' ? 'Critical' : 'Warning'}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="save-btn"
          onClick={handleCreateAlarm}
          disabled={saving || loadingMetrics || visibleMetrics.length === 0}
        >
          Add Rule
        </button>
      </div>

      {visibleMetrics.length === 0 && (
        <div className="alarm-rule-empty">
          ยังไม่มี Metric สำหรับตั้ง Alarm กรุณาเพิ่ม Metric ในแท็บ Metrics ก่อน
        </div>
      )}

      {alarmRules.length === 0 ? (
        <div className="alarm-rule-empty">
          ยังไม่มี Alarm Rule สำหรับ Device นี้
        </div>
      ) : (
        <div className="device-alarm-rule-list device-alarm-rule-list-v2">
          {alarmRules.map((rule) => {
            const isEditing = editingRuleId === rule.id
            const metricUnit = getMetricUnit(draftMetrics, rule.metric, rule)

            if (isEditing && editingRule) {
              return (
                <div
                  key={rule.id}
                  className="device-alarm-rule-item alarm-rule-edit-row-v2"
                >
                  <select
                    value={editingRule.metric}
                    onChange={(event) =>
                      setEditingRule((current) => ({
                        ...current,
                        metric: event.target.value,
                      }))
                    }
                    disabled={saving || loadingMetrics}
                  >
                    {visibleMetrics.map((metric) => (
                      <option key={metric.metric_key} value={metric.metric_key}>
                        {metric.metric_name || metric.metric_key}
                      </option>
                    ))}
                  </select>

                  <select
                    value={editingRule.operator || '>'}
                    onChange={(event) =>
                      setEditingRule((current) => ({
                        ...current,
                        operator: event.target.value,
                      }))
                    }
                    disabled={saving}
                  >
                    {OPERATORS.map((operator) => (
                      <option key={operator} value={operator}>
                        {operator}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    value={editingRule.threshold}
                    onChange={(event) =>
                      setEditingRule((current) => ({
                        ...current,
                        threshold: event.target.value,
                      }))
                    }
                    disabled={saving}
                  />

                  <select
                    value={editingRule.severity || 'warning'}
                    onChange={(event) =>
                      setEditingRule((current) => ({
                        ...current,
                        severity: event.target.value,
                      }))
                    }
                    disabled={saving}
                  >
                    {SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity === 'critical' ? 'Critical' : 'Warning'}
                      </option>
                    ))}
                  </select>

                  <label className="metric-visible-toggle">
                    <input
                      type="checkbox"
                      checked={editingRule.is_active !== false}
                      onChange={(event) =>
                        setEditingRule((current) => ({
                          ...current,
                          is_active: event.target.checked,
                        }))
                      }
                      disabled={saving}
                    />
                    Active
                  </label>

                  <div className="alarm-rule-actions">
                    <button
                      type="button"
                      className="save-btn"
                      onClick={saveEditRule}
                      disabled={saving}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={saving}
                      onClick={() => {
                        setEditingRuleId(null)
                        setEditingRule(null)
                      }}
                    >
                      <X size={15} />
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={rule.id}
                className="device-alarm-rule-item device-alarm-rule-item-v2"
              >
                <div className="alarm-rule-summary-v2">
                  <strong>
                    {getMetricLabel(draftMetrics, rule.metric, rule)}{' '}
                    {rule.operator}{' '}
                    {formatThreshold(rule.threshold, metricUnit)}
                  </strong>
                  <span>{rule.metric}</span>
                </div>

                <span className={`status ${rule.severity || 'warning'}`}>
                  {rule.severity || 'warning'}
                </span>

                <span
                  className={
                    rule.is_active !== false
                      ? 'status online'
                      : 'status offline'
                  }
                >
                  {rule.is_active !== false ? 'Active' : 'Disabled'}
                </span>

                <div className="alarm-rule-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={saving}
                    onClick={() => startEditRule(rule)}
                  >
                    <Edit3 size={15} />
                    Edit
                  </button>

                  <button
                    type="button"
                    className="delete-btn"
                    disabled={saving}
                    onClick={() => onDeleteAlarmRule?.(rule.id)}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
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

  const activeRuleCount = useMemo(() => {
    return selectedRules.filter((rule) => rule.is_active !== false).length
  }, [selectedRules])

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
            className="save-btn"
            disabled={saving}
            onClick={() => onResetSecret(selectedDevice)}
          >
            <KeyRound size={16} />
            Reset Secret
          </button>

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
        {DETAIL_TABS.map((tab) => {
          const badge =
            tab.key === 'alarms'
              ? selectedRules.length
              : tab.key === 'overview'
                ? getStatusLabel(status)
                : null

          return (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? 'active' : ''}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {badge != null && <b>{badge}</b>}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="devices-v3-tab-panel">
          <section className="devices-v3-overview-grid">
            <StatCard
              label="Status"
              value={getStatusLabel(status)}
              hint="Current state"
              tone={
                status === 'online'
                  ? 'success'
                  : status === 'warning'
                    ? 'warning'
                    : 'danger'
              }
            />
            <StatCard
              label="Model"
              value={getModelLabel(selectedDevice)}
              hint="Device model"
            />
            <StatCard
              label="Firmware"
              value={selectedDevice.firmware_version || '--'}
              hint="Firmware version"
            />
            <StatCard
              label="Last Seen"
              value={getLastSeen(selectedDevice)}
              hint="Latest ingest"
            />
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
              <label>Group</label>
              <p>{selectedDevice.group_name || 'Default'}</p>
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
          <SectionHeader
            title="Metric Configuration"
            description="ตั้งชื่อ Metric, หน่วย และการแสดงผลบน Dashboard / Device Detail"
          />

          <MetricConfigPanel deviceId={selectedDevice.id} />
        </div>
      )}

      {activeTab === 'alarms' && (
        <div className="devices-v3-tab-panel">
          <SectionHeader
            title={`Alarm Rules (${selectedRules.length})`}
            description={`${activeRuleCount} active rules for this device`}
          />

          <DeviceAlarmRulesPanel
            deviceId={selectedDevice.id}
            alarmRules={selectedRules}
            saving={saving}
            onCreateMetricAlarm={onCreateMetricAlarm}
            onUpdateMetricAlarm={onUpdateMetricAlarm}
            onDeleteAlarmRule={onDeleteAlarmRule}
          />
        </div>
      )}

      {activeTab === 'location' && (
        <div className="devices-v3-tab-panel devices-v3-location-panel">
          <SectionHeader
            title="Device Location"
            description="คลิกบนแผนที่เพื่อเลือกตำแหน่งของ Device"
            actions={<MapPin size={18} />}
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
          <SectionHeader
            title="Security"
            description="ข้อมูลสำหรับ Firmware / Gateway ใช้ยืนยันตัวตนกับ Backend"
          />

          <section className="devices-v3-info-grid">
            <div>
              <label>Device Code</label>
              <p>{selectedDevice.device_code}</p>
            </div>
            <div>
              <label>Device Secret</label>
              <p>ซ่อนเพื่อความปลอดภัย กด Reset เพื่อออก Secret ใหม่</p>
            </div>
            <div>
              <label>Device ID</label>
              <p>{selectedDevice.id}</p>
            </div>
            <div>
              <label>Reset Secret</label>
              <p>Secret เดิมจะใช้งานไม่ได้ทันทีหลัง Reset</p>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default SelectedDevicePanel
