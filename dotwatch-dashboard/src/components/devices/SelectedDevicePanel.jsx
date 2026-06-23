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
import {
  EmptyState,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '../common'
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
          {status === 'online' ? <ShieldCheck size={22} /> : <BellRing size={22} />}
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

      <div className="devices-v3-tabs" role="tablist" aria-label="Device sections">
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
          <section className="devices-v3-overview-grid">
            <StatCard
              label="Status"
              value={getStatusLabel(status)}
              hint="Current state"
              tone={status === 'online' ? 'success' : status === 'warning' ? 'warning' : 'danger'}
            />
            <StatCard label="Model" value={getModelLabel(selectedDevice)} hint="Device model" />
            <StatCard label="Firmware" value={selectedDevice.firmware_version || '--'} hint="Firmware version" />
            <StatCard label="Last Seen" value={getLastSeen(selectedDevice)} hint="Latest ingest" />
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
              <p>{formatDate(selectedDevice.created_at || selectedDevice.latest_time)}</p>
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

          <MetricConfigPanel
            deviceId={selectedDevice.id}
            alarmRules={selectedRules}
            onCreateAlarm={(metricKey, draft) =>
              onCreateMetricAlarm(selectedDevice.id, metricKey, draft)
            }
            onUpdateAlarm={onUpdateMetricAlarm}
            onDeleteAlarm={onDeleteAlarmRule}
          />
        </div>
      )}

      {activeTab === 'alarms' && (
        <div className="devices-v3-tab-panel">
          <SectionHeader
            title={`Alarm Rules (${selectedRules.length})`}
            description={`${activeRuleCount} active rules for this device. เพิ่มหรือแก้ไข Rule ได้ในแท็บ Metrics`}
          />

          {selectedRules.length === 0 ? (
            <EmptyState
              title="ยังไม่มี Alarm Rule"
              description="ไปที่แท็บ Metrics เพื่อเพิ่ม Alarm Rule ให้ Metric ที่ต้องการ"
            />
          ) : (
            <div className="devices-v3-rule-list">
              {selectedRules.map((rule) => (
                <article key={rule.id} className="devices-v3-rule-card">
                  <div>
                    <strong>{rule.metric_name || rule.metric}</strong>
                    <p>
                      {rule.metric} {rule.operator} {rule.threshold}
                      {rule.unit ? ` ${rule.unit}` : ''}
                    </p>
                  </div>

                  <StatusBadge
                    status={rule.severity || 'warning'}
                    label={rule.severity || 'warning'}
                    size="sm"
                  />

                  <button
                    type="button"
                    className="delete-btn"
                    disabled={saving}
                    onClick={() => onDeleteAlarmRule(rule.id)}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </article>
              ))}
            </div>
          )}
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
              setLocations((prev) => ({ ...prev, [selectedDevice.id]: location }))
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
