import { Plus } from 'lucide-react'
import {
  getDeviceDisplayName,
  getLastSeen,
  getModelLabel,
  getStatus,
  getStatusIcon,
  getStatusLabel,
} from './deviceUtils.jsx'

function DeviceList({
  devices,
  loading,
  selectedDevice,
  saving,
  onCreate,
  onSelect,
}) {
  function renderList() {
    if (loading) {
      return (
        <div className="app-empty-state compact-empty-state">
          <h3>กำลังโหลด</h3>
          <p>กำลังดึงข้อมูล Device</p>
        </div>
      )
    }

    if (!devices.length) {
      return (
        <div className="app-empty-state compact-empty-state">
          <h3>ยังไม่มี Device</h3>
          <p>กด Create เพื่อเริ่มต้น</p>
        </div>
      )
    }

    return devices.map((device) => {
      const status = getStatus(device)
      const active = String(selectedDevice?.id) === String(device.id)

      return (
        <button
          type="button"
          key={device.id}
          className={`devices-v2-item ${active ? 'active' : ''}`}
          onClick={() => onSelect(device.id)}
        >
          <div className="devices-v2-item-head">
            <div>
              <div className="devices-v2-item-name">
                {getDeviceDisplayName(device)}
              </div>

              <div className="devices-v2-item-code">{device.device_code}</div>
            </div>

            <span className={`status ${status}`}>
              {getStatusIcon(status)}
              {getStatusLabel(status)}
            </span>
          </div>

          <div className="devices-v2-item-foot">
            <span className="device-model-badge">{getModelLabel(device)}</span>
            <small>{getLastSeen(device)}</small>
          </div>
        </button>
      )
    })
  }

  return (
    <aside className="devices-v2-list">
      <div className="app-card devices-v2-list-card">
        <div className="app-section-title devices-v2-list-title">
          <div>
            <h3>Devices</h3>
            <p>{devices.length} devices registered</p>
            <div className="device-v2-header-actions">
              <button
                type="button"
                className="primary-button"
                onClick={onCreate}
                disabled={saving}
              >
                <Plus size={18} />
                Create Device
              </button>
            </div>
          </div>
        </div>

        <div className="devices-v2-list-scroll">{renderList()}</div>
      </div>
    </aside>
  )
}

export default DeviceList
