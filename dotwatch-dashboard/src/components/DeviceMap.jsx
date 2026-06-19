import { useMemo, useState } from 'react'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
} from 'react-leaflet'
import L from 'leaflet'
import { Search } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [13.5991, 100.5998]

function getStatus(device) {
  return device.status || 'offline'
}

function getStatusColor(status) {
  if (status === 'online') return '#22c55e'
  if (status === 'warning') return '#f59e0b'
  return '#ef4444'
}

function createDeviceIcon(status) {
  const color = getStatusColor(status)

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: ${color};
        border: 3px solid white;
        box-shadow: 0 8px 20px rgba(0,0,0,.35);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function getDevicePosition(device, index) {
  if (device.latitude != null && device.longitude != null) {
    return [
      Number(device.latitude),
      Number(device.longitude),
    ]
  }

  const angle = index * 0.7
  const radius = 0.012 + index * 0.0008

  return [
    DEFAULT_CENTER[0] + Math.sin(angle) * radius,
    DEFAULT_CENTER[1] + Math.cos(angle) * radius,
  ]
}

function DeviceMap({ devices = [], onOpenDevice }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const keyword = `${device.name || ''} ${device.device_code || ''}`.toLowerCase()
      const status = getStatus(device)

      return (
        keyword.includes(search.toLowerCase()) &&
        (statusFilter === 'all' || status === statusFilter)
      )
    })
  }, [devices, search, statusFilter])

  return (
    <section className="device-map-card panel">
      <div className="device-map-header">
        <div className="section-title">
          <h2>Device Map</h2>
          <p>แสดงตำแหน่งและสถานะอุปกรณ์ทั้งหมดบนแผนที่</p>
        </div>

        <div className="device-status-tools">
          <div className="device-status-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search device..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="warning">Warning</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      <div className="status-map-legend">
        <span><b className="online" /> Online</span>
        <span><b className="warning" /> Warning</span>
        <span><b className="offline" /> Offline</span>
      </div>

      <div className="device-map-wrapper">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={13}
          scrollWheelZoom={false}
          className="device-map"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredDevices.map((device, index) => {
            const status = getStatus(device)
            const position = getDevicePosition(device, index)

            return (
              <Marker
                key={device.id}
                position={position}
                icon={createDeviceIcon(status)}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>
                      {device.name ||
                        device.device_code ||
                        `Device ${device.id}`}
                    </strong>

                    <p>
                      Status:{' '}
                      <span className={`status-text ${status}`}>
                        {status}
                      </span>
                    </p>

                    <p>
                      Temp:{' '}
                      {device.temperature != null
                        ? `${Number(device.temperature).toFixed(1)} °C`
                        : '--'}
                    </p>

                    <p>
                      Humidity:{' '}
                      {device.humidity != null
                        ? `${Number(device.humidity).toFixed(1)} %`
                        : '--'}
                    </p>

                    <button
                      type="button"
                      className="map-popup-button"
                      onClick={() => onOpenDevice?.(device.id)}
                    >
                      Open Device
                    </button>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    </section>
  )
}

export default DeviceMap