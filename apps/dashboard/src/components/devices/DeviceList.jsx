import { memo, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, Wifi } from 'lucide-react'
import { getDeviceMetricPills } from '../../utils/esp32Dht3Utils.js'
import {
  getDeviceDisplayName,
  getLastSeen,
  getModelLabel,
  getStatus,
  getStatusIcon,
  getStatusLabel,
} from './deviceUtils.jsx'

function getLatestMetricEntries(device = {}, limit = 3) {
  const latestMetrics = {
    ...(device.latest_metrics || device.metrics || {}),
  }

  if (device.temperature != null && latestMetrics.temperature == null) {
    latestMetrics.temperature = device.temperature
  }

  if (device.humidity != null && latestMetrics.humidity == null) {
    latestMetrics.humidity = device.humidity
  }

  if (device.rssi != null && latestMetrics.rssi == null) {
    latestMetrics.rssi = device.rssi
  }

  return Object.entries(latestMetrics)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([keyA], [keyB]) => getMetricIndex(keyA) - getMetricIndex(keyB))
    .slice(0, limit)
}

function getMetricIndex(metricKey = '') {
  const index = Number(String(metricKey).replace(/[^0-9]/g, ''))

  if (Number.isFinite(index) && index > 0) return index
  if (metricKey === 'temperature') return 1
  if (metricKey === 'humidity') return 2
  if (metricKey === 'rssi') return 999

  return 9999
}

function getMetricLabel(metricKey = '') {
  if (metricKey === 'temperature') return 'Temp'
  if (metricKey === 'humidity') return 'Hum'
  if (metricKey === 'rssi') return 'RSSI'

  const index = getMetricIndex(metricKey)
  return index > 0 && index < 999 ? `M${index}` : metricKey
}

function formatMetricValue(value) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) return String(value)
  if (Math.abs(numberValue) >= 1000) return numberValue.toFixed(0)

  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(1)
}

function getSignalQuality(device = {}) {
  const metricPills = getDeviceMetricPills(device, 3)
  const signalMetric = metricPills.find((metric) =>
    String(metric.key || '').toLowerCase().includes('3') ||
    String(metric.label || '').toLowerCase().includes('rssi') ||
    String(metric.name || '').toLowerCase().includes('wifi')
  )

  const value = Number(signalMetric?.value ?? device.rssi ?? device.metric_3)

  if (!Number.isFinite(value)) return 'Signal --'
  if (value >= -55) return 'Signal strong'
  if (value >= -70) return 'Signal good'
  return 'Signal weak'
}

const DeviceListItem = memo(function DeviceListItem({
  device,
  active,
  onSelect,
}) {
  const status = getStatus(device)
  const metricPills = getDeviceMetricPills(device, 3)

  return (
    <button
      type="button"
      key={device.id}
      className={`devices-v2-item devices-v3-item ${active ? 'active' : ''}`}
      onClick={() => onSelect(device.id)}
    >
      <div className="devices-v2-item-head devices-v3-item-top">
        <div>
          <div className="devices-v2-item-name devices-v3-item-name">
            {getDeviceDisplayName(device)}
          </div>

          <div className="devices-v2-item-code devices-v3-item-code">
            {device.device_code}
          </div>
        </div>

        <span className={`status ${status}`}>
          {getStatusIcon(status)}
          {getStatusLabel(status)}
        </span>
      </div>

      <div className="devices-v3-device-meta-line">
        <span className="device-model-badge">{getModelLabel(device)}</span>
        <span className="devices-v3-signal-chip">
          <Wifi size={13} />
          {getSignalQuality(device)}
        </span>
      </div>

      {metricPills.length > 0 && (
        <div className="devices-v3-item-metrics" aria-label="Latest metrics">
          {metricPills.map((metric) => (
            <span key={metric.key}>
              <b>{metric.label}</b>
              {metric.displayValue}
            </span>
          ))}
        </div>
      )}

      <div className="devices-v2-item-foot devices-v3-item-footer">
        <small>Last seen {getLastSeen(device)}</small>
      </div>
    </button>
  )
})

function DeviceList({
  devices,
  loading,
  selectedDevice,
  saving,
  errorMessage,
  onCreate,
  onSelect,
  onRetry,
}) {
  const [searchText, setSearchText] = useState('')

  const filteredDevices = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    if (!keyword) return devices

    return devices.filter((device) => {
      const values = [
        getDeviceDisplayName(device),
        device.device_code,
        device.model_name,
        device.group_name,
        getStatus(device),
      ]

      return values.filter(Boolean).join(' ').toLowerCase().includes(keyword)
    })
  }, [devices, searchText])

  function renderList() {
    if (loading) {
      return (
        <div className="devices-v3-skeleton-list" aria-label="Loading devices">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="devices-v3-skeleton-card" key={index} />
          ))}
        </div>
      )
    }

    if (errorMessage) {
      return (
        <div className="app-empty-state compact-empty-state devices-v3-error-state">
          <h3>โหลด Device ไม่สำเร็จ</h3>
          <p>{errorMessage}</p>
          {onRetry && (
            <button type="button" className="secondary-button" onClick={onRetry}>
              <RefreshCw size={16} />
              Retry
            </button>
          )}
        </div>
      )
    }

    if (!devices.length) {
      return (
        <div className="app-empty-state compact-empty-state">
          <h3>ยังไม่มี Device</h3>
          <p>กด Create Device เพื่อเริ่มเชื่อมต่อ ESP32 หรือ Gateway ตัวแรก</p>
        </div>
      )
    }

    if (!filteredDevices.length) {
      return (
        <div className="app-empty-state compact-empty-state">
          <h3>ไม่พบ Device</h3>
          <p>ลองเปลี่ยนคำค้นหา หรือค้นจาก Device Code / ชื่ออุปกรณ์</p>
        </div>
      )
    }

    return filteredDevices.map((device) => (
      <DeviceListItem
        key={device.id}
        device={device}
        active={String(selectedDevice?.id) === String(device.id)}
        onSelect={onSelect}
      />
    ))
  }

  return (
    <aside className="devices-v2-list">
      <div className="app-card devices-v2-list-card devices-v3-list-card">
        <div className="app-section-title devices-v2-list-title">
          <div>
            <h3>Device List</h3>
            <p>{devices.length} registered devices</p>
          </div>

          <div className="device-v2-header-actions">
            <button
              type="button"
              className="primary-button devices-v3-create-btn"
              onClick={onCreate}
              disabled={saving}
            >
              <Plus size={18} />
              Create Device
            </button>
          </div>
        </div>

        <div className="devices-v3-search-box">
          <Search size={16} />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search name, code, model..."
          />
        </div>

        <div className="devices-v2-list-scroll devices-v3-list-scroll" role="list">
          {renderList()}
        </div>
      </div>
    </aside>
  )
}

export default DeviceList



