import { Plus } from 'lucide-react'
import { EmptyState, SectionHeader, StatusBadge } from '../common'
import {
  getDeviceDisplayName,
  getLastSeen,
  getModelLabel,
  getStatus,
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
        <EmptyState
          title="กำลังโหลด"
          description="กำลังดึงข้อมูล Device จาก Backend"
        />
      )
    }

    if (!devices.length) {
      return (
        <EmptyState
          title="ยังไม่มี Device"
          description="กด Create Device เพื่อเริ่มต้นเพิ่มอุปกรณ์ตัวแรก"
          action={
            <button
              type="button"
              className="primary-button"
              onClick={onCreate}
              disabled={saving}
            >
              <Plus size={18} />
              Create Device
            </button>
          }
        />
      )
    }

    return devices.map((device) => {
      const status = getStatus(device)
      const active = String(selectedDevice?.id) === String(device.id)

      return (
        <button
          type="button"
          key={device.id}
          className={`devices-v3-item ${active ? 'active' : ''}`}
          onClick={() => onSelect(device.id)}
        >
          <div className="devices-v3-item-top">
            <StatusBadge
              status={status}
              label={getStatusLabel(status)}
              size="sm"
            />

            <span className="device-model-badge">{getModelLabel(device)}</span>
          </div>

          <div>
            <div className="devices-v3-item-name">
              {getDeviceDisplayName(device)}
            </div>
            <div className="devices-v3-item-code">{device.device_code}</div>
          </div>

          <div className="devices-v3-item-footer">
            <span>Last update</span>
            <strong>{getLastSeen(device)}</strong>
          </div>
        </button>
      )
    })
  }

  return (
    <aside className="devices-v2-list">
      <div className="app-card devices-v2-list-card devices-v3-list-card">
        <SectionHeader
          title="Devices"
          description={`${devices.length} devices registered`}
          actions={
            <button
              type="button"
              className="primary-button devices-v3-create-btn"
              onClick={onCreate}
              disabled={saving}
            >
              <Plus size={18} />
              Create
            </button>
          }
        />

        <div className="devices-v2-list-scroll devices-v3-list-scroll">
          {renderList()}
        </div>
      </div>
    </aside>
  )
}

export default DeviceList
