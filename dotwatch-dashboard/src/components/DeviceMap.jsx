import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Search } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [13.7563, 100.5018]

function getStatus(device) {
  return device.status || 'offline'
}

function getStatusColor(status) {
  if (status === 'online') return '#22c55e'
  if (status === 'warning') return '#f59e0b'
  return '#ef4444'
}

function getVisibleDevicePositions(devices) {
  return devices.map((device, index) => {
    if (device.latitude != null && device.longitude != null) {
      return [Number(device.latitude), Number(device.longitude)]
    }

    return getDevicePosition(device, index)
  })
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
    return [Number(device.latitude), Number(device.longitude)]
  }

  const angle = index * 0.7
  const radius = 0.012 + index * 0.0008

  return [
    DEFAULT_CENTER[0] + Math.sin(angle) * radius,
    DEFAULT_CENTER[1] + Math.cos(angle) * radius,
  ]
}

function getRealDeviceLocations(devices) {
  return devices
    .filter((device) => device.latitude != null && device.longitude != null)
    .map((device) => [Number(device.latitude), Number(device.longitude)])
}

function FitBounds({ devices }) {
  const map = useMap()

  useEffect(() => {
    const positions = devices
      .filter((device) => device.latitude != null && device.longitude != null)
      .map((device) => [Number(device.latitude), Number(device.longitude)])

    // ไม่มีพิกัดเลย → แสดงประเทศไทย
    if (positions.length === 0) {
      map.fitBounds(
        [
          [5.5, 97.0],
          [20.5, 105.5],
        ],
        {
          padding: [40, 40],
          animate: true,
        }
      )

      return
    }

    // มีแค่ตัวเดียว
    if (positions.length === 1) {
      map.setView(positions[0], 15)

      return
    }

    // หลายตัว → Fit ทั้งหมด
    map.fitBounds(positions, {
      padding: [60, 60],
      maxZoom: 15,
      animate: true,
    })
  }, [devices, map])

  return null
}

function DeviceMap({ devices = [] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const keyword =
        `${device.name || ''} ${device.device_code || ''}`.toLowerCase()

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
        <div className="device-map-title-row">
          <h2>Device Map</h2>

          <div className="status-map-legend">
            <span>
              <b className="online" />
              Online
            </span>

            <span>
              <b className="warning" />
              Warning
            </span>

            <span>
              <b className="offline" />
              Offline
            </span>
          </div>
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

      <div className="device-map-wrapper">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={10}
          scrollWheelZoom={true}
          className="device-map"
        >
          <FitBounds devices={filteredDevices} />

          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredDevices.map((device, index) => {
            const status = getStatus(device)
            const position = getDevicePosition(device, index)

            const deviceId = device.id || device.device_code
            const isSelected = selectedDeviceId === deviceId

            return (
              <Marker
                key={deviceId}
                position={position}
                icon={createDeviceIcon(status)}
                eventHandlers={{
                  click: () => {
                    setSelectedDeviceId(isSelected ? null : deviceId)
                  },
                }}
              >
                {isSelected && (
                  <Tooltip
                    permanent
                    direction="top"
                    offset={[0, -12]}
                    className="device-tooltip compact"
                  >
                    <div className="device-tooltip-row">
                      <strong>
                        {device.name || device.device_code || 'Unnamed Device'}
                      </strong>

                      <span className={`status-text ${status}`}>{status}</span>

                      <span>
                        Temp:{' '}
                        {device.temperature != null
                          ? `${Number(device.temperature).toFixed(1)}°C`
                          : '--'}
                      </span>

                      <span>
                        Humidity:{' '}
                        {device.humidity != null
                          ? `${Number(device.humidity).toFixed(1)}%`
                          : '--'}
                      </span>
                    </div>
                  </Tooltip>
                )}
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    </section>
  )
}

export default DeviceMap
