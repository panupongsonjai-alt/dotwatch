import { Edit3, KeyRound, MapPin, Save, Trash2, X } from 'lucide-react'
import LocationPicker from '../LocationPicker.jsx'
import MetricConfigPanel from '../MetricConfigPanel.jsx'
import {
  formatDate,
  getDeviceDisplayName,
  getLastSeen,
  getModelLabel,
  getStatus,
  getStatusLabel,
} from './deviceUtils.jsx'

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
  if (!selectedDevice) {
    return (
      <section className="app-card">
        <div className="app-empty-state">
          <h3>ยังไม่ได้เลือก Device</h3>
          <p>เลือก Device จากรายการด้านซ้ายเพื่อจัดการ</p>
        </div>
      </section>
    )
  }

  const isEditing = editingDeviceId === selectedDevice.id
  const status = getStatus(selectedDevice)

  return (
    <>
      <section className="app-card devices-v2-overview-card">
        <div className="devices-v2-selected-header">
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

          <div className="device-action-row clean-device-actions">
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

        <div className="devices-v2-overview-grid">
          <div className="devices-v2-mini-stat">
            <span>Status</span>
            <strong className={`status-text ${status}`}>
              {getStatusLabel(status)}
            </strong>
          </div>

          <div className="devices-v2-mini-stat">
            <span>Model</span>
            <strong>{getModelLabel(selectedDevice)}</strong>
          </div>

          <div className="devices-v2-mini-stat">
            <span>Firmware</span>
            <strong>{selectedDevice.firmware_version || '--'}</strong>
          </div>

          <div className="devices-v2-mini-stat">
            <span>Last Seen</span>
            <strong>{getLastSeen(selectedDevice)}</strong>
          </div>
        </div>
      </section>

      <section className="app-card devices-v2-config-card">
        <div className="app-section-title">
          <h3>Metrics & Alarm Rules</h3>
          <p>ตั้งชื่อ Metric, หน่วย, การแสดงผล และ Alarm ของ Device นี้</p>
        </div>

        <MetricConfigPanel
          deviceId={selectedDevice.id}
          alarmRules={selectedRules}
          onCreateAlarm={(metricKey, draft) =>
            onCreateMetricAlarm(selectedDevice.id, metricKey, draft)
          }
          onUpdateAlarm={onUpdateMetricAlarm}
          onDeleteAlarm={onDeleteAlarmRule}
        />
      </section>

      <section className="app-card devices-v2-config-card">
        <div className="device-location-header">
          <strong>
            <MapPin size={16} />
            Device Location
          </strong>
          <span>คลิกบนแผนที่เพื่อเลือกตำแหน่งของ Device</span>
        </div>

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
      </section>

      <section className="app-card devices-v2-config-card">
        <div className="app-section-title">
          <h3>Security</h3>
          <p>ข้อมูลสำหรับ Firmware / Gateway ใช้ยืนยันตัวตนกับ Backend</p>
        </div>

        <div className="device-info-grid">
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
            <label>Created / Latest</label>
            <p>{formatDate(selectedDevice.created_at || selectedDevice.latest_time)}</p>
          </div>
        </div>
      </section>
    </>
  )
}

export default SelectedDevicePanel
