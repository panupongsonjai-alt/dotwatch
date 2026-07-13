import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'

const DEFAULT_CENTER = [13.7563, 100.5018]
const GROUP_DISTANCE_METERS = 5
const LABEL_COLLISION_DISTANCE_METERS = 250
const EARTH_RADIUS_METERS = 6371000
const STATUS_PRIORITY = {
  critical: 0,
  warning: 1,
  offline: 2,
  online: 3,
}
const TOOLTIP_DIRECTIONS = ['top', 'bottom', 'left', 'right']

function getStatus(device = {}) {
  return String(device.status || 'offline')
    .trim()
    .toLowerCase()
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

function getDistanceMeters(leftPosition, rightPosition) {
  const toRadians = (value) => (value * Math.PI) / 180
  const [leftLatitude, leftLongitude] = leftPosition
  const [rightLatitude, rightLongitude] = rightPosition
  const latitudeDelta = toRadians(rightLatitude - leftLatitude)
  const longitudeDelta = toRadians(rightLongitude - leftLongitude)
  const leftLatitudeRadians = toRadians(leftLatitude)
  const rightLatitudeRadians = toRadians(rightLatitude)

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitudeRadians) *
      Math.cos(rightLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

function groupDevicesByDistance(items) {
  const parents = items.map((_, index) => index)

  const find = (index) => {
    if (parents[index] !== index) parents[index] = find(parents[index])
    return parents[index]
  }

  const union = (leftIndex, rightIndex) => {
    const leftRoot = find(leftIndex)
    const rightRoot = find(rightIndex)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }

  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    if (!items[leftIndex].hasCoordinates) continue

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < items.length;
      rightIndex += 1
    ) {
      if (!items[rightIndex].hasCoordinates) continue

      if (
        getDistanceMeters(
          items[leftIndex].position,
          items[rightIndex].position
        ) <= GROUP_DISTANCE_METERS
      ) {
        union(leftIndex, rightIndex)
      }
    }
  }

  const groupedItems = new Map()
  items.forEach((item, index) => {
    const root = find(index)
    if (!groupedItems.has(root)) groupedItems.set(root, [])
    groupedItems.get(root).push(item)
  })

  return [...groupedItems.values()].map((group) => {
    const devices = group
      .map((item) => item.device)
      .sort((left, right) => {
        const statusDifference =
          (STATUS_PRIORITY[getStatus(left)] ?? 99) -
          (STATUS_PRIORITY[getStatus(right)] ?? 99)

        return (
          statusDifference ||
          getDeviceName(left).localeCompare(getDeviceName(right), 'th')
        )
      })

    const position = [
      group.reduce((sum, item) => sum + item.position[0], 0) / group.length,
      group.reduce((sum, item) => sum + item.position[1], 0) / group.length,
    ]

    return {
      devices,
      position,
      key: devices
        .map((device) => device.id || device.device_code || getDeviceName(device))
        .join('-'),
    }
  })
}

function addTooltipLayouts(groups) {
  const parents = groups.map((_, index) => index)

  const find = (index) => {
    if (parents[index] !== index) parents[index] = find(parents[index])
    return parents[index]
  }

  const union = (leftIndex, rightIndex) => {
    const leftRoot = find(leftIndex)
    const rightRoot = find(rightIndex)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }

  for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < groups.length;
      rightIndex += 1
    ) {
      if (
        getDistanceMeters(
          groups[leftIndex].position,
          groups[rightIndex].position
        ) <= LABEL_COLLISION_DISTANCE_METERS
      ) {
        union(leftIndex, rightIndex)
      }
    }
  }

  const collisionGroups = new Map()
  groups.forEach((group, index) => {
    const root = find(index)
    if (!collisionGroups.has(root)) collisionGroups.set(root, [])
    collisionGroups.get(root).push({ group, index })
  })

  const layouts = new Map()
  collisionGroups.forEach((items) => {
    items
      .sort((left, right) => {
        return (
          left.group.position[0] - right.group.position[0] ||
          left.group.position[1] - right.group.position[1]
        )
      })
      .forEach(({ index }, layoutIndex) => {
        const direction = TOOLTIP_DIRECTIONS[layoutIndex % TOOLTIP_DIRECTIONS.length]
        const tier = Math.floor(layoutIndex / TOOLTIP_DIRECTIONS.length)
        const distance = 16 + tier * 34
        const offsets = {
          top: [0, -distance],
          bottom: [0, distance],
          left: [-distance, 0],
          right: [distance, 0],
        }

        layouts.set(index, { direction, offset: offsets[direction] })
      })
  })

  return groups.map((group, index) => ({
    ...group,
    tooltipLayout: layouts.get(index) || {
      direction: 'top',
      offset: [0, -16],
    },
  }))
}

function createDeviceIcon(devices) {
  const primaryDevice = devices[0]
  const status = getStatus(primaryDevice)
  const color = getStatusColor(status)

  if (devices.length > 1) {
    const statuses = [...new Set(devices.map(getStatus))]
    const statusDots = statuses
      .map(
        (groupStatus) =>
          `<i style="background:${getStatusColor(groupStatus)}"></i>`
      )
      .join('')

    return L.divIcon({
      className: 'device-map-marker-shell device-map-marker-shell-group',
      html: `
        <span class="device-map-marker-group">
          <span class="device-map-marker-group-statuses">${statusDots}</span>
          <b>${devices.length}</b>
        </span>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    })
  }

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
      hasCoordinates: isValidCoordinate(device.latitude, device.longitude),
    }))
  }, [visibleDevices])

  const deviceGroups = useMemo(
    () => addTooltipLayouts(groupDevicesByDistance(devicesWithPositions)),
    [devicesWithPositions]
  )

  const positions = useMemo(
    () => deviceGroups.map((group) => group.position),
    [deviceGroups]
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

        {deviceGroups.map(
          ({ devices: groupedDevices, key, position, tooltipLayout }) => {
          const isGroup = groupedDevices.length > 1
          const firstDevice = groupedDevices[0]

          return (
            <Marker
              key={key}
              position={position}
              icon={createDeviceIcon(groupedDevices)}
              eventHandlers={
                !isGroup && typeof onOpenDevice === 'function'
                  ? {
                      click: () => onOpenDevice(firstDevice.id),
                    }
                  : undefined
              }
            >
              <Tooltip
                permanent
                direction={tooltipLayout.direction}
                offset={tooltipLayout.offset}
                opacity={1}
                className="device-map-label"
                interactive={isGroup && typeof onOpenDevice === 'function'}
              >
                <div
                  className={`device-map-label-content ${
                    isGroup ? 'device-map-label-group' : ''
                  }`}
                >
                  {isGroup && (
                    <span className="device-map-label-group-count">
                      {groupedDevices.length} devices · within {GROUP_DISTANCE_METERS} m
                    </span>
                  )}

                  {groupedDevices.map((device) => {
                    const deviceName = getDeviceName(device)
                    const deviceStatus = getStatus(device)

                    return isGroup ? (
                      <button
                        key={device.id || device.device_code || deviceName}
                        type="button"
                        className="device-map-label-row"
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenDevice?.(device.id)
                        }}
                      >
                        <span
                          className="device-map-label-status-dot"
                          style={{ backgroundColor: getStatusColor(deviceStatus) }}
                        />
                        <strong>{deviceName}</strong>
                        <em>{deviceStatus}</em>
                      </button>
                    ) : (
                      <strong key={device.id || device.device_code || deviceName}>
                        {deviceName}
                      </strong>
                    )
                  })}
                </div>
              </Tooltip>
            </Marker>
          )
          }
        )}
      </MapContainer>
    </div>
  )
}

export default DeviceMap
