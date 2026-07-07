import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [13.7563, 100.5018]

function getStatus(device = {}) {
  return String(device.status || 'offline').trim().toLowerCase()
}

function getStatusLabel(status = 'offline') {
  if (status === 'online') return 'Online'
  if (status === 'warning') return 'Warning'
  if (status === 'critical') return 'Critical'

  return 'Offline'
}

function getStatusColor(status) {
  if (status === 'online') return '#22c55e'
  if (status === 'warning') return '#f59e0b'
  if (status === 'critical') return '#ef4444'

  return '#64748b'
}

function getDeviceName(device = {}) {
  return device.name || device.device_code || 'Unnamed Device'
}

function getDeviceCode(device = {}) {
  return device.device_code || `ID ${device.id || '--'}`
}

function isValidCoordinate(latitude, longitude) {
  return (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  )
}

function getFallbackPosition(index = 0) {
  const angle = index * 0.65
  const radius = 0.012 + index * 0.0015

  return [
    DEFAULT_CENTER[0] + Math.sin(angle) * radius,
    DEFAULT_CENTER[1] + Math.cos(angle) * radius,
  ]
}

function getDevicePosition(device, index) {
  if (isValidCoordinate(device.latitude, device.longitude)) {
    return [Number(device.latitude), Number(device.longitude)]
  }

  return getFallbackPosition(index)
}

function createDeviceIcon(device) {
  const status = getStatus(device)
  const color = getStatusColor(status)

  return L.divIcon({
    className: 'device-map-marker-shell',
    html: `
      <span
        class="device-map-marker-dot"
        style="
          --device-status-color: ${color};
          background: ${color};
          box-shadow: 0 0 0 6px ${color}24, 0 12px 24px ${color}35;
        "
      ></span>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function MapAutoFit({ positions }) {
  const map = useMap()

  useEffect(() => {
    if (!positions.length) {
      map.setView(DEFAULT_CENTER, 11)
      return
    }

    if (positions.length === 1) {
      map.setView(positions[0], 14)
      return
    }

    const bounds = L.latLngBounds(positions)
    map.fitBounds(bounds, {
      padding: [42, 42],
      maxZoom: 15,
    })
  }, [map, positions])

  return null
}

function DeviceMap({ devices = [], onOpenDevice }) {
  const visibleDevices = useMemo(() => {
    return Array.isArray(devices) ? devices : []
  }, [devices])

  const devicesWithPositions = useMemo(() => {
    return visibleDevices.map((device, index) => ({
      device,
      position: getDevicePosition(device, index),
    }))
  }, [visibleDevices])

  const positions = useMemo(
    () => devicesWithPositions.map((item) => item.position),
    [devicesWithPositions]
  )

  if (!visibleDevices.length) {
    return (
      <div className="device-map-empty">
        <strong>No devices on map</strong>
        <p>ยังไม่มี Device สำหรับแสดงบนแผนที่</p>
      </div>
    )
  }

  return (
    <div className="device-map-wrapper">
      <MapContainer
        center={positions[0] || DEFAULT_CENTER}
        zoom={12}
        scrollWheelZoom={false}
        className="dashboard-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapAutoFit positions={positions} />

        {devicesWithPositions.map(({ device, position }) => {
          const deviceName = getDeviceName(device)
          const status = getStatus(device)
          const statusLabel = getStatusLabel(status)

          return (
            <Marker
              key={device.id || device.device_code}
              position={position}
              icon={createDeviceIcon(device)}
              eventHandlers={
                typeof onOpenDevice === 'function'
                  ? {
                      click: () => onOpenDevice(device.id),
                    }
                  : undefined
              }
            >
              <Tooltip
                permanent
                direction="top"
                offset={[0, -16]}
                opacity={1}
                className={`device-map-label ${status}`}
              >
                <div className="device-map-label-content">
                  <strong>{deviceName}</strong>
                  <span>{getDeviceCode(device)}</span>
                  <em className={`device-map-label-status ${status}`}>
                    {statusLabel}
                  </em>
                </div>
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}

export default DeviceMap
