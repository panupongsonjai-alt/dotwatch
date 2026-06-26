import { useEffect, useMemo, useState } from 'react'
import {
  Edit3,
  KeyRound,
  MapPin,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import LocationPicker from '../LocationPicker.jsx'
import MetricConfigPanel from '../MetricConfigPanel.jsx'
import { useDeviceMetrics } from '../../hooks/useDeviceMetrics'
import { EmptyState, SectionHeader, StatCard } from '../common'
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
    <div className="alarm-rules-panel-v2 devices-v3-alarm-rules-panel metric-alarm-panel">
      <div className="alarm-rule-empty metric-alarm-note">
        ตั้งค่าได้ 2 Alarm Rule ต่อ 1 Metric: Warning และ Critical
      </div>

      <div className="metric-alarm-rule-grid">
        {visibleMetrics.map((metric) => {
          const metricKey = metric.metric_key
          const metricName = metric.metric_name || metric.metric_key
          const metricUnit = metric.unit || ''
          const metricDrafts = alarmDrafts?.[metricKey] || {}

          return (
            <section
              key={metricKey}
              className="devices-v3-rule-card metric-alarm-card"
            >
              <div className="alarm-rule-summary-v2 metric-alarm-card-header">
                <strong>{metricName}</strong>
                <span>{metricKey}</span>
              </div>

              <div className="metric-alarm-rule-list">
                {SEVERITIES.map((severity) => {
                  const draft = metricDrafts[severity] || {
                    operator: severity === 'critical' ? '>' : '>=',
                    threshold: '',
                    is_active: true,
                  }
                  return (
                    <div
                      key={`${metricKey}-${severity}`}
                      className="device-alarm-rule-item alarm-rule-edit-row-v2 metric-alarm-rule-row"
                    >
                      <span className={`status ${severity}`}>
                        {severity === 'critical' ? 'Critical' : 'Warning'}
                      </span>

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

                      <input
                        type="number"
                        value={draft.threshold}
                        placeholder={`Threshold${metricUnit ? ` (${metricUnit})` : ''}`}
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

                      <label className="metric-visible-toggle">
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
                        Active
                      </label>

                      <div className="alarm-rule-actions">
                        <button
                          type="button"
                          className="save-btn"
                          disabled={saving}
                          onClick={() =>
                            saveMetricSeverityRule(metricKey, severity)
                          }
                        >
                          Save
                        </button>
                      </div>
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

  return (
    <section className="app-card devices-v3-detail-card">
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
          const badge = tab.key === 'overview' ? getStatusLabel(status) : null

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
            title="Alarm Rules"
            description="Configure Warning and Critical thresholds for each metric"
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
